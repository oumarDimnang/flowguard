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
from flowguard_agent.llm.client import MockClassifier
from flowguard_agent.network.mock_provider import MockNetworkProvider
from flowguard_agent.shared.constants import (
    ACTIVITY_EMIT_DECISION,
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

    def __init__(self) -> None:
        self.provider = MockNetworkProvider(simulate_latency=False)
        self.emit = RecordingEmit()
        graph = build_assessment_graph(
            MockClassifier(),
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
                self.network.check_device_status,
                self.network.query_congestion,
                self.network.allocate,
                self.network.poll_qod,
                self.network.extend_qod,
                self.network.release,
                self.reasoning.assess_criticality,
                self.emit.emit_decision,
            ],
        )


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
