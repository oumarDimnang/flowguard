"""Tests for the live reasoning trace — the agent's thinking, streamed.

The durable record of an assessment is the CRITICALITY_ASSESSED step the
workflow emits when the graph finishes. These tests cover the other channel:
each node and each tool call reporting itself the moment it happens, so a
dashboard can show the reasoning graph lighting up rather than landing at once.

Two properties matter more than the events themselves. The verdict must be
identical whether or not anybody is watching, and a watcher that fails must
cost the assessment at most one short timeout.
"""

from __future__ import annotations

import json

import httpx

from flowguard_agent.activities.reasoning import ReasoningActivities
from flowguard_agent.graph.assessment_graph import build_assessment_graph
from flowguard_agent.graph.evidence import HeuristicEvidenceGatherer
from flowguard_agent.graph.trace_sink import (
    NODE_FINISHED,
    NODE_STARTED,
    TOOL_FINISHED,
    TOOL_STARTED,
    HttpTraceSink,
    RecordingTraceSink,
)
from flowguard_agent.llm.client import CriticalityClassifier
from flowguard_agent.network.mock_provider import MockNetworkProvider
from flowguard_agent.shared.models import (
    AssetType,
    BusinessEvent,
    Criticality,
    CriticalityAssessment,
    DeviceRef,
)
from flowguard_agent.tools.network_tools import NetworkToolbox


class StubClassifier(CriticalityClassifier):
    def __init__(self, sequence: list[CriticalityAssessment]) -> None:
        self._sequence = sequence
        self.calls = 0

    async def classify(self, event, context=None, model=None):
        index = min(self.calls, len(self._sequence) - 1)
        self.calls += 1
        return self._sequence[index]


def _assessment(confidence: float, **kwargs) -> CriticalityAssessment:
    return CriticalityAssessment(
        criticality=kwargs.get("criticality", Criticality.HIGH),
        confidence=confidence,
        reasoning="A sufficiently long justification for the test.",
        safety_critical=kwargs.get("safety_critical", False),
        model="stub",
    )


def _event() -> BusinessEvent:
    return BusinessEvent(
        id="evt-trace",
        asset_type=AssetType.CRANE,
        device=DeviceRef(id="crane-a", phone_number="+99999991001"),
        operation="Move Container #A392",
        expected_duration_seconds=180,
        description="Remote lift over an active walkway.",
        organization_id="org-1",
    )


def _device() -> DeviceRef:
    return DeviceRef(id="crane-a", phone_number="+99999991001")


async def _run(graph, event, sink, toolbox=None):
    return await graph.ainvoke(
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


# ── The graph reports every node, in order ────────────────────────────


async def test_nodes_report_start_and_finish_in_traversal_order():
    """One unsure pass, evidence, one confident pass: eight node events, ordered."""
    classifier = StubClassifier([_assessment(0.40), _assessment(0.91)])
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)
    sink = RecordingTraceSink()

    await _run(graph, _event(), sink)

    path = [(e["kind"], e["node"]) for e in sink.events]
    assert path == [
        (NODE_STARTED, "classify"),
        (NODE_FINISHED, "classify"),
        (NODE_STARTED, "gather_evidence"),
        (NODE_FINISHED, "gather_evidence"),
        (NODE_STARTED, "classify"),
        (NODE_FINISHED, "classify"),
        (NODE_STARTED, "validate"),
        (NODE_FINISHED, "validate"),
    ]
    assert [e["seq"] for e in sink.events] == list(range(1, 9))


async def test_finished_events_carry_the_same_line_as_the_durable_trace():
    """The live detail and the recorded graphTrace are one text, not two."""
    classifier = StubClassifier([_assessment(0.95)])
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)
    sink = RecordingTraceSink()

    result = await _run(graph, _event(), sink)

    finished = [e["detail"] for e in sink.events if e["kind"] == NODE_FINISHED]
    assert finished == result["trace"]

    classify = next(
        e for e in sink.events if e["kind"] == NODE_FINISHED and e["node"] == "classify"
    )
    assert classify["data"]["criticality"] == "HIGH"
    assert classify["data"]["confidence"] == 0.95


