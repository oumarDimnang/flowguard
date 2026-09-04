"""Reads the current policy configuration for a workflow run.

Workflow code cannot read ``Settings``/environment variables directly:
Temporal replays a workflow's ``run()`` to rebuild state, and a value that
could change between the original execution and a later replay (an operator
edits ``.env`` and restarts the worker, say) would make that replay diverge
from history. Recording this activity's result once, at the point in the
timeline it was actually observed, is what CLAUDE.md's other "no I/O in
workflow code" rules already do for every other external read — this is the
same pattern applied to configuration instead of a CAMARA response.
"""

from __future__ import annotations

from typing import Any

from temporalio import activity

from ..config import get_settings
from ..shared.constants import ACTIVITY_GET_POLICY_CONFIG


@activity.defn(name=ACTIVITY_GET_POLICY_CONFIG)
async def get_policy_config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "alwaysProtectSafetyCritical": settings.policy_always_protect_safety_critical,
        "failOpen": settings.policy_fail_open,
    }
