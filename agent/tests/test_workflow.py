"""End-to-end workflow tests against a real Temporal test environment.

Uses the time-skipping environment, so a three-minute crane lift completes in
milliseconds and the release path can actually be asserted rather than reasoned
about. Everything runs offline — mock network provider, offline classifier,
recording emit stub.
"""

from __future__ import annotations

import uuid

import pytest
from temporalio import activity
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from flowguard_agent.activities.network import NetworkActivities
from flowguard_agent.activities.reasoning import ReasoningActivities
from flowguard_agent.graph.assessment_graph import build_assessment_graph
from flowguard_agent.graph.evidence import HeuristicEvidenceGatherer
from flowguard_agent.llm.client import CriticalityClassifier, MockClassifier
from flowguard_agent.network.mock_provider import MockNetworkProvider
from flowguard_agent.shared.constants import (
    ACTIVITY_EMIT_DECISION,
    ACTIVITY_GET_POLICY_CONFIG,
    SIGNAL_CONGESTION_UPDATED,
    SIGNAL_OPERATION_COMPLETED,
    WORKFLOW_CRITICAL_OPERATION,
)
from flowguard_agent.shared.models import DecisionStep, NetworkAction
from flowguard_agent.workflows.critical_operation import CriticalOperationWorkflow

TASK_QUEUE = "flowguard-test"


class RecordingEmit:
    """Captures the decision trail instead of POSTing it to the server."""

    def __init__(self) -> None:
        self.records: list[dict] = []

    @activity.defn(name=ACTIVITY_EMIT_DECISION)
    async def emit_decision(self, payload: dict) -> dict:
        self.records.append(payload)
        return {"recorded": True, "duplicate": False}

    def steps(self) -> list[str]:
        return [r["step"] for r in self.records]


class FakePolicyConfig:
    """Scripted policy settings instead of the real Settings/.env read.

    Keeps these tests independent of whatever agent/.env happens to hold.
    """

    def __init__(
        self, *, always_protect_safety_critical: bool = False, fail_open: bool = True
    ) -> None:
        self._config = {
            "alwaysProtectSafetyCritical": always_protect_safety_critical,
            "failOpen": fail_open,
        }

    @activity.defn(name=ACTIVITY_GET_POLICY_CONFIG)
    async def get_policy_config(self) -> dict:
        return self._config


class FailingClassifier(CriticalityClassifier):
    """Always raises — for exercising the fail-open/fail-closed path."""

    async def classify(self, event, context=None, model=None):
        raise RuntimeError("classifier unavailable")


def crane_lift(**overrides) -> dict:
    """The primary demo event, in server wire format."""
    event = {
        "id": f"evt-{uuid.uuid4().hex[:8]}",
        "assetType": "CRANE",
        "device": {"id": "crane-a", "phoneNumber": "+99999991001"},
        "operation": "Move Container #A392",
        "description": "Remote lift of a high-value container over an active walkway.",
        "expectedDurationSeconds": 180,
        "site": "Khalifa Bin Salman Port",
        "metadata": {"loadTonnes": 40, "overWalkway": True, "cargoValueUsd": 2_400_000},
    }
    event.update(overrides)
    return event


def drone_routine(**overrides) -> dict:
    event = {
        "id": f"evt-{uuid.uuid4().hex[:8]}",
        "assetType": "DRONE",
        "device": {"id": "drone-3", "phoneNumber": "+99999991002"},
        "operation": "Routine perimeter mapping",
        "description": "Scheduled photogrammetry sweep; imagery uploaded after landing.",
        "expectedDurationSeconds": 600,
        "metadata": {"scheduled": True, "deferrable": True},
    }
    event.update(overrides)
    return event