async def test_verdict_is_identical_with_and_without_a_watcher():
    """Observation must not change the outcome."""
    watched = build_assessment_graph(
        StubClassifier([_assessment(0.40), _assessment(0.91)]), confidence_threshold=0.80
    )
    unwatched = build_assessment_graph(
        StubClassifier([_assessment(0.40), _assessment(0.91)]), confidence_threshold=0.80
    )

    with_sink = await _run(watched, _event(), RecordingTraceSink())
    without = await _run(unwatched, _event(), None)

    assert with_sink["assessment"] == without["assessment"]
    assert with_sink["trace"] == without["trace"]


async def test_a_raising_sink_does_not_fail_the_assessment():
    class Broken(RecordingTraceSink):
        async def emit(self, *args, **kwargs):
            raise RuntimeError("dashboard exploded")

    graph = build_assessment_graph(StubClassifier([_assessment(0.95)]), confidence_threshold=0.80)

    result = await _run(graph, _event(), Broken())

    assert result["assessment"].criticality is Criticality.HIGH


# ── Tool calls report themselves from inside the toolbox ──────────────


async def test_toolbox_reports_each_call_as_it_is_made():
    sink = RecordingTraceSink()
    toolbox = NetworkToolbox(MockNetworkProvider(simulate_latency=False), _device(), observer=sink)

    call = await toolbox.call("check_network_congestion")

    assert [(e["kind"], e["node"]) for e in sink.events] == [
        (TOOL_STARTED, "check_network_congestion"),
        (TOOL_FINISHED, "check_network_congestion"),
    ]
    assert sink.events[1]["data"]["result"] == call.result
    assert sink.events[1]["data"]["failed"] is False


async def test_a_failing_tool_is_still_reported_and_marked_failed():
    sink = RecordingTraceSink()
    toolbox = NetworkToolbox(MockNetworkProvider(simulate_latency=False), _device(), observer=sink)

    call = await toolbox.call("no_such_tool")

    assert call.failed is True
    assert sink.events[-1]["kind"] == TOOL_FINISHED
    assert sink.events[-1]["data"]["failed"] is True


async def test_a_raising_observer_does_not_change_the_tool_result():
    class Broken(RecordingTraceSink):
        async def tool_started(self, *args, **kwargs):
            raise RuntimeError("observer exploded")

    toolbox = NetworkToolbox(
        MockNetworkProvider(simulate_latency=False), _device(), observer=Broken()
    )

    call = await toolbox.call("check_device_status")

    assert call.failed is False
    assert "reachable" in call.result


# ── The HTTP sink ─────────────────────────────────────────────────────


async def test_http_sink_posts_the_wire_contract():
    """camelCase keys, the internal bearer token, and a monotonic seq."""
    received: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(202, json={"published": True})

    sink = HttpTraceSink(
        base_url="http://server.test/",
        token="secret-token",
        organization_id="org-1",
        operation_id="evt-1",
        workflow_id="operation-evt-1",
        run_id="run-1",
        transport=httpx.MockTransport(handler),
    )

    await sink.emit(NODE_STARTED, "classify", data={"attempt": 1})
    await sink.emit(NODE_FINISHED, "classify", detail="classify(...) -> HIGH @ 0.90")
    await sink.close()

    assert [r.url.path for r in received] == ["/internal/reasoning", "/internal/reasoning"]
    assert received[0].headers["authorization"] == "Bearer secret-token"

    first = json.loads(received[0].content)
    second = json.loads(received[1].content)
    assert first["organizationId"] == "org-1"
    assert first["operationId"] == "evt-1"
    assert first["workflowId"] == "operation-evt-1"
    assert first["runId"] == "run-1"
    assert first["kind"] == NODE_STARTED
    assert first["node"] == "classify"
    assert first["data"] == {"attempt": 1}
    assert "detail" not in first
    assert (first["seq"], second["seq"]) == (1, 2)
    assert second["detail"] == "classify(...) -> HIGH @ 0.90"
    assert second["occurredAt"].endswith("+00:00")


