"""Tests for Langfuse tracing over Temporal.

Two properties matter and both are asserted here:

1. Every activity in one workflow run lands on **one** trace, derived from the
   Temporal run ID — because activities execute as independent tasks with no
   shared process to carry a trace context.
2. Tracing can never break the agent. A missing package, bad credentials, or a
   throwing SDK must degrade to no-op, not fail an activity that is holding a
   network resource.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from flowguard_agent.activities.network import NetworkActivities
from flowguard_agent.activities.policy_config import get_policy_config
from flowguard_agent.activities.reasoning import ReasoningActivities
from flowguard_agent.graph.assessment_graph import build_assessment_graph
from flowguard_agent.graph.evidence import HeuristicEvidenceGatherer
from flowguard_agent.llm.client import MockClassifier
from flowguard_agent.network.mock_provider import MockNetworkProvider
from flowguard_agent.observability import langfuse_setup, temporal_interceptor
from flowguard_agent.observability.temporal_interceptor import LangfuseInterceptor
from flowguard_agent.shared.constants import (
    ACTIVITY_EMIT_DECISION,
    SIGNAL_OPERATION_COMPLETED,
    WORKFLOW_CRITICAL_OPERATION,
)
from flowguard_agent.workflows.critical_operation import CriticalOperationWorkflow

TASK_QUEUE = "flowguard-tracing-test"


# ── Fakes ─────────────────────────────────────────────────────────────


class FakeSpan:
    def __init__(self, record: dict) -> None:
        self.record = record

    def update(self, **kwargs) -> None:
        self.record.update(kwargs)


class FakeLangfuse:
    """Records what would have been sent, without a network call."""

    def __init__(self) -> None:
        self.spans: list[dict] = []
        self.flushed = 0

    def create_trace_id(self, seed: str) -> str:
        # Deterministic in the same way the real SDK is: same seed, same id.
        return uuid.uuid5(uuid.NAMESPACE_URL, seed).hex

    @contextmanager
    def start_as_current_observation(self, *, as_type, name, trace_context, **attributes):
        record = {
            "name": name,
            "as_type": as_type,
            "trace_id": (trace_context or {}).get("trace_id"),
            **attributes,
        }
        self.spans.append(record)
        yield FakeSpan(record)

    def flush(self) -> None:
        self.flushed += 1


class ExplodingLangfuse(FakeLangfuse):
    """An SDK that fails on every call, to prove tracing is never load-bearing."""

    def create_trace_id(self, seed: str) -> str:
        raise RuntimeError("langfuse is having a bad day")

    @contextmanager
    def start_as_current_observation(self, **kwargs):
        raise RuntimeError("langfuse is having a bad day")
        yield  # pragma: no cover


class RecordingEmit:
    from temporalio import activity

    def __init__(self) -> None:
        self.records: list[dict] = []

    @activity.defn(name=ACTIVITY_EMIT_DECISION)
    async def emit_decision(self, payload: dict) -> dict:
        self.records.append(payload)
        return {"recorded": True, "duplicate": False}


@pytest.fixture
def fake_langfuse(monkeypatch):
    client = FakeLangfuse()
    monkeypatch.setattr(langfuse_setup, "get_langfuse", lambda: client)
    monkeypatch.setattr(temporal_interceptor, "get_langfuse", lambda: client)
    monkeypatch.setattr(
        temporal_interceptor,
        "trace_id_for_run",
        lambda run_id: client.create_trace_id(seed=run_id),
    )
    return client


def _harness():
    provider = MockNetworkProvider(simulate_latency=False)
    graph = build_assessment_graph(
        MockClassifier(), evidence_gatherer=HeuristicEvidenceGatherer()
    )
    return (
        provider,
        NetworkActivities(provider, qos_profile="DOWNLINK_M_UPLINK_L"),
        ReasoningActivities(graph, provider),
        RecordingEmit(),
    )


def _crane_event() -> dict:
    return {
        "id": f"evt-{uuid.uuid4().hex[:8]}",
        "assetType": "CRANE",
        "device": {"id": "crane-a", "phoneNumber": "+99999991001"},
        "operation": "Move Container #A392",
        "description": "Remote lift over an active walkway.",
        "expectedDurationSeconds": 30,
        "metadata": {"loadTonnes": 40, "overWalkway": True},
    }


async def _run_workflow(env: WorkflowEnvironment, interceptors: list) -> dict:
    provider, network, reasoning, emit = _harness()
    await provider.bootstrap()
    event = _crane_event()

    worker = Worker(
        env.client,
        task_queue=TASK_QUEUE,
        interceptors=interceptors,
        workflows=[CriticalOperationWorkflow],
        activities=[
            get_policy_config,
            network.check_device_status,
            network.query_congestion,
            network.allocate,
            network.poll_qod,
            network.extend_qod,
            network.release,
            reasoning.assess_criticality,
            emit.emit_decision,
        ],
    )

    async with worker:
        handle = await env.client.start_workflow(
            WORKFLOW_CRITICAL_OPERATION,
            event,
            id=f"operation-{event['id']}",
            task_queue=TASK_QUEUE,
        )
        await handle.signal(SIGNAL_OPERATION_COMPLETED)
        return await handle.result()


@pytest.fixture
async def env():
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        yield environment


# ── Trace grouping ────────────────────────────────────────────────────


async def test_all_activities_share_one_trace_per_workflow_run(
    env: WorkflowEnvironment, fake_langfuse: FakeLangfuse
):
    """The property the whole design turns on.

    Activities run as separate task executions, so without a run-derived trace
    ID each would land on its own trace and the workflow would be unreadable in
    Langfuse.
    """
    result = await _run_workflow(env, [LangfuseInterceptor()])
    assert result["released"] is True

    assert fake_langfuse.spans, "no spans were recorded"

    trace_ids = {span["trace_id"] for span in fake_langfuse.spans}
    assert len(trace_ids) == 1, f"activities were split across {len(trace_ids)} traces"


async def test_each_activity_appears_as_its_own_span(
    env: WorkflowEnvironment, fake_langfuse: FakeLangfuse
):
    await _run_workflow(env, [LangfuseInterceptor()])

    names = {span["name"] for span in fake_langfuse.spans}
    for expected in (
        "check_device_status",
        "query_congestion",
        "assess_criticality",
        "allocate",
        "release",
    ):
        assert expected in names, f"'{expected}' produced no span"


async def test_spans_carry_workflow_and_retry_metadata(
    env: WorkflowEnvironment, fake_langfuse: FakeLangfuse
):
    """Attempt count is what makes a retry visible rather than invisible."""
    await _run_workflow(env, [LangfuseInterceptor()])

    span = fake_langfuse.spans[0]
    metadata = span["metadata"]

    assert metadata["workflow_type"] == WORKFLOW_CRITICAL_OPERATION
    assert metadata["workflow_id"].startswith("operation-")
    assert metadata["attempt"] >= 1
    assert metadata["task_queue"] == TASK_QUEUE
    assert "args" in span["input"]


async def test_span_records_activity_output(
    env: WorkflowEnvironment, fake_langfuse: FakeLangfuse
):
    await _run_workflow(env, [LangfuseInterceptor()])

    congestion = next(s for s in fake_langfuse.spans if s["name"] == "query_congestion")
    assert "output" in congestion


# ── Tracing must never be load-bearing ────────────────────────────────


async def test_workflow_succeeds_when_langfuse_throws(env: WorkflowEnvironment, monkeypatch):
    """An SDK failing on every call must not fail an activity.

    The activity that matters here is `release` — if tracing could break it, a
    Langfuse outage would strand paid network capacity.
    """
    exploding = ExplodingLangfuse()
    monkeypatch.setattr(temporal_interceptor, "get_langfuse", lambda: exploding)
    monkeypatch.setattr(
        temporal_interceptor,
        "trace_id_for_run",
        lambda run_id: exploding.create_trace_id(seed=run_id),
    )

    result = await _run_workflow(env, [LangfuseInterceptor()])

    assert result["released"] is True


async def test_workflow_succeeds_with_tracing_disabled(env: WorkflowEnvironment, monkeypatch):
    """The default path: no Langfuse configured, no interceptor, no difference."""
    monkeypatch.setattr(temporal_interceptor, "get_langfuse", lambda: None)

    result = await _run_workflow(env, [])

    assert result["released"] is True


def test_callbacks_are_empty_when_tracing_is_off(monkeypatch):
    """LangChain calls get no handler when Langfuse is disabled."""
    monkeypatch.setattr(langfuse_setup, "get_langfuse", lambda: None)
    assert langfuse_setup.langchain_callbacks() == []
