"""Tests for the evidence layer — the agent orchestrating CAMARA reads.

Covers the capability that makes FlowGuard's agent orchestrate rather than
execute: choosing which network signal to call, and acting on what it says.
"""

from __future__ import annotations

from flowguard_agent.graph.assessment_graph import build_assessment_graph
from flowguard_agent.graph.evidence import HeuristicEvidenceGatherer, LLMEvidenceGatherer
from flowguard_agent.llm.client import CriticalityClassifier, MockClassifier
from flowguard_agent.network.mock_provider import MockNetworkProvider
from flowguard_agent.shared.models import (
    AssetType,
    BusinessEvent,
    Criticality,
    CriticalityAssessment,
    DeviceRef,
)
from flowguard_agent.tools.network_tools import TOOL_SCHEMAS, NetworkToolbox

#: The pipeline the drone scenarios claim to be inspecting.
PIPELINE_LAT, PIPELINE_LON = 26.1500, 50.6200


def _provider() -> MockNetworkProvider:
    return MockNetworkProvider(simulate_latency=False)


def _leak_event(device_id: str, **overrides) -> BusinessEvent:
    metadata = {
        "emergency": True,
        "deferrable": False,
        "hazard": "gas-leak",
        "siteLatitude": PIPELINE_LAT,
        "siteLongitude": PIPELINE_LON,
    }
    metadata.update(overrides.pop("metadata", {}))

    return BusinessEvent(
        id=overrides.pop("id", "evt-leak"),
        asset_type=AssetType.DRONE,
        device=DeviceRef(id=device_id, phone_number="+99999991002"),
        operation="Pipeline leak inspection",
        expected_duration_seconds=240,
        description="Emergency thermal inspection of a suspected gas leak on trunk line B.",
        site="Sitra Industrial Area",
        metadata=metadata,
        **overrides,
    )


async def _run(graph, event):
    return await graph.ainvoke(
        {
            "event": event,
            "context": None,
            "assessment": None,
            "attempts": 0,
            "model": None,
            "enriched": False,
            "toolbox": NetworkToolbox(_provider(), event.device),
            "evidence": None,
            "trace": [],
        }
    )


# ── The toolbox ───────────────────────────────────────────────────────


def test_toolbox_exposes_no_write_capability():
    """The safety boundary, enforced by absence.

    A model cannot commit paid network capacity if no tool to do so exists in
    its world. This test fails loudly if someone adds one.
    """
    names = {schema["name"] for schema in TOOL_SCHEMAS}

    forbidden = {"create_qod_session", "allocate", "attach_slice", "delete_qod_session"}
    assert not (names & forbidden), "write capability leaked into the agent's toolset"

    for name in names:
        assert name.startswith(("check_", "verify_", "retrieve_", "get_")), (
            f"tool '{name}' does not read as a read-only operation"
        )


async def test_tool_failure_is_reported_not_raised():
    """A failed network read should make the agent less certain, not crash it."""

    class BrokenProvider(MockNetworkProvider):
        async def get_device_location(self, device):
            raise ConnectionError("sandbox unreachable")

    toolbox = NetworkToolbox(BrokenProvider(simulate_latency=False), DeviceRef(id="drone-3"))
    call = await toolbox.call("retrieve_device_location")

    assert call.failed is True
    assert "Unavailable" in call.result
    assert "unknown" in call.result.lower()


async def test_unknown_tool_is_reported_not_raised():
    toolbox = NetworkToolbox(_provider(), DeviceRef(id="drone-3"))
    call = await toolbox.call("delete_everything")
    assert call.failed is True


# ── Verification of a claim ───────────────────────────────────────────


async def test_location_confirms_a_truthful_claim():
    """drone-3 really is at the pipeline; criticality stands."""
    graph = build_assessment_graph(
        MockClassifier(),
        evidence_gatherer=HeuristicEvidenceGatherer(),
        confidence_threshold=0.80,
    )

    result = await _run(graph, _leak_event("drone-3"))

    assert result["assessment"].criticality is Criticality.HIGH
    assert result["assessment"].safety_critical is True
    assert result["evidence"].contradicted is False
    assert any("CONFIRMED" in call.result for call in result["evidence"].tool_calls)