class Harness:
    """Wires a worker with fully offline dependencies."""

    def __init__(
        self,
        *,
        classifier: CriticalityClassifier | None = None,
        always_protect_safety_critical: bool = False,
        fail_open: bool = True,
    ) -> None:
        self.provider = MockNetworkProvider(simulate_latency=False)
        self.emit = RecordingEmit()
        self.policy = FakePolicyConfig(
            always_protect_safety_critical=always_protect_safety_critical,
            fail_open=fail_open,
        )
        graph = build_assessment_graph(
            classifier or MockClassifier(),
            evidence_gatherer=HeuristicEvidenceGatherer(),
            confidence_threshold=0.80,
        )
        self.network = NetworkActivities(self.provider, qos_profile="DOWNLINK_M_UPLINK_L")
        self.reasoning = ReasoningActivities(graph, self.provider)

    def worker(self, client: Client) -> Worker:
        return Worker(
            client,
            task_queue=TASK_QUEUE,
            workflows=[CriticalOperationWorkflow],
            activities=[
                self.policy.get_policy_config,
                self.network.check_device_status,
                self.network.query_congestion,
                self.network.allocate,
                self.network.escalate_to_slice,
                self.network.poll_qod,
                self.network.extend_qod,
                self.network.release,
                self.reasoning.assess_criticality,
                self.emit.emit_decision,
            ],
        )


async def _wait_for_steps(
    env: WorkflowEnvironment, harness: Harness, step: str, count: int = 1, timeout_seconds: float = 30.0
) -> None:
    """Poll the recording emit stub, advancing the time-skipping clock between checks.

    A plain ``asyncio.sleep`` never nudges the time-skipping test server
    forward — it only advances on an explicit ``env.sleep`` (or a call with
    nothing left to do but wait), so a workflow parked inside a Temporal timer
    (``_confirm_qos_available``'s 10-second wait, for instance) would never
    resolve while this polls in real time alone.
    """
    elapsed = 0.0
    step_size = 1.0
    while sum(1 for r in harness.emit.steps() if r == step) < count:
        await env.sleep(step_size)
        elapsed += step_size
        if elapsed > timeout_seconds:
            raise AssertionError(f"timed out waiting for step {step!r} x{count}")


@pytest.fixture
async def env():
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        yield environment


# ── The primary path ──────────────────────────────────────────────────


async def test_crane_lift_allocates_then_releases(env: WorkflowEnvironment):
    """The whole loop: observe, judge, allocate, monitor, release.

    The release assertion is the important one — the entire cost argument
    depends on connectivity actually being handed back.
    """
    harness = Harness()
    await harness.provider.bootstrap()
    event = crane_lift()

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        result = await handle.result()

    assert result["action"] in (NetworkAction.QOD.value, NetworkAction.QOD_AND_SLICE.value)
    assert result["criticality"] == "HIGH"
    assert result["released"] is True

    steps = harness.emit.steps()
    assert DecisionStep.DEVICE_CHECKED.value in steps
    assert DecisionStep.CONGESTION_CHECKED.value in steps
    assert DecisionStep.CRITICALITY_ASSESSED.value in steps
    assert DecisionStep.DECIDED.value in steps
    assert DecisionStep.ALLOCATED.value in steps
    assert DecisionStep.RELEASED.value in steps

    # Nothing left holding capacity.
    assert harness.provider._sessions == {}
    assert harness.provider._attachments == {}

    # The graph's reasoning path and tool choices must reach the server, not
    # just exist inside the activity result — this used to be dropped at the
    # workflow's _emit call site.
    assessed = next(r for r in harness.emit.records if r["step"] == DecisionStep.CRITICALITY_ASSESSED.value)
    assert assessed["graphTrace"], "the graph's path must be forwarded, not dropped"
    assert "toolCalls" in assessed


async def test_routine_drone_work_allocates_nothing(env: WorkflowEnvironment):
    """The thesis, end to end: HIGH congestion, but routine work gets nothing."""
    harness = Harness()
    await harness.provider.bootstrap()
    event = drone_routine()

    async with harness.worker(env.client):
        result = await env.client.execute_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

    assert result["action"] == NetworkAction.NONE.value
    assert result["criticality"] == "LOW"
    assert result["congestion"] == "High", "the network really was congested"
    assert result["rule"] == "ROUTINE_NO_ACTION"
    assert harness.provider._sessions == {}


