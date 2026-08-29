"""Tests for the LangGraph criticality assessment — the AI agent layer.

Driven by a stub classifier so every branch of the graph is exercised without a
model, an API key, or a network call.
"""

from __future__ import annotations

from flowguard_agent.graph.assessment_graph import build_assessment_graph
from flowguard_agent.llm.client import CriticalityClassifier, MockClassifier
from flowguard_agent.shared.models import (
    AssetType,
    BusinessEvent,
    Criticality,
    CriticalityAssessment,
    DeviceRef,
)


class StubClassifier(CriticalityClassifier):
    """Returns a scripted sequence of assessments, one per call."""

    def __init__(self, sequence: list[CriticalityAssessment]) -> None:
        self._sequence = sequence
        self.calls: list[dict] = []

    async def classify(self, event, context=None, model=None):
        self.calls.append({"context": context, "model": model})
        index = min(len(self.calls) - 1, len(self._sequence) - 1)
        return self._sequence[index]


def _assessment(confidence: float, **kwargs) -> CriticalityAssessment:
    return CriticalityAssessment(
        criticality=kwargs.get("criticality", Criticality.HIGH),
        confidence=confidence,
        reasoning=kwargs.get("reasoning", "A sufficiently long justification for the test."),
        safety_critical=kwargs.get("safety_critical", False),
        model=kwargs.get("model", "stub"),
    )


def _event(**kwargs) -> BusinessEvent:
    return BusinessEvent(
        id=kwargs.get("id", "evt-1"),
        asset_type=kwargs.get("asset_type", AssetType.CRANE),
        device=DeviceRef(id="crane-a", phone_number="+99999991001"),
        operation=kwargs.get("operation", "Move Container #A392"),
        expected_duration_seconds=180,
        description=kwargs.get("description", "Remote lift over an active walkway."),
        metadata=kwargs.get("metadata", {}),
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
            "toolbox": None,
            "evidence": None,
            "trace": [],
        }
    )


# ── Happy path ────────────────────────────────────────────────────────


async def test_confident_classification_accepted_immediately():
    """High confidence goes straight to validate — no extra model spend."""
    classifier = StubClassifier([_assessment(0.95)])
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)

    result = await _run(graph, _event())

    assert len(classifier.calls) == 1
    assert result["assessment"].confidence == 0.95
    assert any("classify" in step for step in result["trace"])
    assert not any("gather_evidence" in step for step in result["trace"])


# ── Low confidence: enrich, then escalate ─────────────────────────────


async def test_low_confidence_triggers_evidence_gathering():
    """An unsure first pass gathers context and tries again.

    This is the branch that makes the graph a graph rather than one call.
    """
    classifier = StubClassifier([_assessment(0.40), _assessment(0.91)])
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)

    result = await _run(graph, _event())

    assert len(classifier.calls) == 2
    # Second pass received the enriched asset profile.
    assert classifier.calls[1]["context"] is not None
    assert "control_mode" in classifier.calls[1]["context"]
    assert result["assessment"].confidence == 0.91
    assert any("gather_evidence" in step for step in result["trace"])


async def test_persistent_low_confidence_escalates_to_stronger_model():
    """Cost follows risk: only genuine uncertainty pays for the bigger model."""
    classifier = StubClassifier([_assessment(0.30)])
    graph = build_assessment_graph(
        classifier,
        confidence_threshold=0.80,
        escalation_model="openai/gpt-5.6-terra",
    )

    result = await _run(graph, _event())

    used_models = [c["model"] for c in classifier.calls]
    assert "openai/gpt-5.6-terra" in used_models, "should have escalated"
    assert any("escalate" in step for step in result["trace"])
    assert result["assessment"].escalated is True


async def test_escalation_loop_is_bounded():
    """Never loop forever on a stubbornly unsure model."""
    classifier = StubClassifier([_assessment(0.10)])
    graph = build_assessment_graph(
        classifier,
        confidence_threshold=0.99,
        escalation_model="openai/gpt-5.6-terra",
        max_attempts=3,
    )

    result = await _run(graph, _event())

    assert len(classifier.calls) <= 3
    assert result["assessment"] is not None


# ── Validation ────────────────────────────────────────────────────────


async def test_thin_reasoning_is_replaced_not_shown():
    """The reasoning goes on screen, so an unusable one must not reach it."""
    classifier = StubClassifier([_assessment(0.95, reasoning="ok")])
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)

    result = await _run(graph, _event())

    assert len(result["assessment"].reasoning) > 20
    assert any("thin-reasoning" in step for step in result["trace"])


async def test_safety_flag_overrides_contradictory_low_criticality():
    """A safety-critical LOW is self-contradictory; trust the safety flag."""
    classifier = StubClassifier(
        [_assessment(0.95, criticality=Criticality.LOW, safety_critical=True)]
    )
    graph = build_assessment_graph(classifier, confidence_threshold=0.80)

    result = await _run(graph, _event())

    assert result["assessment"].criticality is Criticality.HIGH
    assert any("promoted-low-to-high" in step for step in result["trace"])


# ── The offline classifier, end to end through the graph ──────────────


async def test_mock_classifier_reproduces_the_drone_contrast():
    """The demo, through the real graph with the offline classifier.

    Same drone, same description shape — opposite classifications, driven by the
    operational metadata rather than by the wording.
    """
    graph = build_assessment_graph(MockClassifier(), confidence_threshold=0.80)

    routine = await _run(
        graph,
        _event(
            id="evt-routine",
            asset_type=AssetType.DRONE,
            operation="Routine perimeter mapping",
            description="Scheduled photogrammetry sweep; imagery uploaded after landing.",
            metadata={"scheduled": True, "deferrable": True},
        ),
    )
    leak = await _run(
        graph,
        _event(
            id="evt-leak",
            asset_type=AssetType.DRONE,
            operation="Pipeline leak inspection",
            description="Emergency thermal inspection of a suspected gas leak.",
            metadata={"emergency": True, "deferrable": False, "hazard": "gas-leak"},
        ),
    )

    assert routine["assessment"].criticality is Criticality.LOW
    assert routine["assessment"].safety_critical is False

    assert leak["assessment"].criticality is Criticality.HIGH
    assert leak["assessment"].safety_critical is True
