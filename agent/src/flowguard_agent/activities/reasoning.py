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

from ..network.provider import NetworkProvider
from ..shared.constants import ACTIVITY_ASSESS_CRITICALITY
from ..shared.models import BusinessEvent
from ..tools.network_tools import NetworkToolbox

logger = logging.getLogger(__name__)


class ReasoningActivities:
    def __init__(self, graph, provider: NetworkProvider) -> None:
        self._graph = graph
        self._provider = provider

    @activity.defn(name=ACTIVITY_ASSESS_CRITICALITY)
    async def assess_criticality(self, event_raw: dict[str, Any]) -> dict[str, Any]:
        """Classify how business-critical an operation is.

        Returns criticality only. The decision about what the network should do
        is made by deterministic rules downstream — a model is never allowed to
        choose whether to attach a network slice.
        """
        event = BusinessEvent.from_wire(event_raw)

        # Tools are bound to this operation's device: the agent chooses which
        # signal to read, never which device to interrogate.
        toolbox = NetworkToolbox(self._provider, event.device)

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
            }
        )

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
