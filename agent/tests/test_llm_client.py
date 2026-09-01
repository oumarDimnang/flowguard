"""Tests for OpenRouter chat-model construction.

These check which request parameters actually reach `ChatOpenRouter`, not
model behaviour — no network call, no API key needed.

Regression coverage for a bug found on the first real (non-mock) run:
`extra_body` (the catch-all pass-through some OpenAI-compatible SDKs accept)
is not a parameter of the installed `openrouter` SDK's `send()`/`send_async()`.
`ChatOpenRouter` happily accepts `extra_body` at construction time — the
failure only surfaces as a `TypeError` on the first real classification call,
which is exactly why no test caught it before this.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from flowguard_agent.llm.client import OpenRouterClassifier, build_chat_model


def test_openrouter_classifier_does_not_use_extra_body():
    with patch("langchain_openrouter.ChatOpenRouter") as mock_chat_cls:
        classifier = OpenRouterClassifier(
            api_key="test-key",
            default_model="openai/gpt-5.6-luna",
            fallback_models=["openai/gpt-5.6-terra"],
        )
        classifier._build("openai/gpt-5.6-luna")

        _, kwargs = mock_chat_cls.call_args
        assert "extra_body" not in kwargs, (
            "extra_body is silently accepted by ChatOpenRouter's constructor "
            "but rejected by the installed openrouter SDK's send()/send_async() "
            "with a TypeError at call time"
        )
        assert kwargs["model_kwargs"]["models"] == [
            "openai/gpt-5.6-luna",
            "openai/gpt-5.6-terra",
        ]
        assert kwargs["openrouter_provider"] == {"sort": "latency"}


def test_build_chat_model_does_not_use_extra_body():
    settings = MagicMock()
    settings.llm_model = "openai/gpt-5.6-luna"
    settings.openrouter_api_key = "test-key"
    settings.fallback_models = ["openai/gpt-5.6-terra"]

    with patch("langchain_openrouter.ChatOpenRouter") as mock_chat_cls:
        build_chat_model(settings)

        _, kwargs = mock_chat_cls.call_args
        assert "extra_body" not in kwargs
        assert kwargs["model_kwargs"]["models"] == [
            "openai/gpt-5.6-luna",
            "openai/gpt-5.6-terra",
        ]
        assert kwargs["openrouter_provider"] == {"sort": "latency"}
