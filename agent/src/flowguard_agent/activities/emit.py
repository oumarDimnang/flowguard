"""Pushes decision events to the FlowGuard server.

This is the only outbound HTTP the worker makes to our own system. The server
owns MongoDB and the WebSocket fan-out, so everything the dashboard shows
arrives through here.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from temporalio import activity

from ..shared.constants import ACTIVITY_EMIT_DECISION

logger = logging.getLogger(__name__)


class EmitActivities:
    def __init__(self, *, base_url: str, token: str, timeout_seconds: float = 5.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._timeout = timeout_seconds

    @activity.defn(name=ACTIVITY_EMIT_DECISION)
    async def emit_decision(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST one decision record to the server.

        Safe to retry. The server deduplicates on ``{runId}:{step}``, so a
        replayed activity is recorded once — without that, a retry would
        double-render the decision trace and inflate the impact metrics.

        Activity failure here is deliberate rather than swallowed: if the audit
        trail is silently dropped, the demo shows an operation with no
        explanation, which is worse than a visible retry.
        """
        url = f"{self._base_url}/internal/decisions"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {self._token}"},
            )
            response.raise_for_status()
            body = response.json()

        if body.get("duplicate"):
            logger.debug("Decision %s already recorded", payload.get("step"))

        return body
