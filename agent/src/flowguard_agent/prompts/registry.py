"""Prompt loading.

Prompts live as Markdown alongside the code rather than inside it, for three
reasons: they are the highest-leverage text in the project, they are reviewed by
people who do not read Python, and a prompt change should produce a readable
diff rather than a wall of escaped string literals.

Loaded through ``importlib.resources`` so they resolve correctly from an
installed wheel, not just from a source checkout.

**Langfuse prompt management** is supported as an opt-in override: when enabled,
a prompt is fetched from Langfuse first, falling back to the bundled file if it
is not published there or Langfuse is unreachable. That ordering matters — the
bundled file is the source of truth the agent can always start from, and a
remote prompt store must never be able to stop the agent running.
"""

from __future__ import annotations

import logging
from functools import cache
from importlib import resources

logger = logging.getLogger(__name__)

_TEMPLATE_PACKAGE = "flowguard_agent.prompts.templates"

#: Prompt names, so call sites reference a constant rather than a string that
#: silently resolves to a missing file.
CRITICALITY_SYSTEM = "criticality_system"
TOOL_SELECTION_SYSTEM = "tool_selection_system"


@cache
def _load_bundled(name: str) -> str:
    """Read a prompt from the packaged templates."""
    try:
        return (
            resources.files(_TEMPLATE_PACKAGE)
            .joinpath(f"{name}.md")
            .read_text(encoding="utf-8")
            .strip()
        )
    except FileNotFoundError as exc:
        raise KeyError(
            f"No prompt template named '{name}'. Expected "
            f"src/flowguard_agent/prompts/templates/{name}.md"
        ) from exc


def _load_from_langfuse(name: str) -> str | None:
    """Fetch a managed prompt, or None if unavailable.

    Every failure path returns None rather than raising: an unpublished prompt,
    a network blip, or an SDK change must all fall through to the bundled copy.
    """
    from ..observability.langfuse_setup import get_langfuse

    client = get_langfuse()
    if client is None:
        return None

    try:
        prompt = client.get_prompt(name)
    except Exception as exc:  # noqa: BLE001 - remote prompts are never required
        logger.debug("Langfuse prompt '%s' unavailable (%s); using bundled copy", name, exc)
        return None

    text = getattr(prompt, "prompt", None)
    if isinstance(text, str) and text.strip():
        logger.info("Using Langfuse-managed prompt '%s'", name)
        return text.strip()

    return None


def get_prompt(name: str, *, allow_managed: bool = True) -> str:
    """Return a prompt by name.

    Set ``allow_managed=False`` to force the bundled copy — useful in tests,
    where a prompt fetched from a remote store would make results depend on
    someone else's edit.
    """
    if allow_managed:
        managed = _load_from_langfuse(name)
        if managed is not None:
            return managed

    return _load_bundled(name)


def available_prompts() -> list[str]:
    """Every bundled prompt name. Used by the prompt-integrity test."""
    return sorted(
        path.name.removesuffix(".md")
        for path in resources.files(_TEMPLATE_PACKAGE).iterdir()
        if path.name.endswith(".md")
    )
