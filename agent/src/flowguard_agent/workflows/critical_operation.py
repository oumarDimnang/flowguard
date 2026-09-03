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
        ACTIVITY_ESCALATE_TO_SLICE,
        ACTIVITY_EXTEND_QOD,
        ACTIVITY_GET_POLICY_CONFIG,
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

        # Read once, recorded in history here — never live inside workflow
        # code, since a value that could change between the original run and
        # a later replay (an operator edits .env and restarts the worker)
        # would make that replay diverge from what actually happened.
        policy_config_raw = await workflow.execute_activity(
            ACTIVITY_GET_POLICY_CONFIG,
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=_READ_RETRY,
        )
        policy_config = PolicyConfig(
            always_protect_safety_critical=bool(
                policy_config_raw.get("alwaysProtectSafetyCritical")
            )
        )
        fail_open = policy_config_raw.get("failOpen", True)

        # 3 ── The judgement. This is the only step a model is involved in, and
        #      it returns criticality only — never a network action.
        try:
            assessment = await workflow.execute_activity(
                ACTIVITY_ASSESS_CRITICALITY,
                event,
                start_to_close_timeout=timedelta(seconds=90),
                retry_policy=_REASONING_RETRY,
            )
            criticality = Criticality(assessment["criticality"])
            safety_critical = bool(assessment.get("safetyCritical"))
            assessment_error: str | None = None
        except Exception as exc:  # noqa: BLE001 - a decision, not a crash, either way
            # The open decision (CLAUDE.md §10): assessment failing outright is
            # not allowed to fail the *operation* outright. Fail open treats
            # the unknown as HIGH/safety-critical (protect, spend, bounded by
            # the QoD duration TTL); fail closed treats it as LOW (save,
            # leave exposed). Either way it is a real, audited decision, not
            # a crash with no policy applied at all.
            criticality = Criticality.HIGH if fail_open else Criticality.LOW
            safety_critical = fail_open
            assessment = {
                "reasoning": (
                    f"Criticality assessment failed after retries ({exc}); "
                    f"failing {'open (protect by default)' if fail_open else 'closed (standard connectivity)'} "
                    "per POLICY_FAIL_OPEN."
                )
            }
            assessment_error = str(exc)

        await self._emit(
            operation_id,
            DecisionStep.CRITICALITY_ASSESSED,
            criticality=criticality.value,
            criticalityConfidence=assessment.get("confidence"),
            reasoning=assessment.get("reasoning"),
            # The graph's own path and any evidence it gathered — dropped
            # here previously, even though the activity always returned
            # them, which made the agent's reasoning invisible to any UI.
            graphTrace=assessment.get("graphTrace"),
            toolCalls=assessment.get("toolCalls"),
            error=assessment_error,
        )

        # 4 ── The decision. A pure function, deliberately deterministic: the
        #      model explains, the rules decide.
        policy = decide(
            criticality=criticality,
            congestion=congestion,
            device_reachable=True,
            safety_critical=safety_critical,
            slice_available=True,
            config=policy_config,
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

            # Captured now, before any further await — a congestion_updated
            # signal delivered while allocation was in flight is folded into
            # this baseline; anything after this point is a genuine, newly
            # observable change for _monitor to react to.
            congestion_baseline = self._latest_congestion

            await self._emit(
                operation_id,
                DecisionStep.ALLOCATED,
                action=policy.action.value,
                qodSessionId=allocation.get("qodSessionId"),
                qosStatus=allocation.get("qosStatus"),
                sliceId=allocation.get("sliceId"),
            )

            await self._confirm_qos_available(operation_id, allocation)
            await self._monitor(
                operation_id,
                device,
                allocation,
                policy.action,
                expected_duration,
                criticality,
                safety_critical,
                congestion_baseline,
                policy_config,
            )

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
        self,
        operation_id: str,
        device: dict[str, Any],
        allocation: dict[str, Any],
        action: NetworkAction,
        expected_duration: int,
        criticality: Criticality,
        safety_critical: bool,
        congestion_baseline: str | None,
        policy_config: PolicyConfig,
    ) -> None:
        """Hold the guarantee until the operation reports completion.

        Extends in place if the operation overruns, and gives up after a bounded
        multiple of the expected duration so a lost completion signal cannot
        leave capacity held indefinitely.

        Also wakes on every ``congestion_updated`` signal and re-runs the
        policy against it. Correct for a fixed-position asset is not correct
        for one that moves — the conditions a drone sees at minute eight can
        differ from what it saw at minute zero. Only ever an *upgrade*, QoD to
        a dedicated slice: de-escalation is never automatic. Revoking
        protection from an operation already underway is not a call this
        system makes on its own; a value left on the table is safer than a
        guarantee withdrawn mid-flight.

        ``congestion_baseline`` is captured by the caller immediately after
        allocation, not re-read here — reading ``self._latest_congestion``
        fresh at this point would miss a signal delivered while
        ``_confirm_qos_available`` was still waiting, since it would already
        look like "no change" against a baseline taken this late.
        """
        session_id = allocation.get("qodSessionId")
        known_congestion = congestion_baseline
        max_wait = expected_duration * _MAX_OPERATION_MULTIPLIER
        waited = 0
        chunk = max(expected_duration, 30)

        while not self._completed and waited < max_wait:
            try:
                await workflow.wait_condition(
                    lambda kc=known_congestion: self._completed or self._latest_congestion != kc,
                    timeout=timedelta(seconds=chunk),
                )
                if self._completed:
                    break

                # Woke early because a congestion signal arrived, not because
                # the operation finished — re-decide before waiting again.
                known_congestion = self._latest_congestion
                action = await self._reassess_congestion(
                    operation_id,
                    device,
                    allocation,
                    action,
                    criticality,
                    safety_critical,
                    known_congestion,
                    policy_config,
                )
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

    async def _reassess_congestion(
        self,
        operation_id: str,
        device: dict[str, Any],
        allocation: dict[str, Any],
        action: NetworkAction,
        criticality: Criticality,
        safety_critical: bool,
        congestion_value: str | None,
        policy_config: PolicyConfig,
    ) -> NetworkAction:
        """Re-run the policy against updated congestion. Escalate only.

        Two reachable cases, both handled the same way — attempt the slice
        attachment the operation is missing:

        - The original decision already wanted ``QOD_AND_SLICE``, but a slice
          takes minutes to provision (CLAUDE.md §5) and was not ready at
          allocation time, so the operation is running on plain QoD instead.
          Each congestion signal is a natural tick to retry.
        - Rising congestion now makes ``decide()`` want a slice it did not
          need before.

        Never de-escalates: revoking protection from an operation already
        under way is not a call this system makes on its own. Returns the
        (possibly unchanged) action currently in force.
        """
        if not congestion_value or allocation.get("sliceId"):
            return action

        wants_slice = action is NetworkAction.QOD_AND_SLICE
        if not wants_slice:
            policy = decide(
                criticality=criticality,
                congestion=CongestionLevel(congestion_value),
                device_reachable=True,
                safety_critical=safety_critical,
                slice_available=True,
                config=policy_config,
            )
            wants_slice = policy.action is NetworkAction.QOD_AND_SLICE

        if not wants_slice:
            return action

        attachment = await workflow.execute_activity(
            ACTIVITY_ESCALATE_TO_SLICE,
            {"device": device},
            start_to_close_timeout=timedelta(seconds=45),
            retry_policy=_ALLOCATE_RETRY,
        )
        if attachment.get("sliceUnavailable"):
            # Still not ready (or genuinely unsupported) — try again on the
            # next signal rather than giving up.
            return action

        allocation["sliceId"] = attachment.get("sliceId")
        allocation["attachmentId"] = attachment.get("attachmentId")

        await self._emit(
            operation_id,
            DecisionStep.ALLOCATED,
            action=NetworkAction.QOD_AND_SLICE.value,
            congestion=congestion_value,
            qodSessionId=allocation.get("qodSessionId"),
            sliceId=allocation.get("sliceId"),
            reasoning="Mid-operation re-decision: dedicated slice now available.",
        )
        return NetworkAction.QOD_AND_SLICE

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