async def test_http_sink_disables_itself_after_the_first_failure():
    """A down server costs one attempt, not one per node."""
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("refused", request=request)

    sink = HttpTraceSink(
        base_url="http://server.test",
        token="t",
        organization_id="org-1",
        operation_id="evt-1",
        transport=httpx.MockTransport(handler),
    )

    for _ in range(5):
        await sink.emit(NODE_STARTED, "classify")
    await sink.close()

    assert attempts == 1


async def test_http_sink_treats_a_rejected_post_as_a_failure():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(401, json={"message": "Invalid internal token"})

    sink = HttpTraceSink(
        base_url="http://server.test",
        token="wrong",
        organization_id="org-1",
        operation_id="evt-1",
        transport=httpx.MockTransport(handler),
    )

    await sink.emit(NODE_STARTED, "classify")
    await sink.emit(NODE_FINISHED, "classify")
    await sink.close()

    assert attempts == 1


# ── The activity wires one sink into both the graph and the toolbox ───


async def test_activity_streams_nodes_and_tool_calls_through_one_sink():
    """A safety-critical claim gathers evidence; its tool call lands between
    the gather_evidence node's start and finish, in one ordered stream."""
    classifier = StubClassifier([_assessment(0.95, safety_critical=True)])
    graph = build_assessment_graph(
        classifier,
        evidence_gatherer=HeuristicEvidenceGatherer(),
        confidence_threshold=0.80,
    )

    built: list[RecordingTraceSink] = []
    seen: list[tuple] = []

    def factory(organization_id, operation_id, workflow_id, run_id):
        seen.append((organization_id, operation_id, workflow_id, run_id))
        sink = RecordingTraceSink()
        built.append(sink)
        return sink

    activities = ReasoningActivities(
        graph,
        MockNetworkProvider(simulate_latency=False),
        trace_sink_factory=factory,
    )

    result = await activities.assess_criticality(
        {
            "organizationId": "org-1",
            "id": "evt-leak",
            "assetType": "DRONE",
            "device": {"id": "drone-3", "phoneNumber": "+99999991002"},
            "operation": "Pipeline leak inspection",
            "expectedDurationSeconds": 240,
            "site": "Sitra Industrial Area",
            "metadata": {
                "emergency": True,
                "hazard": "gas-leak",
                "siteLatitude": 26.15,
                "siteLongitude": 50.62,
            },
        }
    )

    # Outside an activity context there is no workflow or run id — the
    # operation id is what the dashboard correlates on, and it is present.
    assert seen == [("org-1", "evt-leak", None, None)]

    sink = built[0]
    assert sink.closed is True

    kinds = [(e["kind"], e["node"]) for e in sink.events]
    start = kinds.index((NODE_STARTED, "gather_evidence"))
    end = kinds.index((NODE_FINISHED, "gather_evidence"))
    assert (TOOL_STARTED, "verify_device_location") in kinds[start:end]
    assert (TOOL_FINISHED, "verify_device_location") in kinds[start:end]

    # The durable record still carries the same tool call.
    assert [c["name"] for c in result["toolCalls"]] == ["verify_device_location"]


async def test_activity_without_a_factory_runs_unobserved():
    graph = build_assessment_graph(StubClassifier([_assessment(0.95)]), confidence_threshold=0.80)
    activities = ReasoningActivities(graph, MockNetworkProvider(simulate_latency=False))

    result = await activities.assess_criticality(
        {
            "organizationId": "org-1",
            "id": "evt-1",
            "assetType": "CRANE",
            "device": {"id": "crane-a", "phoneNumber": "+99999991001"},
            "operation": "Move Container #A392",
            "expectedDurationSeconds": 180,
        }
    )

    assert result["criticality"] == "HIGH"