async def test_unreachable_device_short_circuits(env: WorkflowEnvironment):
    """Guard clause: never allocate to a device that is not on the network."""
    harness = Harness()
    await harness.provider.bootstrap()
    event = crane_lift(device={"id": "camera-offline", "phoneNumber": "+99999991009"})

    async with harness.worker(env.client):
        result = await env.client.execute_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

    assert result["action"] == NetworkAction.NONE.value
    assert result["deviceReachable"] is False
    assert result["rule"] == "GUARD_DEVICE_UNREACHABLE"
    # The model is never consulted — the guard runs first and costs nothing.
    assert DecisionStep.CRITICALITY_ASSESSED.value not in harness.emit.steps()


# ── The safety valve ──────────────────────────────────────────────────


async def test_release_happens_even_without_a_completion_signal(env: WorkflowEnvironment):
    """A lost completion signal must not strand paid capacity forever.

    Time-skipping runs the full safety-valve timeout — four times the expected
    duration — in milliseconds. Without the valve this test would hang.
    """
    harness = Harness()
    await harness.provider.bootstrap()
    event = crane_lift(expectedDurationSeconds=30)

    async with harness.worker(env.client):
        # No completion signal is ever sent.
        result = await env.client.execute_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

    assert result["released"] is True
    assert harness.provider._sessions == {}, "session must not outlive the workflow"
    assert DecisionStep.RELEASED.value in harness.emit.steps()


# ── Mid-operation re-decision ────────────────────────────────────────


async def test_congestion_signal_attaches_a_slice_that_was_not_ready_yet(
    env: WorkflowEnvironment,
):
    """The value a fixed-position asset never left on the table.

    A slice takes minutes to provision (CLAUDE.md §5) and is not always ready
    the instant a safety-critical operation needs one — here it is not
    provisioned at all when the crane lift starts, so allocation degrades to
    plain QoD even though the policy wants QOD_AND_SLICE. The slice finishes
    provisioning mid-operation; a congestion_updated signal (the only thing
    that used to be silently stored and ignored) is what gives the workflow a
    reason to check again and attach it.
    """
    harness = Harness()
    # Deliberately no bootstrap(): the slice is still "provisioning" when the
    # operation starts.
    event = crane_lift(expectedDurationSeconds=120)

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

        await _wait_for_steps(env, harness, DecisionStep.ALLOCATED.value)
        first_allocation = next(
            r for r in harness.emit.records if r["step"] == DecisionStep.ALLOCATED.value
        )
        assert first_allocation.get("sliceId") is None, "nothing was provisioned yet"

        # The slice finishes provisioning; a congestion reading arrives next,
        # as it periodically would in production.
        await harness.provider.bootstrap()
        await handle.signal(SIGNAL_CONGESTION_UPDATED, {"level": "High"})

        await _wait_for_steps(env, harness, DecisionStep.ALLOCATED.value, count=2)
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        result = await handle.result()

    assert result["released"] is True
    allocated = [r for r in harness.emit.records if r["step"] == DecisionStep.ALLOCATED.value]
    assert len(allocated) == 2, "the mid-operation escalation is its own audit entry"
    assert allocated[1]["sliceId"] == harness.provider.slice_id
    assert allocated[1]["action"] == NetworkAction.QOD_AND_SLICE.value

    # Fully released at the end, including the slice attached mid-flight.
    assert harness.provider._sessions == {}
    assert harness.provider._attachments == {}


