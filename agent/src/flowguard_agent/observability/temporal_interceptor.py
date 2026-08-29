"""Temporal interceptor that records every activity as a Langfuse span.

An interceptor rather than a decorator on each activity, for two reasons: it
covers activities added later without anyone remembering to annotate them, and
it keeps observability out of the business code entirely.

Each workflow run becomes one Langfuse trace. Each activity execution becomes a
span in it, carrying its duration, inputs, outputs, retry attempt, and — for the
assessment activity — the nested LLM generation with its token count and cost.
"""

from __future__ import annotations

import logging
from typing import Any

from temporalio.activity import info as activity_info
from temporalio.worker import (
    ActivityInboundInterceptor,
    ExecuteActivityInput,
    Interceptor,
)

from .langfuse_setup import get_langfuse, start_span, trace_id_for_run

logger = logging.getLogger(__name__)

#: Activity payloads can be large. Truncate rather than shipping a whole
#: business event with every span.
_MAX_VALUE_CHARS = 4_000


def _summarise(value: Any) -> Any:
    """Render an activity argument or result for the trace, bounded in size."""
    if value is None or isinstance(value, bool | int | float):
        return value

    text = str(value)
    if len(text) <= _MAX_VALUE_CHARS:
        return value
    return f"{text[:_MAX_VALUE_CHARS]}… [{len(text)} chars total]"


class LangfuseActivityInterceptor(ActivityInboundInterceptor):
    async def execute_activity(self, input: ExecuteActivityInput) -> Any:
        client = get_langfuse()
        if client is None:
            return await self.next.execute_activity(input)

        try:
            info = activity_info()
        except RuntimeError:
            # Not in an activity context; nothing sensible to attach to.
            return await self.next.execute_activity(input)

        # Everything that touches the SDK lives inside this block. Deriving the
        # trace id is an SDK call too, and a tracing failure must never be able
        # to fail an activity — least of all `release`, which holds paid
        # network capacity.
        try:
            trace_id = trace_id_for_run(info.workflow_run_id)
            span_ctx = start_span(
                client,
                name=info.activity_type,
                trace_id=trace_id,
                input={"args": [_summarise(a) for a in input.args]},
                metadata={
                    "workflow_id": info.workflow_id,
                    "workflow_run_id": info.workflow_run_id,
                    "workflow_type": info.workflow_type,
                    "activity_id": info.activity_id,
                    "activity_type": info.activity_type,
                    # Attempt > 1 means Temporal retried this — visible in the
                    # trace, which is usually the first clue something is wrong.
                    "attempt": info.attempt,
                    "task_queue": info.task_queue,
                },
            )
        except Exception as exc:  # noqa: BLE001 - tracing must never be fatal
            logger.debug("Could not open Langfuse span: %s", exc)
            return await self.next.execute_activity(input)

        with span_ctx as span:
            try:
                result = await self.next.execute_activity(input)
            except Exception as exc:
                # Record the failure on the span, then let Temporal handle the
                # retry as it normally would.
                try:
                    span.update(
                        output={"error": f"{type(exc).__name__}: {exc}"},
                        level="ERROR",
                        status_message=str(exc)[:500],
                    )
                except Exception as span_exc:  # noqa: BLE001
                    logger.debug("Could not record span failure: %s", span_exc)
                raise

            try:
                span.update(output=_summarise(result))
            except Exception as span_exc:  # noqa: BLE001
                logger.debug("Could not record span output: %s", span_exc)

            return result


class LangfuseInterceptor(Interceptor):
    """Worker-level interceptor. Register on the Worker to enable tracing."""

    def intercept_activity(
        self, next: ActivityInboundInterceptor
    ) -> ActivityInboundInterceptor:
        interceptor = LangfuseActivityInterceptor(next)
        return interceptor
