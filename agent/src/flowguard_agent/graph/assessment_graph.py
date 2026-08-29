"""The criticality assessment graph — FlowGuard's AI agent layer.

Not a wrapper around a single model call. The graph exists because a
low-confidence judgement about a safety-critical operation is a real condition
that deserves a real response:

    classify ──unsure?──▶ gather evidence ──▶ re-classify
        │                (agent picks which        │
        │                 network APIs to call)    │
        │                                          │
        │                  still unsure? ──▶ escalate model
        ▼                                          │
     validate ◀────────────────────────────────────┘

The cheap, fast model handles routine traffic. When it is genuinely unsure about
something that could hurt someone, the agent decides for itself what evidence
would settle the question — then, failing that, escalates to a stronger model
before any network resource is committed.

The evidence step is where the agent orchestrates rather than executes: it
chooses which CAMARA read APIs to call. It has no write tools, so it can never
commit paid capacity on its own judgement — that stays with ``policy.rules``.

Runs entirely inside a Temporal activity; workflow code must stay deterministic.
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from ..llm.client import CriticalityClassifier
from ..shared.models import BusinessEvent, Criticality, CriticalityAssessment
from .evidence import Evidence, EvidenceGatherer
from .state import AssessmentState

logger = logging.getLogger(__name__)

#: Static asset knowledge, merged alongside whatever the agent gathers.
#:
#: A real deployment would retrieve this from the facility's asset register and
#: safety documentation; keeping it inline keeps the agent runnable offline
#: while the shape stays honest.
ASSET_PROFILES: dict[str, dict[str, str]] = {
    "CRANE": {
        "control_mode": "remotely operated from a control room over a live video feed",
        "failure_mode": "loss of feed forces an emergency stop with the load suspended",
        "latency_budget": "under 30 ms end-to-end; multiple video feeds at ~30 Mbps each",
    },
    "DRONE": {
        "control_mode": "autonomous flight; operators act on the streamed sensor feed",
        "failure_mode": "loss of feed delays a human decision but the aircraft stays airborne",
        "latency_budget": "tolerant for recorded survey work, tight for live inspection",
    },
    "AMBULANCE": {
        "control_mode": "crew on scene; clinicians consult remotely over live video",
        "failure_mode": "loss of feed interrupts clinical decision-making in transit",
        "latency_budget": "conversational latency; interruptions are clinically significant",
    },
    "VEHICLE": {
        "control_mode": "driver or autonomous stack with remote supervision",
        "failure_mode": "loss of link degrades coordination and situational awareness",
        "latency_budget": "moderate",
    },
    "CAMERA": {
        "control_mode": "fixed sensor streaming to an operations centre",
        "failure_mode": "gap in coverage; typically recoverable from local storage",
        "latency_budget": "loose",
    },
}


def build_assessment_graph(
    classifier: CriticalityClassifier,
    *,
    evidence_gatherer: EvidenceGatherer | None = None,
    confidence_threshold: float = 0.80,
    escalation_model: str | None = None,
    max_attempts: int = 3,
):
    """Compile the assessment graph.

    Dependencies are injected rather than constructed so every branch can be
    driven by stubs, with no model and no network.
    """

    async def classify(state: AssessmentState) -> dict:
        event: BusinessEvent = state["event"]
        attempts = state.get("attempts", 0) + 1
        model = state.get("model")

        assessment = await classifier.classify(
            event,
            context=state.get("context"),
            model=model,
        )

        logger.info(
            "Classified %s as %s (confidence %.2f, model %s)",
            event.id,
            assessment.criticality.value,
            assessment.confidence,
            assessment.model,
        )

        return {
            "assessment": assessment,
            "attempts": attempts,
            "trace": [
                (
                    f"classify(attempt={attempts}, model={assessment.model}) -> "
                    f"{assessment.criticality.value} @ {assessment.confidence:.2f}"
                )
            ],
        }

    async def gather_evidence(state: AssessmentState) -> dict:
        """The agent decides what to check, then checks it.

        Static asset context is merged in regardless; the interesting part is the
        tool calls, where the agent chooses which CAMARA read APIs would resolve
        its uncertainty.
        """
        event: BusinessEvent = state["event"]
        toolbox = state.get("toolbox")

        context = {**(state.get("context") or {}), **ASSET_PROFILES.get(event.asset_type.value, {})}
        if event.site:
            context["site"] = event.site

        evidence = Evidence()
        if evidence_gatherer is not None and toolbox is not None:
            evidence = await evidence_gatherer.gather(event, toolbox)
            context.update(evidence.facts)

        trace = [f"gather_evidence(facts={len(context)}, tools={len(evidence.tool_calls)})"]
        trace += [f"  tool:{call.name} -> {call.result[:80]}" for call in evidence.tool_calls]

        return {
            "context": context,
            "enriched": True,
            "evidence": evidence,
            "trace": trace,
        }

    async def escalate(state: AssessmentState) -> dict:
        """Move to a stronger model and try once more.

        Cost follows risk: the cheap model handles the routine majority, and only
        genuine uncertainty pays for the expensive one.
        """
        return {
            "model": escalation_model,
            "trace": [f"escalate(model={escalation_model or 'default'})"],
        }

    async def validate(state: AssessmentState) -> dict:
        """Final checks before the assessment leaves the graph."""
        assessment: CriticalityAssessment | None = state.get("assessment")
        evidence: Evidence | None = state.get("evidence")

        if assessment is None:
            logger.warning("Assessment graph produced no result; degrading to MEDIUM")
            return {
                "assessment": CriticalityAssessment(
                    criticality=Criticality.MEDIUM,
                    confidence=0.0,
                    reasoning="Criticality could not be assessed; defaulted to MEDIUM.",
                    safety_critical=False,
                    model="none",
                ),
                "trace": ["validate(degraded=no-assessment)"],
            }

        notes: list[str] = []

        # The network contradicted the operation's own claim about where it is
        # happening. A hazardous-site inspection by an asset that is not at the
        # site is not a hazardous-site inspection, and it should not receive
        # safety-critical treatment on the strength of its description.
        if (
            evidence is not None
            and evidence.contradicted
            and (assessment.criticality is Criticality.HIGH or assessment.safety_critical)
        ):
            assessment.criticality = Criticality.MEDIUM
            assessment.safety_critical = False
            assessment.reasoning = (
                f"{assessment.reasoning} However, network location verification "
                "contradicts the stated site: the device is not where this operation "
                "claims to be taking place, so it is not treated as safety-critical."
            )
            notes.append("downgraded-on-location-contradiction")

        if not assessment.reasoning or len(assessment.reasoning.strip()) < 20:
            assessment.reasoning = (
                f"Classified {assessment.criticality.value} from the operation description; "
                "the model did not supply a usable justification."
            )
            notes.append("thin-reasoning")

        # A safety-critical flag on low-criticality work is self-contradictory.
        # Trust the flag: it is the more consequential of the two.
        if assessment.safety_critical and assessment.criticality is Criticality.LOW:
            assessment.criticality = Criticality.HIGH
            notes.append("promoted-low-to-high-on-safety-flag")

        assessment.escalated = bool(state.get("model"))

        return {
            "assessment": assessment,
            "trace": [f"validate({', '.join(notes) if notes else 'ok'})"],
        }

    def route(state: AssessmentState) -> str:
        """Accept, gather evidence, or escalate."""
        assessment: CriticalityAssessment | None = state.get("assessment")
        attempts = state.get("attempts", 0)

        if assessment is None:
            return "validate"

        # A safety-critical claim is worth verifying even when the model is
        # confident: confidence in a description says nothing about whether the
        # description is true.
        if assessment.safety_critical and not state.get("enriched"):
            return "gather_evidence"

        if assessment.confidence >= confidence_threshold:
            return "validate"

        if attempts >= max_attempts:
            logger.info("Confidence still low after %d attempts; accepting", attempts)
            return "validate"

        if not state.get("enriched"):
            return "gather_evidence"

        if escalation_model and not state.get("model"):
            return "escalate"

        return "validate"

    builder = StateGraph(AssessmentState)
    builder.add_node("classify", classify)
    builder.add_node("gather_evidence", gather_evidence)
    builder.add_node("escalate", escalate)
    builder.add_node("validate", validate)

    builder.add_edge(START, "classify")
    builder.add_conditional_edges(
        "classify",
        route,
        {
            "validate": "validate",
            "gather_evidence": "gather_evidence",
            "escalate": "escalate",
        },
    )
    builder.add_edge("gather_evidence", "classify")
    builder.add_edge("escalate", "classify")
    builder.add_edge("validate", END)

    return builder.compile()