async def test_congestion_signal_never_de_escalates(env: WorkflowEnvironment):
    """Improving congestion must never retract protection already granted.

    Revoking connectivity from a safety-critical operation already under way
    is not a call this system makes on its own — a value left on the table is
    always safer than a guarantee withdrawn mid-flight.
    """
    harness = Harness()
    await harness.provider.bootstrap()
    event = crane_lift(expectedDurationSeconds=120)

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

        await _wait_for_steps(env, harness, DecisionStep.ALLOCATED.value)
        await handle.signal(SIGNAL_CONGESTION_UPDATED, {"level": "Low"})
        await env.sleep(2)  # give a (correctly absent) reaction time to happen

        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        result = await handle.result()

    assert result["released"] is True
    # Exactly one ALLOCATED record — nothing was re-decided downward.
    assert harness.emit.steps().count(DecisionStep.ALLOCATED.value) == 1


# ── Policy config and fail-open/closed ──────────────────────────────


async def test_always_protect_safety_critical_overrides_low_congestion(
    env: WorkflowEnvironment,
):
    """PolicyConfig must actually reach decide() — it used to be bare defaults.

    'crane-d' derives LOW congestion (SHA-256 of the device id, per
    MockNetworkProvider._derive_congestion), which the default policy leaves
    on standard connectivity even for a safety-critical lift
    (HIGH_CRITICALITY_NETWORK_HEALTHY). With the operator's
    always_protect_safety_critical policy on, the same operation must be
    protected regardless.
    """
    harness = Harness(always_protect_safety_critical=True)
    await harness.provider.bootstrap()
    event = crane_lift(device={"id": "crane-d", "phoneNumber": "+99999991099"})

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        result = await handle.result()

    assert result["congestion"] == "Low", "the premise: congestion alone would say no action"
    assert result["action"] in (NetworkAction.QOD.value, NetworkAction.QOD_AND_SLICE.value)
    assert result["rule"] == "SAFETY_CRITICAL_ALWAYS_PROTECT"
    assert result["released"] is True


async def test_criticality_assessment_failure_fails_open_by_default(
    env: WorkflowEnvironment,
):
    """The open decision (CLAUDE.md §10), actually implemented.

    Assessment failing outright must not fail the *operation* outright —
    fail_open (the default) treats the unknown as HIGH/safety-critical,
    still a real, audited decision rather than a crash with no policy
    applied at all.
    """
    harness = Harness(classifier=FailingClassifier())
    await harness.provider.bootstrap()
    event = crane_lift()

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        result = await handle.result()

    assert result["criticality"] == "HIGH"
    assert result["action"] in (NetworkAction.QOD.value, NetworkAction.QOD_AND_SLICE.value)
    assert result["released"] is True

    assessed = next(
        r for r in harness.emit.records if r["step"] == DecisionStep.CRITICALITY_ASSESSED.value
    )
    assert assessed.get("error"), "the fallback must be visible in the audit trail, not silent"


async def test_criticality_assessment_failure_fails_closed_when_configured(
    env: WorkflowEnvironment,
):
    """The other half of the open decision: POLICY_FAIL_OPEN=false."""
    harness = Harness(classifier=FailingClassifier(), fail_open=False)
    await harness.provider.bootstrap()
    event = crane_lift()

    async with harness.worker(env.client):
        result = await env.client.execute_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )

    assert result["criticality"] == "LOW"
    assert result["action"] == NetworkAction.NONE.value
    assert result["released"] is False


# ── Audit trail ───────────────────────────────────────────────────────


async def test_every_decision_record_is_idempotency_keyed(env: WorkflowEnvironment):
    """Server dedupes on runId:step, so both must always be present."""
    harness = Harness()
    await harness.provider.bootstrap()
    event = crane_lift()

    async with harness.worker(env.client):
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        await handle.result()

    for record in harness.emit.records:
        assert record["runId"], "runId is half the dedupe key"
        assert record["step"], "step is the other half"
        assert record["operationId"] == event["id"]

    keys = [(r["runId"], r["step"]) for r in harness.emit.records]
    assert len(keys) == len(set(keys)), "a step must be emitted at most once per run"
