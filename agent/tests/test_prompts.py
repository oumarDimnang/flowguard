"""Prompt integrity.

The prompts are the only place a model is trusted to form a judgement, and their
output is rendered verbatim on an operations dashboard. A prompt that silently
fails to load, or drifts away from the schema the model must fill, is a failure
mode worth a test rather than a code review.
"""

from __future__ import annotations

import pytest

from flowguard_agent.prompts import (
    CRITICALITY_SYSTEM,
    TOOL_SELECTION_SYSTEM,
    available_prompts,
    build_user_prompt,
    get_prompt,
)
from flowguard_agent.shared.models import AssetType, BusinessEvent, DeviceRef


def _event(**kwargs) -> BusinessEvent:
    return BusinessEvent(
        id="evt-1",
        asset_type=kwargs.pop("asset_type", AssetType.CRANE),
        device=DeviceRef(id="crane-a", phone_number="+99999991001"),
        operation=kwargs.pop("operation", "Move Container #A392"),
        expected_duration_seconds=180,
        **kwargs,
    )


# ── Loading ───────────────────────────────────────────────────────────


def test_every_named_prompt_resolves_to_a_template():
    """A constant pointing at a missing file would fail at the worst moment."""
    bundled = available_prompts()
    for name in (CRITICALITY_SYSTEM, TOOL_SELECTION_SYSTEM):
        assert name in bundled, f"'{name}' has no template file"


def test_unknown_prompt_fails_loudly():
    with pytest.raises(KeyError):
        get_prompt("does_not_exist", allow_managed=False)


def test_prompts_load_from_the_package_not_the_working_directory():
    """Loaded via importlib.resources, so an installed wheel behaves the same."""
    text = get_prompt(CRITICALITY_SYSTEM, allow_managed=False)
    assert len(text) > 500
    assert not text.startswith("\n")


# ── Content contracts ─────────────────────────────────────────────────


def test_criticality_prompt_defines_every_level_the_schema_accepts():
    """The model must be told what each value it can return actually means."""
    text = get_prompt(CRITICALITY_SYSTEM, allow_managed=False)
    for level in ("HIGH", "MEDIUM", "LOW"):
        assert level in text, f"criticality level {level} is undefined in the prompt"


def test_criticality_prompt_forbids_choosing_a_network_action():
    """The boundary that keeps allocation deterministic, stated to the model.

    The rules layer enforces it regardless, but a model that believes it is
    choosing the network action will write reasoning that says so — and that
    reasoning is what a judge reads on screen.
    """
    text = get_prompt(CRITICALITY_SYSTEM, allow_managed=False)
    assert "classify criticality only" in text.lower()
    assert "do not decide what network action" in text.lower()


def test_criticality_prompt_constrains_the_safety_flag():
    text = get_prompt(CRITICALITY_SYSTEM, allow_managed=False)
    assert "safety_critical" in text
    assert "financial loss alone is not safety-critical" in text.lower()


def test_tool_selection_prompt_discourages_pointless_calls():
    """Latency budget: a tool whose answer changes nothing must not be called."""
    text = get_prompt(TOOL_SELECTION_SYSTEM, allow_managed=False)
    assert "call nothing" in text.lower()
    assert "verify" in text.lower()


# ── User prompt assembly ──────────────────────────────────────────────


def test_user_prompt_includes_the_decisive_fields():
    prompt = build_user_prompt(
        _event(
            description="Remote lift over an active walkway.",
            site="Khalifa Bin Salman Port",
            metadata={"loadTonnes": 40, "overWalkway": True},
        )
    )

    assert "Move Container #A392" in prompt
    assert "Khalifa Bin Salman Port" in prompt
    assert "loadTonnes" in prompt
    assert "overWalkway" in prompt


def test_user_prompt_omits_absent_sections():
    """A facility that supplies nothing optional must not produce empty headings."""
    prompt = build_user_prompt(_event())

    assert "Description:" not in prompt
    assert "Operational metadata:" not in prompt
    assert "Site:" not in prompt


def test_gathered_context_is_labelled_as_verified():
    """Evidence from the network outranks the operation's self-description.

    The label is what tells the model to trust a location contradiction over a
    convincing description of a gas leak.
    """
    prompt = build_user_prompt(
        _event(),
        context={"location_check": "CONTRADICTED: the device is NOT within 2000m."},
    )

    assert "Verified context" in prompt
    assert "CONTRADICTED" in prompt


def test_metadata_ordering_is_stable():
    """Same event, same prompt — otherwise classifications drift between runs."""
    event = _event(metadata={"zebra": 1, "alpha": 2, "middle": 3})
    assert build_user_prompt(event) == build_user_prompt(event)
    assert build_user_prompt(event).index("alpha") < build_user_prompt(event).index("zebra")
