"""Deciding what evidence to gather — the orchestration step.

When the first classification pass is not confident enough, the agent chooses
which network signal would resolve its uncertainty and calls it. That choice is
made here.

Two implementations behind one interface, matching the classifier split: a
deterministic one that works offline, and one that lets the model pick its own
tools. Both are bounded — the agent gets freedom over *what to look at*, never
over *what to do*.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from ..prompts import TOOL_SELECTION_SYSTEM, build_user_prompt, get_prompt
from ..shared.models import BusinessEvent
from ..tools.network_tools import NetworkToolbox, ToolCall

logger = logging.getLogger(__name__)

#: Metadata keys carrying the coordinates an operation claims to be at.
SITE_LAT_KEYS = ("sitelatitude", "site_latitude", "latitude", "lat")
SITE_LON_KEYS = ("sitelongitude", "site_longitude", "longitude", "lon", "lng")

#: How close an asset must be to its claimed site to count as present.
DEFAULT_VERIFY_RADIUS_M = 2_000


@dataclass
class Evidence:
    """What the agent learned, and how it learned it."""

    facts: dict[str, str] = field(default_factory=dict)
    tool_calls: list[ToolCall] = field(default_factory=list)

    @property
    def contradicted(self) -> bool:
        """True when a tool actively disproved something the operation claimed.

        This is the signal worth acting on: not an absence of confirmation, but
        the network stating the operation is not where it says it is.
        """
        return any(
            call.name == "verify_device_location"
            and not call.failed
            and call.result.startswith("CONTRADICTED")
            for call in self.tool_calls
        )


def _coordinate(metadata: dict, keys: tuple[str, ...]) -> float | None:
    lowered = {str(k).lower(): v for k, v in metadata.items()}
    for key in keys:
        if key in lowered:
            try:
                return float(lowered[key])
            except (TypeError, ValueError):
                continue
    return None


class EvidenceGatherer(ABC):
    @abstractmethod
    async def gather(self, event: BusinessEvent, toolbox: NetworkToolbox) -> Evidence: ...


# ──────────────────────────────────────────────────────────────────────
# Offline
# ──────────────────────────────────────────────────────────────────────


class HeuristicEvidenceGatherer(EvidenceGatherer):
    """Deterministic tool selection for offline operation.

    Applies the rule a competent operator would: if an operation claims to be at
    a specific hazardous site, confirm the asset is actually there before
    treating the claim as safety-critical.
    """

    async def gather(self, event: BusinessEvent, toolbox: NetworkToolbox) -> Evidence:
        evidence = Evidence()
        metadata = event.metadata or {}

        latitude = _coordinate(metadata, SITE_LAT_KEYS)
        longitude = _coordinate(metadata, SITE_LON_KEYS)

        claims_urgency = bool(
            metadata.get("emergency") or metadata.get("hazard") or metadata.get("overWalkway")
        )

        if latitude is not None and longitude is not None and claims_urgency:
            call = await toolbox.call(
                "verify_device_location",
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "radius_meters": int(
                        metadata.get("siteRadiusMeters") or DEFAULT_VERIFY_RADIUS_M
                    ),
                },
            )
            evidence.tool_calls.append(call)
            evidence.facts["location_check"] = call.result

        return evidence


# ──────────────────────────────────────────────────────────────────────
# Model-driven
# ──────────────────────────────────────────────────────────────────────

class LLMEvidenceGatherer(EvidenceGatherer):
    """Lets the model choose its own tools.

    Bounded to a single round: one decision about what to check, then the
    results go back into classification. Enough for genuine orchestration
    without an unbounded loop inside a latency budget.
    """

    def __init__(self, chat_model, *, max_tool_calls: int = 3) -> None:
        self._chat = chat_model
        self._max_tool_calls = max_tool_calls

    async def gather(self, event: BusinessEvent, toolbox: NetworkToolbox) -> Evidence:
        evidence = Evidence()

        from ..observability.langfuse_setup import langchain_callbacks

        bound = self._chat.bind_tools(toolbox.schemas)
        response = await bound.ainvoke(
            [
                ("system", get_prompt(TOOL_SELECTION_SYSTEM)),
                ("human", build_user_prompt(event)),
            ],
            config={"callbacks": langchain_callbacks()},
        )

        requested = getattr(response, "tool_calls", None) or []
        if not requested:
            logger.info("Agent chose to gather no additional evidence for %s", event.id)
            return evidence

        for request in requested[: self._max_tool_calls]:
            name = request.get("name") if isinstance(request, dict) else request.name
            raw_args = request.get("args") if isinstance(request, dict) else request.args

            if isinstance(raw_args, str):
                try:
                    raw_args = json.loads(raw_args)
                except json.JSONDecodeError:
                    raw_args = {}

            logger.info("Agent chose tool '%s' for %s", name, event.id)
            call = await toolbox.call(name, raw_args or {})
            evidence.tool_calls.append(call)
            evidence.facts[name] = call.result

        return evidence
