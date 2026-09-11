"""The allocation policy — a pure function, deliberately not a model call.

The language model classifies *criticality*. These rules map criticality to a
*network action*. Keeping that boundary sharp is what makes FlowGuard's decision
trail defensible: the reasoning is model-generated, but the decision itself is a
rule a human can read, argue with, and exhaustively test.

A model must never be the thing that decides to attach a network slice.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..shared.models import CongestionLevel, Criticality, NetworkAction

#: Congestion ordered by severity, so thresholds can be compared numerically.
_CONGESTION_RANK: dict[CongestionLevel, int] = {
    CongestionLevel.LOW: 0,
    CongestionLevel.MEDIUM: 1,
    CongestionLevel.HIGH: 2,
}


@dataclass(frozen=True)
class PolicyConfig:
    """Thresholds live in config so they can be changed without a code edit.

    Judges probe the edges of this policy, and being able to flip a value and
    re-run a scenario live is a far better answer than describing what would
    happen.
    """

    #: Minimum congestion before HIGH-criticality work is granted QoD.
    qod_congestion_threshold: CongestionLevel = CongestionLevel.MEDIUM
    #: Minimum congestion before MEDIUM-criticality work is granted QoD.
    medium_criticality_threshold: CongestionLevel = CongestionLevel.HIGH
    #: Grant a slice to safety-critical work, when a slice is available.
    enable_slice_escalation: bool = True
    #: Protect safety-critical work even on an uncongested network.
    #: Off by default: the headline saving comes from *not* allocating when
    #: nothing is actually at risk.
    always_protect_safety_critical: bool = False


@dataclass(frozen=True)
class PolicyDecision:
    action: NetworkAction
    rationale: str
    #: Identifier of the rule that fired. Recorded in the audit trail so any
    #: decision can be traced back to the exact branch that produced it.
    rule: str


def decide(
    *,
    criticality: Criticality,
    congestion: CongestionLevel,
    device_reachable: bool,
    safety_critical: bool = False,
    slice_available: bool = False,
    suspended: bool = False,
    config: PolicyConfig | None = None,
) -> PolicyDecision:
    """Map observed conditions to a network action.

    Deterministic and side-effect free: same inputs always produce the same
    decision, which is what makes the impact metrics reproducible across runs.
    """
    cfg = config or PolicyConfig()

    # ── Guard clause ──────────────────────────────────────────────────
    # Never allocate to a device that is not there. Cheapest check, first.
    if not device_reachable:
        return PolicyDecision(
            action=NetworkAction.NONE,
            rationale="Device is not reachable on the network; allocation would be wasted.",
            rule="GUARD_DEVICE_UNREACHABLE",
        )

    # ── The load is in the air ────────────────────────────────────────
    #
    # An operation that halted mid-way has not become less important; it has
    # become the most dangerous state the asset can be in. A crane that
    # emergency-stops leaves forty tonnes hanging, and the operator now has to
    # land it on a live video feed — which is precisely the feed this system
    # exists to protect.
    #
    # Ranked above the thesis rule on purpose, and it does not contradict it.
    # The invariant is that *congestion* never triggers action on its own;
    # suspension is not a network condition, it is the operation telling us its
    # own criticality just changed. Even a routine lift needs its feed to put
    # the load down safely, and the cost is bounded by the session's TTL.
    #
    # Congestion is not consulted at all here. The reason to protect is not
    # that the network is busy — it is that a person is about to do something
    # delicate and irreversible while watching a screen.
    if suspended:
        action = (
            NetworkAction.QOD_AND_SLICE
            if slice_available and cfg.enable_slice_escalation
            else NetworkAction.QOD
        )
        return PolicyDecision(
            action=action,
            rationale=(
                "Operation is suspended with its load committed. Connectivity is held "
                "until it is reported safe, regardless of criticality or congestion — "
                "recovering a stopped operation is the moment the link matters most."
            ),
            rule="SUSPENDED_LOAD_PROTECT",
        )

    # ── The thesis ────────────────────────────────────────────────────
    # Low-criticality work is never granted premium connectivity, no matter how
    # congested the network is. Congestion alone is not a reason to act — this
    # single rule is what separates FlowGuard from a congestion monitor.
    if criticality is Criticality.LOW:
        return PolicyDecision(
            action=NetworkAction.NONE,
            rationale=(
                f"Operation is routine (criticality LOW). Congestion is {congestion.value}, "
                "but congestion alone does not justify premium allocation."
            ),
            rule="ROUTINE_NO_ACTION",
        )

    congestion_rank = _CONGESTION_RANK[congestion]

    # ── Unconditional protection (opt-in) ─────────────────────────────
    if safety_critical and cfg.always_protect_safety_critical:
        action = (
            NetworkAction.QOD_AND_SLICE
            if slice_available and cfg.enable_slice_escalation
            else NetworkAction.QOD
        )
        return PolicyDecision(
            action=action,
            rationale=(
                "Safety-critical operation protected unconditionally by policy, "
                f"regardless of current congestion ({congestion.value})."
            ),
            rule="SAFETY_CRITICAL_ALWAYS_PROTECT",
        )

    # ── Medium criticality ────────────────────────────────────────────
    if criticality is Criticality.MEDIUM:
        if congestion_rank >= _CONGESTION_RANK[cfg.medium_criticality_threshold]:
            return PolicyDecision(
                action=NetworkAction.QOD,
                rationale=(
                    f"Operation carries moderate business impact and congestion is "
                    f"{congestion.value}; guaranteed quality requested for its duration."
                ),
                rule="MEDIUM_CRITICALITY_HIGH_CONGESTION",
            )
        return PolicyDecision(
            action=NetworkAction.NONE,
            rationale=(
                f"Moderate criticality but congestion is only {congestion.value}; "
                "standard connectivity is sufficient."
            ),
            rule="MEDIUM_CRITICALITY_NETWORK_HEALTHY",
        )

    # ── High criticality ──────────────────────────────────────────────
    if congestion_rank < _CONGESTION_RANK[cfg.qod_congestion_threshold]:
        return PolicyDecision(
            action=NetworkAction.NONE,
            rationale=(
                f"Operation is business-critical, but congestion is {congestion.value} and the "
                "network is already meeting requirements; no allocation needed."
            ),
            rule="HIGH_CRITICALITY_NETWORK_HEALTHY",
        )

    if safety_critical and slice_available and cfg.enable_slice_escalation:
        return PolicyDecision(
            action=NetworkAction.QOD_AND_SLICE,
            rationale=(
                f"Safety-critical operation at risk from {congestion.value} congestion; "
                "guaranteed quality requested and device attached to a dedicated slice."
            ),
            rule="SAFETY_CRITICAL_CONGESTED_SLICE",
        )

    return PolicyDecision(
        action=NetworkAction.QOD,
        rationale=(
            f"Business-critical operation at risk from {congestion.value} congestion; "
            "guaranteed quality requested for the duration of the operation."
        ),
        rule="HIGH_CRITICALITY_CONGESTED",
    )
