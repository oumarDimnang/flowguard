"""Guards for the OpenRouter client construction.

``ChatOpenRouter`` is a Pydantic model configured with ``extra="ignore"``, which
makes a wrong keyword **silently disappear instead of raising**. An earlier
version of this code passed ``extra_body={"models": [...], "sort": "latency"}``
— a field the package does not have — so model fallbacks and latency routing
were quietly discarded on every call, with nothing to notice.

These tests read the settings back off a constructed instance rather than
trusting that passing them worked.
"""

from __future__ import annotations

import pytest

pytest.importorskip(
    "langchain_openrouter",
    reason="optional 'openrouter' extra is not installed",
)

from langchain_openrouter import ChatOpenRouter

from flowguard_agent.llm.client import (
    OPENROUTER_PROVIDER_PREFS,
    _openrouter_kwargs,
)

MODEL = "openai/gpt-5.6-luna"
FALLBACK = "openai/gpt-5.6-terra"


def _chat(fallbacks: list[str] | None = None) -> ChatOpenRouter:
    return ChatOpenRouter(
        api_key="sk-or-test-not-a-real-key",
        **_openrouter_kwargs(MODEL, fallbacks or []),
    )


# ── The bug this file exists to prevent ───────────────────────────────


def test_every_kwarg_we_pass_is_a_real_field():
    """A typo here is silent, so assert the field names exist."""
    fields = set(ChatOpenRouter.model_fields)
    aliases = {
        f.alias for f in ChatOpenRouter.model_fields.values() if getattr(f, "alias", None)
    }
    known = fields | aliases

    for name in _openrouter_kwargs(MODEL, [FALLBACK]):
        assert name in known, f"'{name}' is not a ChatOpenRouter field and would be dropped"


def test_extra_body_is_not_how_this_package_works():
    """Pins the specific mistake that was made, so it cannot come back."""
    assert "extra_body" not in ChatOpenRouter.model_fields
    assert "extra_body" not in _openrouter_kwargs(MODEL, [FALLBACK])


# ── Settings actually reach the instance ──────────────────────────────


def test_provider_preferences_are_applied():
    """Latency routing and data_collection=deny must survive construction."""
    chat = _chat()

    assert chat.openrouter_provider == OPENROUTER_PROVIDER_PREFS
    assert chat.openrouter_provider["sort"] == "latency"
    assert chat.openrouter_provider["data_collection"] == "deny"


def test_model_fallbacks_are_applied_in_priority_order():
    """The primary must lead the list; OpenRouter tries them in order."""
    chat = _chat([FALLBACK])

    assert chat.model_kwargs["models"] == [MODEL, FALLBACK]


def test_no_fallback_list_when_none_configured():
    """Do not send an empty or single-entry models array for no reason."""
    chat = _chat([])
    assert "models" not in chat.model_kwargs


def test_classification_is_deterministic():
    """Same event, same classification — the impact metrics depend on it."""
    assert _chat().temperature == 0


def test_retries_are_bounded():
    """The decision sits inside a latency budget; retries cannot be unbounded."""
    assert _chat().max_retries == 2


# ── Capabilities the agent depends on ─────────────────────────────────


def test_structured_output_and_tool_binding_are_available():
    """Criticality needs typed output; evidence gathering needs tool binding."""
    chat = _chat()

    assert hasattr(chat, "with_structured_output")
    assert hasattr(chat, "bind_tools")
