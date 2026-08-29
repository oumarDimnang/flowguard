"""Langfuse client lifecycle and trace identity.

Tracing must never be able to break the agent. Every entry point here degrades
to a no-op when Langfuse is unconfigured, uninstalled, or unreachable — the same
principle as the decision emitter: a dashboard being down must not stop the
agent protecting a crane.

**The trace identity problem.** A Temporal workflow's activities run as separate
task executions, potentially on different workers, minutes apart. Langfuse
normally scopes a trace to one process, so grouping them needs a trace ID that
every activity can derive independently without coordination. Temporal's
``workflow_run_id`` is exactly that: stable for the life of one run, unique
across runs, and available inside every activity via ``activity.info()``.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

_UNAVAILABLE_LOGGED = False


@lru_cache(maxsize=1)
def get_langfuse() -> Any | None:
    """Return a configured Langfuse client, or None if tracing is off.

    Cached: the SDK is a singleton and re-initialising it per activity would
    leak connections in a long-lived worker.
    """
    global _UNAVAILABLE_LOGGED

    from ..config import get_settings

    settings = get_settings()
    if not settings.langfuse_enabled:
        return None

    try:
        from langfuse import get_client

        client = get_client()
    except ImportError:
        if not _UNAVAILABLE_LOGGED:
            logger.warning(
                "LANGFUSE_ENABLED is set but the langfuse package is not installed. "
                "Install the 'langfuse' extra. Continuing without tracing."
            )
            _UNAVAILABLE_LOGGED = True
        return None
    except Exception as exc:  # noqa: BLE001 - tracing must never be fatal
        if not _UNAVAILABLE_LOGGED:
            logger.warning("Langfuse unavailable (%s). Continuing without tracing.", exc)
            _UNAVAILABLE_LOGGED = True
        return None

    logger.info("Langfuse tracing enabled (host=%s)", settings.langfuse_host)
    return client


def trace_id_for_run(workflow_run_id: str) -> str | None:
    """Derive the Langfuse trace ID for a Temporal workflow run.

    Deterministic, so every activity in the run independently arrives at the
    same trace without passing anything between them.
    """
    client = get_langfuse()
    if client is None:
        return None

    try:
        return client.create_trace_id(seed=workflow_run_id)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Could not derive trace id: %s", exc)
        return None


def start_span(client: Any, *, name: str, trace_id: str | None, **attributes: Any):
    """Open a Langfuse span, tolerating SDK surface differences.

    The v3 SDK exposes both ``start_as_current_span`` and the more general
    ``start_as_current_observation(as_type="span")``. Which one is present
    depends on the installed minor version, and this code cannot be verified
    against a live instance from here — so it tries the general form first and
    falls back rather than pinning to one.
    """
    trace_context = {"trace_id": trace_id} if trace_id else None

    starter = getattr(client, "start_as_current_observation", None)
    if starter is not None:
        return starter(as_type="span", name=name, trace_context=trace_context, **attributes)

    starter = getattr(client, "start_as_current_span", None)
    if starter is not None:
        return starter(name=name, trace_context=trace_context, **attributes)

    raise AttributeError("Langfuse client exposes no span API this code recognises")


def langchain_callbacks() -> list[Any]:
    """Callbacks to attach to a LangChain or LangGraph invocation.

    The handler inherits whatever Langfuse span is currently active, so an LLM
    call inside a traced activity nests under that activity automatically — and
    token counts and cost land on the same trace as the workflow that caused
    them.
    """
    if get_langfuse() is None:
        return []

    try:
        from langfuse.langchain import CallbackHandler

        return [CallbackHandler()]
    except Exception as exc:  # noqa: BLE001
        logger.debug("Langfuse LangChain handler unavailable: %s", exc)
        return []


def flush() -> None:
    """Drain buffered events.

    The SDK batches asynchronously. In a long-lived worker that is fine, but
    without a flush on shutdown the last operations of a session — usually the
    ones being demonstrated — are lost.
    """
    client = get_langfuse()
    if client is None:
        return

    try:
        client.flush()
    except Exception as exc:  # noqa: BLE001
        logger.debug("Langfuse flush failed: %s", exc)