async def test_location_contradiction_downgrades_a_false_claim():
    """The demo moment: an asset claiming a hazard it is nowhere near.

    drone-9 reports a pipeline leak inspection but is ~18 km away. The
    description alone would earn safety-critical treatment and a dedicated
    slice; the network says otherwise, and the agent believes the network.
    """
    graph = build_assessment_graph(
        MockClassifier(),
        evidence_gatherer=HeuristicEvidenceGatherer(),
        confidence_threshold=0.80,
    )

    result = await _run(graph, _leak_event("drone-9", id="evt-false-claim"))

    assert result["evidence"].contradicted is True
    assert result["assessment"].criticality is Criticality.MEDIUM
    assert result["assessment"].safety_critical is False
    assert "contradicts" in result["assessment"].reasoning
    assert any("downgraded-on-location-contradiction" in step for step in result["trace"])


async def test_safety_critical_claims_are_always_verified():
    """Confidence in a description says nothing about whether it is true.

    Even a confident safety-critical classification triggers verification,
    because the expensive mistake is believing a claim rather than misreading it.
    """

    class ConfidentClassifier(CriticalityClassifier):
        async def classify(self, event, context=None, model=None):
            return CriticalityAssessment(
                criticality=Criticality.HIGH,
                confidence=0.99,
                reasoning="Emergency inspection of a suspected gas leak, watched live.",
                safety_critical=True,
                model="stub",
            )

    graph = build_assessment_graph(
        ConfidentClassifier(),
        evidence_gatherer=HeuristicEvidenceGatherer(),
        confidence_threshold=0.80,
    )

    result = await _run(graph, _leak_event("drone-9"))

    assert result["evidence"].tool_calls, "a confident safety claim was never verified"
    assert result["assessment"].criticality is Criticality.MEDIUM


async def test_no_verification_without_a_claimed_location():
    """Do not call a tool whose answer could not change anything."""
    graph = build_assessment_graph(
        MockClassifier(),
        evidence_gatherer=HeuristicEvidenceGatherer(),
        confidence_threshold=0.80,
    )

    event = _leak_event("drone-3", id="evt-no-coords")
    event.metadata.pop("siteLatitude")
    event.metadata.pop("siteLongitude")

    result = await _run(graph, event)

    assert result["evidence"].tool_calls == []
    assert result["assessment"].criticality is Criticality.HIGH


# ── Model-driven tool selection ───────────────────────────────────────


class FakeToolCallingModel:
    """Stands in for a chat model with tool binding."""

    def __init__(self, tool_calls: list[dict]) -> None:
        self._tool_calls = tool_calls
        self.bound_schemas: list | None = None

    def bind_tools(self, schemas):
        self.bound_schemas = schemas
        return self

    async def ainvoke(self, _messages, **kwargs):
        self.config = kwargs.get("config")

        class Response:
            tool_calls = self._tool_calls

        return Response()


async def test_llm_gatherer_executes_the_tools_the_model_picks():
    """The orchestration path: the model names a tool, the agent runs it."""
    model = FakeToolCallingModel(
        [
            {
                "name": "verify_device_location",
                "args": {
                    "latitude": PIPELINE_LAT,
                    "longitude": PIPELINE_LON,
                    "radius_meters": 2000,
                },
            }
        ]
    )
    gatherer = LLMEvidenceGatherer(model)
    event = _leak_event("drone-9")
    toolbox = NetworkToolbox(_provider(), event.device)

    evidence = await gatherer.gather(event, toolbox)

    assert model.bound_schemas == TOOL_SCHEMAS, "the model was offered the read-only toolset"
    assert len(evidence.tool_calls) == 1
    assert evidence.contradicted is True


async def test_llm_gatherer_accepts_calling_nothing():
    """Calling no tool is a valid decision, not a failure."""
    gatherer = LLMEvidenceGatherer(FakeToolCallingModel([]))
    event = _leak_event("drone-3")
    toolbox = NetworkToolbox(_provider(), event.device)

    evidence = await gatherer.gather(event, toolbox)

    assert evidence.tool_calls == []
    assert evidence.contradicted is False


async def test_llm_gatherer_bounds_the_number_of_calls():
    """A latency budget is not optional; cap what one round may do."""
    model = FakeToolCallingModel(
        [{"name": "check_device_status", "args": {}} for _ in range(10)]
    )
    gatherer = LLMEvidenceGatherer(model, max_tool_calls=2)
    event = _leak_event("drone-3")
    toolbox = NetworkToolbox(_provider(), event.device)

    evidence = await gatherer.gather(event, toolbox)

    assert len(evidence.tool_calls) == 2
