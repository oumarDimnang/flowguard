"""The live reasoning trace — the agent's thinking, streamed while it happens.

The assessment activity already returns ``graphTrace`` and ``toolCalls`` when it
finishes, and the workflow records them on the CRITICALITY_ASSESSED step. That
is the durable, audited version. But it arrives as one batch, after the model
has finished — and the model can take tens of seconds. While it thinks, the
dashboard shows nothing, and then the whole path lands at once.

This module is the other half: every graph node and every tool call is pushed
to the server the moment it happens, so the dashboard can light the reasoning
graph node by node. It is deliberately ephemeral — nothing here is persisted,
and the audited record is still the one the workflow emits. A page refreshed
mid-assessment loses the intermediate events and gets the final record a few
seconds later, which is the right trade for a trace that must never slow the
assessment down or fail it.

Non-fatal by construction. The first failure disables the sink for the rest of
the assessment, so a server that is down costs one short timeout, not one per
node. Runs only inside a Temporal activity, never in workflow code.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from ..tools.network_tools import ToolCall

logger = logging.getLogger(__name__)

#: Event kinds. Mirrored by ``ReasoningTraceDto`` on the server and
#: ``ReasoningTraceKind`` in the client — a cross-language contract.
NODE_STARTED = "node_started"
NODE_FINISHED = "node_finished"
TOOL_STARTED = "tool_started"
TOOL_FINISHED = "tool_finished"


class ReasoningTraceSink(ABC):
    """Where live reasoning events go.

    Also satisfies :class:`~flowguard_agent.tools.network_tools.ToolObserver`,
    so one object can be handed to both the graph state and the toolbox and
    every tool call the model makes lands in the same stream as the nodes.
    """

    @abstractmethod
    async def emit(
        self,
        kind: str,
        node: str,
        detail: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None: ...

    async def close(self) -> None:
        """Release anything held open. Safe to call more than once."""
        return

    # ── ToolObserver ──────────────────────────────────────────────────

    async def tool_started(self, name: str, arguments: dict[str, Any]) -> None:
        await self.emit(TOOL_STARTED, name, data={"arguments": arguments})

    async def tool_finished(self, call: ToolCall) -> None:
        await self.emit(
            TOOL_FINISHED,
            call.name,
            detail=call.result,
            data={"arguments": call.arguments, "result": call.result, "failed": call.failed},
        )


class NullTraceSink(ReasoningTraceSink):
    """No streaming. The default when no server is configured."""

    async def emit(
        self,
        kind: str,
        node: str,
        detail: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        return None


class RecordingTraceSink(ReasoningTraceSink):
    """Keeps every event in memory. For tests, and for anything offline."""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.closed = False

    async def emit(
        self,
        kind: str,
        node: str,
        detail: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        self.events.append(
            {
                "seq": len(self.events) + 1,
                "kind": kind,
                "node": node,
                "detail": detail,
                "data": data,
            }
        )

    async def close(self) -> None:
        self.closed = True


class HttpTraceSink(ReasoningTraceSink):
    """POSTs each event to the FlowGuard server, which fans it out on the socket.

    Sequential and awaited rather than fire-and-forget: on localhost a POST is
    a few milliseconds, and ordering by ``seq`` is simpler to reason about than
    a queue of background tasks that must be drained before the activity
    returns. The cost of a *down* server is bounded by disabling after the
    first failure.
    """

    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        organization_id: str,
        operation_id: str,
        workflow_id: str | None = None,
        run_id: str | None = None,
        timeout_seconds: float = 1.5,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = f"{base_url.rstrip('/')}/internal/reasoning"
        self._headers = {"Authorization": f"Bearer {token}"}
        self._organization_id = organization_id
        self._operation_id = operation_id
        self._workflow_id = workflow_id
        self._run_id = run_id
        self._timeout = timeout_seconds
        self._transport = transport
        self._client: httpx.AsyncClient | None = None
        self._seq = 0
        self._disabled = False

    async def emit(
        self,
        kind: str,
        node: str,
        detail: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        if self._disabled:
            return

        self._seq += 1
        payload: dict[str, Any] = {
            "organizationId": self._organization_id,
            "operationId": self._operation_id,
            "seq": self._seq,
            "kind": kind,
            "node": node,
            "occurredAt": datetime.now(UTC).isoformat(),
        }
        if self._workflow_id:
            payload["workflowId"] = self._workflow_id
        if self._run_id:
            payload["runId"] = self._run_id
        if detail is not None:
            payload["detail"] = detail
        if data:
            payload["data"] = data

        try:
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self._timeout, transport=self._transport)
            response = await self._client.post(self._url, json=payload, headers=self._headers)
            response.raise_for_status()
        except Exception as exc:  # noqa: BLE001 - tracing must never fail the assessment
            self._disabled = True
            logger.warning(
                "Live reasoning trace disabled for %s after a failed emit: %s",
                self._operation_id,
                exc,
            )

    async def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            await client.aclose()


#: Builds one sink per assessment. Arguments: organization id, operation id,
#: workflow id, run id — the last two are None when there is no activity
#: context, as in a direct unit test.
TraceSinkFactory = Callable[[str, str, str | None, str | None], ReasoningTraceSink]


def http_trace_sink_factory(*, base_url: str, token: str) -> TraceSinkFactory:
    """A factory bound to one server, for the worker to hand the activity."""

    def build(
        organization_id: str,
        operation_id: str,
        workflow_id: str | None,
        run_id: str | None,
    ) -> ReasoningTraceSink:
        return HttpTraceSink(
            base_url=base_url,
            token=token,
            organization_id=organization_id,
            operation_id=operation_id,
            workflow_id=workflow_id,
            run_id=run_id,
        )

    return build
