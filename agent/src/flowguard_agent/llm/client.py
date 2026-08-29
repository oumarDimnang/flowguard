"""Criticality classifiers.

Two implementations behind one interface, selected by ``LLM_PROVIDER``:

* ``mock`` — deterministic, offline, no API key. Reasons over the structured
  operational metadata a real model would also weigh. This is what makes the
  full loop runnable on a laptop with no internet, and it is the safe mode to
  fall back to on stage.
* ``openrouter`` — a real model through OpenRouter, which keeps the choice of
  model a config value rather than a code change.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Literal

from pydantic import BaseModel, Field

from ..observability.langfuse_setup import langchain_callbacks
from ..prompts import CRITICALITY_SYSTEM, build_user_prompt, get_prompt
from ..shared.models import BusinessEvent, Criticality, CriticalityAssessment

logger = logging.getLogger(__name__)


class CriticalityOutput(BaseModel):
    """Schema the model is forced to fill.

    Structured output is not a convenience here — a free-text answer would have
    to be parsed, and a parse failure on a safety-critical decision is exactly
    the failure mode worth engineering away.
    """

    criticality: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        description="Business criticality of the operation.",
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Genuine confidence in this classification."
    )
    safety_critical: bool = Field(
        description="True only if degraded connectivity could contribute to physical harm."
    )
    reasoning: str = Field(
        description="Two to three plain-language sentences justifying the classification."
    )


class CriticalityClassifier(ABC):
    @abstractmethod
    async def classify(
        self,
        event: BusinessEvent,
        context: dict | None = None,
        model: str | None = None,
    ) -> CriticalityAssessment: ...


# ──────────────────────────────────────────────────────────────────────
# Offline
# ──────────────────────────────────────────────────────────────────────

#: Words that suggest an irreversible or hazardous operation in progress.
_HIGH_SIGNALS = (
    "emergency",
    "leak",
    "gas",
    "hazard",
    "suspended",
    "lift",
    "evacuat",
    "stroke",
    "patient",
    "casualty",
    "fire",
    "collision",
)

#: Words that suggest deferrable, repeatable work.
_LOW_SIGNALS = ("routine", "scheduled", "periodic", "batch", "mapping", "survey", "inventory")


class MockClassifier(CriticalityClassifier):
    """Deterministic classifier driven by operational metadata and keywords.

    Metadata is checked before text because it is unambiguous: an explicit
    ``deferrable: true`` settles the question in a way prose cannot.
    """

    async def classify(
        self,
        event: BusinessEvent,
        context: dict | None = None,
        model: str | None = None,
    ) -> CriticalityAssessment:
        meta = {k.lower(): v for k, v in (event.metadata or {}).items()}
        haystack = f"{event.operation} {event.description or ''}".lower()

        emergency = bool(meta.get("emergency")) or bool(meta.get("patientcritical"))
        deferrable = bool(meta.get("deferrable")) or bool(meta.get("scheduled"))
        hazardous = bool(meta.get("hazard")) or bool(meta.get("overwalkway"))
        heavy = float(meta.get("loadtonnes") or 0) >= 10

        keyword_high = any(s in haystack for s in _HIGH_SIGNALS)
        keyword_low = any(s in haystack for s in _LOW_SIGNALS)

        if deferrable and not emergency:
            return CriticalityAssessment(
                criticality=Criticality.LOW,
                confidence=0.92,
                safety_critical=False,
                reasoning=(
                    f"'{event.operation}' is scheduled, deferrable work with no live decision "
                    "depending on it. Degraded connectivity would delay the task, not endanger "
                    "anyone, and the operation can simply be repeated later."
                ),
                model="mock",
            )

        if emergency or hazardous or (heavy and keyword_high):
            reasons = []
            if emergency:
                reasons.append("it is flagged as an emergency")
            if hazardous:
                reasons.append("it involves a hazard or a suspended load over people")
            if heavy:
                reasons.append(f"the load is {meta.get('loadtonnes')} tonnes")

            return CriticalityAssessment(
                criticality=Criticality.HIGH,
                confidence=0.94,
                safety_critical=True,
                reasoning=(
                    f"'{event.operation}' is safety-critical because {', and '.join(reasons)}. "
                    "A person is acting on this link in real time, and interrupting it mid-"
                    "operation cannot be undone safely."
                ),
                model="mock",
            )

        if keyword_high:
            return CriticalityAssessment(
                criticality=Criticality.HIGH,
                confidence=0.78,
                safety_critical=False,
                reasoning=(
                    f"'{event.operation}' appears time-critical and not easily reversible, "
                    "though no explicit hazard or emergency flag was supplied."
                ),
                model="mock",
            )

        if keyword_low:
            return CriticalityAssessment(
                criticality=Criticality.LOW,
                confidence=0.85,
                safety_critical=False,
                reasoning=(
                    f"'{event.operation}' reads as routine, repeatable work with no live "
                    "dependency on the connection."
                ),
                model="mock",
            )

        return CriticalityAssessment(
            criticality=Criticality.MEDIUM,
            confidence=0.60,
            safety_critical=False,
            reasoning=(
                f"'{event.operation}' carries operational impact if disrupted, but nothing "
                "indicates physical risk or an irreversible outcome."
            ),
            model="mock",
        )


# ──────────────────────────────────────────────────────────────────────
# OpenRouter
# ──────────────────────────────────────────────────────────────────────


class OpenRouterClassifier(CriticalityClassifier):
    """Real model through OpenRouter.

    The import is deferred so the package remains usable — and testable — with
    only the base dependencies installed.
    """

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        fallback_models: list[str] | None = None,
    ) -> None:
        self._api_key = api_key
        self._default_model = default_model
        self._fallbacks = fallback_models or []
        self._cache: dict[str, object] = {}

    def _build(self, model: str):
        if model in self._cache:
            return self._cache[model]

        try:
            from langchain_openrouter import ChatOpenRouter
        except ImportError as exc:  # pragma: no cover - depends on optional extra
            raise RuntimeError(
                "langchain-openrouter is not installed. "
                "Install the 'openrouter' extra, or set LLM_PROVIDER=mock."
            ) from exc

        chat = ChatOpenRouter(
            model=model,
            api_key=self._api_key,
            # Classification, not creative writing — determinism matters more
            # than variety, and the same event should classify the same way.
            temperature=0,
            max_retries=2,
            # Route to the lowest-latency endpoint: the decision sits inside a
            # ~2 second budget shared with several network calls.
            extra_body={"models": [model, *self._fallbacks], "sort": "latency"},
        )

        # method="json_schema" is required. Without it LangChain falls back to
        # function calling, which behaves differently across providers.
        structured = chat.with_structured_output(CriticalityOutput, method="json_schema")
        self._cache[model] = structured
        return structured

    async def classify(
        self,
        event: BusinessEvent,
        context: dict | None = None,
        model: str | None = None,
    ) -> CriticalityAssessment:
        target = model or self._default_model
        structured = self._build(target)

        messages = [
            ("system", get_prompt(CRITICALITY_SYSTEM)),
            ("human", build_user_prompt(event, context)),
        ]

        # Nests under the activity's Langfuse span, so token counts and cost
        # land on the same trace as the workflow that caused them.
        result: CriticalityOutput = await structured.ainvoke(
            messages, config={"callbacks": langchain_callbacks()}
        )

        return CriticalityAssessment(
            criticality=Criticality(result.criticality),
            confidence=result.confidence,
            reasoning=result.reasoning,
            safety_critical=result.safety_critical,
            model=target,
            escalated=target != self._default_model,
        )


def build_chat_model(settings):
    """Raw chat model for tool binding.

    The classifier wraps this with structured output; the evidence gatherer
    needs the unwrapped model so it can bind tools to it.
    """
    try:
        from langchain_openrouter import ChatOpenRouter
    except ImportError as exc:  # pragma: no cover - optional extra
        raise RuntimeError(
            "langchain-openrouter is not installed. "
            "Install the 'openrouter' extra, or set LLM_PROVIDER=mock."
        ) from exc

    return ChatOpenRouter(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        temperature=0,
        max_retries=2,
        extra_body={
            "models": [settings.llm_model, *settings.fallback_models],
            "sort": "latency",
        },
    )


def build_classifier(settings) -> CriticalityClassifier:
    """Select a classifier from configuration."""
    if settings.llm_provider == "openrouter":
        logger.info("Using OpenRouter classifier (model=%s)", settings.llm_model)
        return OpenRouterClassifier(
            api_key=settings.openrouter_api_key,
            default_model=settings.llm_model,
            fallback_models=settings.fallback_models,
        )

    logger.info("Using offline mock classifier")
    return MockClassifier()
