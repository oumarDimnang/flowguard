"""Exhaustive tests for the allocation policy.

The policy is a pure function, so the entire decision space is cheap to cover
completely — which matters, because this is the code that decides whether a
safety-critical operation gets protected.
"""

from __future__ import annotations

import itertools

import pytest

from flowguard_agent.policy.rules import PolicyConfig, decide
from flowguard_agent.shared.models import CongestionLevel, Criticality, NetworkAction

ALL_CRITICALITY = list(Criticality)
ALL_CONGESTION = list(CongestionLevel)


# ── The thesis ────────────────────────────────────────────────────────


def test_low_criticality_never_allocates_regardless_of_congestion():
    """The single rule that separates FlowGuard from a congestion monitor.

    If this ever fails, the product is just reacting to network load and the
    entire pitch is void.
    """
    for congestion in ALL_CONGESTION:
        decision = decide(
            criticality=Criticality.LOW,
            congestion=congestion,
            device_reachable=True,
        )
        assert decision.action is NetworkAction.NONE, f"allocated on {congestion} for LOW"
        assert decision.rule == "ROUTINE_NO_ACTION"


def test_drone_contrast_pair():
    """The live demo, asserted.

    Same device, same HIGH congestion, five minutes apart. Routine mapping is
    refused; the pipeline leak inspection is granted. Only business criticality
    differs.
    """
    routine = decide(
        criticality=Criticality.LOW,
        congestion=CongestionLevel.HIGH,
        device_reachable=True,
        safety_critical=False,
    )
    leak = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.HIGH,
        device_reachable=True,
        safety_critical=True,
        slice_available=True,
    )

    assert routine.action is NetworkAction.NONE
    assert leak.action is NetworkAction.QOD_AND_SLICE
    assert routine.rule != leak.rule


# ── Guard clause ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("criticality", "congestion"), list(itertools.product(ALL_CRITICALITY, ALL_CONGESTION))
)
def test_unreachable_device_never_allocates(criticality, congestion):
    """Never spend money on a device that is not on the network."""
    decision = decide(
        criticality=criticality,
        congestion=congestion,
        device_reachable=False,
        safety_critical=True,
        slice_available=True,
    )
    assert decision.action is NetworkAction.NONE
    assert decision.rule == "GUARD_DEVICE_UNREACHABLE"


# ── High criticality ──────────────────────────────────────────────────


def test_high_criticality_on_healthy_network_does_not_allocate():
    """Where the cost saving comes from: no risk, no spend."""
    decision = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.LOW,
        device_reachable=True,
    )
    assert decision.action is NetworkAction.NONE
    assert decision.rule == "HIGH_CRITICALITY_NETWORK_HEALTHY"


@pytest.mark.parametrize("congestion", [CongestionLevel.MEDIUM, CongestionLevel.HIGH])
def test_high_criticality_under_congestion_grants_qod(congestion):
    decision = decide(
        criticality=Criticality.HIGH,
        congestion=congestion,
        device_reachable=True,
    )
    assert decision.action is NetworkAction.QOD


def test_safety_critical_escalates_to_slice_when_available():
    decision = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.HIGH,
        device_reachable=True,
        safety_critical=True,
        slice_available=True,
    )
    assert decision.action is NetworkAction.QOD_AND_SLICE


def test_safety_critical_degrades_to_qod_when_no_slice():
    """Slicing is not universally supported; the guarantee must still apply."""
    decision = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.HIGH,
        device_reachable=True,
        safety_critical=True,
        slice_available=False,
    )
    assert decision.action is NetworkAction.QOD


# ── Medium criticality ────────────────────────────────────────────────


def test_medium_criticality_only_allocates_under_high_congestion():
    granted = decide(
        criticality=Criticality.MEDIUM,
        congestion=CongestionLevel.HIGH,
        device_reachable=True,
    )
    withheld = decide(
        criticality=Criticality.MEDIUM,
        congestion=CongestionLevel.MEDIUM,
        device_reachable=True,
    )
    assert granted.action is NetworkAction.QOD
    assert withheld.action is NetworkAction.NONE


# ── Configurable policy ───────────────────────────────────────────────


def test_always_protect_flag_allocates_on_healthy_network():
    """The open policy question, made switchable rather than argued about."""
    config = PolicyConfig(always_protect_safety_critical=True)

    default = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.LOW,
        device_reachable=True,
        safety_critical=True,
        slice_available=True,
    )
    protective = decide(
        criticality=Criticality.HIGH,
        congestion=CongestionLevel.LOW,
        device_reachable=True,
        safety_critical=True,
        slice_available=True,
        config=config,
    )

    assert default.action is NetworkAction.NONE
    assert protective.action is NetworkAction.QOD_AND_SLICE
    assert protective.rule == "SAFETY_CRITICAL_ALWAYS_PROTECT"


# ── Invariants across the whole space ─────────────────────────────────


@pytest.mark.parametrize(
    ("criticality", "congestion", "safety"),
    list(itertools.product(ALL_CRITICALITY, ALL_CONGESTION, [True, False])),
)
def test_every_decision_is_explained_and_attributable(criticality, congestion, safety):
    """No decision may be unexplained — the audit trail depends on it."""
    decision = decide(
        criticality=criticality,
        congestion=congestion,
        device_reachable=True,
        safety_critical=safety,
        slice_available=True,
    )
    assert decision.rule, "every decision must name the rule that fired"
    assert len(decision.rationale) > 30, "every decision must carry a human-readable rationale"
    assert decision.action in NetworkAction
