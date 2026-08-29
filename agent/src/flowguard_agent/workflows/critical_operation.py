"""The operation lifecycle: observe → understand → decide → allocate → monitor → release.

Everything in this file is replayed by Temporal to rebuild state after a crash,
so it must be deterministic. No I/O, no clock reads other than
``workflow.now()``, no randomness — all of that lives in activities.

Activities are invoked by name rather than imported, which keeps LangChain,
httpx and the Nokia SDK out of the workflow sandbox entirely.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    # Pure, deterministic modules. Passed through so the sandbox does not
    # reload them on every replay.
    from ..policy.rules import PolicyConfig, decide
    from ..shared.constants import (
        ACTIVITY_ALLOCATE,
        ACTIVITY_ASSESS_CRITICALITY,
        ACTIVITY_CHECK_DEVICE_STATUS,
        ACTIVITY_EMIT_DECISION,
        ACTIVITY_EXTEND_QOD,
        ACTIVITY_POLL_QOD,
        ACTIVITY_QUERY_CONGESTION,
        ACTIVITY_RELEASE,
        SIGNAL_CONGESTION_UPDATED,
        SIGNAL_DEVICE_STATUS_CHANGED,
        SIGNAL_OPERATION_COMPLETED,
        SIGNAL_QOD_STATUS_CHANGED,
        WORKFLOW_CRITICAL_OPERATION,
    )
    from ..shared.models import (
        CongestionLevel,
        Criticality,
        DecisionStep,
        NetworkAction,
        QosStatus,
    )

# ── Retry policies ────────────────────────────────────────────────────
# Read paths fail fast: a stale congestion reading is worse than none.
_READ_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=1))

# The model call gets fewer attempts but more time.
_REASONING_RETRY = RetryPolicy(maximum_attempts=2, initial_interval=timedelta(seconds=2))

_ALLOCATE_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=1))

# Release is the activity that costs real money when it fails, and a slice
# attachment has no TTL to clean up after it. It gets the most persistence.
_RELEASE_RETRY = RetryPolicy(
    maximum_attempts=10,
    initial_interval=timedelta(seconds=1),
    maximum_interval=timedelta(seconds=30),
)

# The audit trail must not be able to block the network decision.
_EMIT_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=1))

#: Extra headroom on the requested QoD duration, so a slightly long operation
#: does not need an immediate extension.
_DURATION_GRACE_SECONDS = 60

#: How long to wait for QoD to move REQUESTED → AVAILABLE before polling.
_QOS_CONFIRM_TIMEOUT_SECONDS = 10

#: Safety valve. If no completion signal ever arrives, release anyway rather
#: than holding paid capacity forever.
_MAX_OPERATION_MULTIPLIER = 4


@workflow.defn(name=WORKFLOW_CRITICAL_OPERATION)
class CriticalOperationWorkflow:
    """One critical operation, from business event to released connectivity."""

    def __init__(self) -> None:
        self._completed = False
        self._qos_status: str | None = None
        self._qos_status_info: str | None = None
        self._latest_congestion: str | None = None
        self._device_reachable: bool | None = None
        self._state: dict[str, Any] = {"status": "PENDING"}

    # ── Signals ───────────────────────────────────────────────────────

    @workflow.signal(name=SIGNAL_OPERATION_COMPLETED)
    def operation_completed(self) -> None:
        """The facility reports the operation has finished."""
        self._completed = True

    @workflow.signal(name=SIGNAL_QOD_STATUS_CHANGED)
    def qod_status_changed(self, payload: dict[str, Any]) -> None:
        """Relayed CAMARA QoD callback (REQUESTED → AVAILABLE / UNAVAILABLE)."""
        self._qos_status = payload.get("qosStatus")
        self._qos_status_info = payload.get("statusInfo")

    @workflow.signal(name=SIGNAL_CONGESTION_UPDATED)
    def congestion_updated(self, payload: dict[str, Any]) -> None:
        self._latest_congestion = payload.get("level")

    @workflow.signal(name=SIGNAL_DEVICE_STATUS_CHANGED)
    def device_status_changed(self, payload: dict[str, Any]) -> None:
        self._device_reachable = payload.get("reachable")

    @workflow.query(name="get_state")
    def get_state(self) -> dict[str, Any]:
        return self._state

    # ── Main ──────────────────────────────────────────────────────────

    @workflow.run
    async def run(self, event: dict[str, Any]) -> dict[str, Any]:
        operation_id = event["id"]
        device = event["device"]
        expected_duration = int(event.get("expectedDurationSeconds") or 60)

        self._state = {"status": "ASSESSING", "operationId": operation_id}

        # 1 ── Guard clause. Cheapest check first: never spend money on a
        #      device that is not on the network.
        status = await workflow.execute_activity(
            ACTIVITY_CHECK_DEVICE_STATUS,
            device,
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=_READ_RETRY,
        )
        reachable = bool(status.get("reachable"))
        await self._emit(operation_id, DecisionStep.DEVICE_CHECKED, deviceReachable=reachable)

        if not reachable:
            return await self._finish_without_allocation(
                operation_id,
                criticality=None,
                congestion=None,
                reachable=False,
                reasoning="Device is not reachable on the network; no allocation attempted.",
                rule="GUARD_DEVICE_UNREACHABLE",
            )

        # 2 ── Network risk signal. An input to the decision, never the trigger.
        congestion_result = await workflow.execute_activity(
            ACTIVITY_QUERY_CONGESTION,
            device,
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=_READ_RETRY,
        )
        congestion = CongestionLevel(congestion_result["level"])
        await self._emit(
            operation_id, DecisionStep.CONGESTION_CHECKED, congestion=congestion.value
        )

        # 3 ── The judgement. This is the only step a model is involved in, and
        #      it returns criticality only — never a network action.
        assessment = await workflow.execute_activity(
            ACTIVITY_ASSESS_CRITICALITY,
            event,
            start_to_close_timeout=timedelta(seconds=90),
            retry_policy=_REASONING_RETRY,
        )
        criticality = Criticality(assessment["criticality"])
        safety_critical = bool(assessment.get("safetyCritical"))

        await self._emit(
            operation_id,
            DecisionStep.CRITICALITY_ASSESSED,
            criticality=criticality.value,
            criticalityConfidence=assessment.get("confidence"),
            reasoning=assessment.get("reasoning"),
        )

        # 4 ── The decision. A pure function, deliberately deterministic: the
        #      model explains, the rules decide.
        policy = decide(
            criticality=criticality,
            congestion=congestion,
            device_reachable=True,
            safety_critical=safety_critical,
            slice_available=True,
            config=PolicyConfig(),
        )

        await self._emit(
            operation_id,
            DecisionStep.DECIDED,
            criticality=criticality.value,
            congestion=congestion.value,
            deviceReachable=True,
            action=policy.action.value,
            reasoning=f"{assessment.get('reasoning', '')} — {policy.rationale}".strip(" —"),
        )

        if policy.action is NetworkAction.NONE:
            self._state = {"status": "COMPLETED", "action": "NONE"}
            return {
                "operationId": operation_id,
                "action": NetworkAction.NONE.value,
                "criticality": criticality.value,
                "congestion": congestion.value,
                "deviceReachable": True,
                "reasoning": policy.rationale,
                "rule": policy.rule,
                "released": False,
            }

        # 5 ── Allocate, then guarantee release no matter how this ends.
        allocation: dict[str, Any] = {}
        try:
            allocation = await workflow.execute_activity(
                ACTIVITY_ALLOCATE,
                {
                    "device": device,
                    "action": policy.action.value,
                    "durationSeconds": expected_duration + _DURATION_GRACE_SECONDS,
                    "sinkUrl": event.get("sinkUrl"),
                },
                start_to_close_timeout=timedelta(seconds=45),
                retry_policy=_ALLOCATE_RETRY,
            )

            self._qos_status = allocation.get("qosStatus")
            self._state = {"status": "ALLOCATED", "action": policy.action.value}

            await self._emit(
                operation_id,
                DecisionStep.ALLOCATED,
                action=policy.action.value,
                qodSessionId=allocation.get("qodSessionId"),
                qosStatus=allocation.get("qosStatus"),
                sliceId=allocation.get("sliceId"),
            )

            await self._confirm_qos_available(operation_id, allocation)
            await self._monitor(operation_id, allocation, expected_duration)

        finally:
            # The release guarantee. Runs on success, on failure, and on
            # cancellation — and Temporal will re-run it after a worker crash.
            await self._release(operation_id, allocation)

        return {
            "operationId": operation_id,
            "action": policy.action.value,
            "criticality": criticality.value,
            "congestion": congestion.value,
            "deviceReachable": True,
            "reasoning": policy.rationale,
            "rule": policy.rule,
            "qodSessionId": allocation.get("qodSessionId"),
            "sliceId": allocation.get("sliceId"),
            "released": True,
        }

    # ── Phases ────────────────────────────────────────────────────────

    async def _confirm_qos_available(
        self, operation_id: str, allocation: dict[str, Any]
    ) -> None:
        """Wait for the session to actually become AVAILABLE.

        QoD is asynchronous. The webhook relayed as a signal is the fast path;
        polling is the fallback for when no callback arrives, which is common in
        sandbox environments.
        """
        session_id = allocation.get("qodSessionId")
        if not session_id:
            return

        try:
            await workflow.wait_condition(
                lambda: self._qos_status
                in (QosStatus.AVAILABLE.value, QosStatus.UNAVAILABLE.value),
                timeout=timedelta(seconds=_QOS_CONFIRM_TIMEOUT_SECONDS),
            )
        except TimeoutError:
            polled = await workflow.execute_activity(
                ACTIVITY_POLL_QOD,
                session_id,
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=_READ_RETRY,
            )
            self._qos_status = polled.get("qosStatus")

        await self._emit(
            operation_id,
            DecisionStep.QOS_STATUS_CHANGED,
            qodSessionId=session_id,
            qosStatus=self._qos_status,
            qosStatusInfo=self._qos_status_info,
        )

        if self._qos_status == QosStatus.AVAILABLE.value:
            self._state = {"status": "MONITORING", "qosStatus": self._qos_status}

    async def _monitor(
        self, operation_id: str, allocation: dict[str, Any], expected_duration: int
    ) -> None:
        """Hold the guarantee until the operation reports completion.

        Extends in place if the operation overruns, and gives up after a bounded
        multiple of the expected duration so a lost completion signal cannot
        leave capacity held indefinitely.
        """
        session_id = allocation.get("qodSessionId")
        max_wait = expected_duration * _MAX_OPERATION_MULTIPLIER
        waited = 0
        chunk = max(expected_duration, 30)

        while not self._completed and waited < max_wait:
            try:
                await workflow.wait_condition(
                    lambda: self._completed, timeout=timedelta(seconds=chunk)
                )
                break
            except TimeoutError:
                waited += chunk
                if session_id and waited < max_wait:
                    workflow.logger.info(
                        "Operation %s running long; extending QoD", operation_id
                    )
                    await workflow.execute_activity(
                        ACTIVITY_EXTEND_QOD,
                        {"qodSessionId": session_id, "additionalSeconds": chunk},
                        start_to_close_timeout=timedelta(seconds=20),
                        retry_policy=_ALLOCATE_RETRY,
                    )

        if not self._completed:
            workflow.logger.warning(
                "Operation %s never reported completion; releasing on safety valve",
                operation_id,
            )

    async def _release(self, operation_id: str, allocation: dict[str, Any]) -> None:
        if not allocation.get("qodSessionId") and not allocation.get("attachmentId"):
            return

        self._state = {"status": "RELEASING"}

        result = await workflow.execute_activity(
            ACTIVITY_RELEASE,
            {
                "qodSessionId": allocation.get("qodSessionId"),
                "sliceId": allocation.get("sliceId"),
                "attachmentId": allocation.get("attachmentId"),
            },
            start_to_close_timeout=timedelta(seconds=45),
            retry_policy=_RELEASE_RETRY,
        )

        self._state = {"status": "COMPLETED", "released": True}

        await self._emit(
            operation_id,
            DecisionStep.RELEASED,
            qodSessionId=allocation.get("qodSessionId"),
            sliceId=allocation.get("sliceId"),
            reasoning="Operation complete; enhanced connectivity released.",
            **{"qosStatus": QosStatus.UNAVAILABLE.value} if result.get("qodReleased") else {},
        )

    # ── Helpers ───────────────────────────────────────────────────────

    async def _finish_without_allocation(
        self,
        operation_id: str,
        *,
        criticality: Criticality | None,
        congestion: CongestionLevel | None,
        reachable: bool,
        reasoning: str,
        rule: str,
    ) -> dict[str, Any]:
        await self._emit(
            operation_id,
            DecisionStep.DECIDED,
            action=NetworkAction.NONE.value,
            deviceReachable=reachable,
            reasoning=reasoning,
        )
        self._state = {"status": "COMPLETED", "action": "NONE"}
        return {
            "operationId": operation_id,
            "action": NetworkAction.NONE.value,
            "criticality": criticality.value if criticality else None,
            "congestion": congestion.value if congestion else None,
            "deviceReachable": reachable,
            "reasoning": reasoning,
            "rule": rule,
            "released": False,
        }

    async def _emit(self, operation_id: str, step: DecisionStep, **fields: Any) -> None:
        """Record one decision event.

        Deliberately non-fatal. A dashboard that is down must not stop the agent
        from protecting a crane — the network decision matters more than the
        audit trail, so this logs and continues after retries are exhausted.
        """
        info = workflow.info()
        payload = {
            "operationId": operation_id,
            "workflowId": info.workflow_id,
            "runId": info.run_id,
            "step": step.value,
            "occurredAt": workflow.now().isoformat(),
            **{k: v for k, v in fields.items() if v is not None},
        }

        try:
            await workflow.execute_activity(
                ACTIVITY_EMIT_DECISION,
                payload,
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=_EMIT_RETRY,
            )
        except Exception:  # noqa: BLE001 - audit must never block protection
            workflow.logger.warning("Failed to emit %s for %s", step.value, operation_id)
