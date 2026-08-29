"""State carried through the criticality assessment graph."""

from __future__ import annotations

from typing import Annotated, TypedDict

from ..shared.models import BusinessEvent, CriticalityAssessment


def _append(existing: list[str], incoming: list[str]) -> list[str]:
    """Reducer so every node can append to the trace without clobbering it."""
    return [*existing, *incoming]


class AssessmentState(TypedDict, total=False):
    """Working state of one criticality assessment.

    Ephemeral by design. Durability belongs to Temporal, which owns the
    operation lifecycle; this graph runs entirely inside a single activity and
    is retried as a whole if it fails. Adding a LangGraph checkpointer here
    would create a second, competing persistence layer.
    """

    event: BusinessEvent
    #: Extra facility context, populated by the enrich node when confidence is low.
    context: dict | None
    assessment: CriticalityAssessment | None
    #: Number of classification passes so far — bounds the escalation loop.
    attempts: int
    #: Model used for the most recent pass.
    model: str | None
    #: Whether the evidence step has already run, so it runs at most once.
    enriched: bool
    #: Read-only CAMARA tools, bound to this operation's device. Live object,
    #: not serialised — the graph has no checkpointer by design.
    toolbox: object | None
    #: What the agent chose to check, and what it learned.
    evidence: object | None
    #: Human-readable record of the path taken, surfaced in the decision trail.
    trace: Annotated[list[str], _append]
