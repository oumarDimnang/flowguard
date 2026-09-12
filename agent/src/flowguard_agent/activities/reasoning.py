"""The criticality assessment activity — where the AI agent layer runs.

The LangGraph assessment graph is invoked from inside a Temporal activity, never
from workflow code. That placement is not stylistic: Temporal replays workflow
functions to rebuild state, so anything non-deterministic — and a language model
is the textbook example — must be recorded once in an activity instead.
"""

from __future__ import annotations

import logging
from typing import Any

from temporalio import activity

from ..graph.trace_sink import NullTraceSink, ReasoningTraceSink, TraceSinkFactory
from ..network.provider import NetworkProvider
from ..shared.constants import ACTIVITY_ASSESS_CRITICALITY
from ..shared.models import BusinessEvent
from ..tools.network_tools import NetworkToolbox

logger = logging.getLogger(__name__)


class ReasoningActivities:
    def __init__(
        self,
        graph,
        provider: NetworkProvider,
        trace_sink_factory: TraceSinkFactory | None = None,
    ) -> None:
        self._graph = graph
        self._provider = provider
        # Optional: with no factory the graph runs unobserved, exactly as it
        # did before live tracing existed. The verdict is identical either way.
        self._trace_sink_factory = trace_sink_factory

    @activity.defn(name=ACTIVITY_ASSESS_CRITICALITY)
    async def assess_criticality(self, event_raw: dict[str, Any]) -> dict[str, Any]:
        """Classify how business-critical an operation is.

        Returns criticality only. The decision about what the network should do
        is made by deterministic rules downstream — a model is never allowed to
        choose whether to attach a network slice.
        """
        event = BusinessEvent.from_wire(event_raw)

        # One sink per assessment, shared by the graph nodes and the toolbox,
        # so node events and the tool calls made inside them arrive as a single
        # ordered stream.
        sink = self._sink_for(event)

        # Tools are bound to this operation's device: the agent chooses which
        # signal to read, never which device to interrogate.
        toolbox = NetworkToolbox(self._provider, event.device, observer=sink)

        try:
            result = await self._graph.ainvoke(
                {
                    "event": event,
                    "context": None,
                    "assessment": None,
                    "attempts": 0,
                    "model": None,
                    "enriched": False,
                    "toolbox": toolbox,
                    "evidence": None,
                    "trace": [],
                    "sink": sink,
                }
            )
        finally:
            await sink.close()

        assessment = result["assessment"]
        trace: list[str] = result.get("trace", [])

        logger.info(
            "Assessed %s: %s (confidence %.2f, %d graph steps)",
            event.id,
            assessment.criticality.value,
            assessment.confidence,
            len(trace),
        )

        return {
            "criticality": assessment.criticality.value,
            "confidence": assessment.confidence,
            "reasoning": assessment.reasoning,
            "safetyCritical": assessment.safety_critical,
            "model": assessment.model,
            "escalated": assessment.escalated,
            # The path the graph took, shown alongside the reasoning so the
            # dashboard can evidence *how* the judgement was reached.
            "graphTrace": trace,
            # Which network APIs the agent chose to call, and what they said.
            "toolCalls": [
                {"name": c.name, "arguments": c.arguments, "result": c.result, "failed": c.failed}
                for c in (getattr(result.get("evidence"), "tool_calls", None) or [])
            ],
        }

    def _sink_for(self, event: BusinessEvent) -> ReasoningTraceSink:
        if self._trace_sink_factory is None:
            return NullTraceSink()

        # Present inside a Temporal activity; absent when the method is called
        # directly, as a unit test does. The trace is still worth streaming
        # without them — the operation id is what the dashboard correlates on.
        workflow_id: str | None = None
        run_id: str | None = None
        try:
            info = activity.info()
            workflow_id, run_id = info.workflow_id, info.workflow_run_id
        except RuntimeError:
            pass

        return self._trace_sink_factory(event.organization_id, event.id, workflow_id, run_id)
