"""Rendering a business event into the text a model reads.

Assembly stays in Python rather than becoming a template: which sections appear
depends on what the facility actually supplied, and expressing that as
conditional template syntax would be harder to follow than the code, not easier.
The static prose lives in ``templates/``.
"""

from __future__ import annotations

from ..shared.models import BusinessEvent


def build_user_prompt(event: BusinessEvent, context: dict | None = None) -> str:
    """Render one business event for classification.

    ``context`` is whatever the agent gathered when its first pass was
    uncertain — asset profile facts, and the results of any CAMARA reads it
    chose to make. It is labelled as verified evidence so the model weighs it
    above the operation's own description of itself.
    """
    lines = [
        f"Asset type: {event.asset_type.value}",
        f"Asset ID: {event.device.id}",
        f"Operation: {event.operation}",
    ]

    if event.site:
        lines.append(f"Site: {event.site}")

    lines.append(f"Expected duration: {event.expected_duration_seconds} seconds")

    if event.description:
        lines.append(f"\nDescription:\n{event.description}")

    if event.metadata:
        rendered = "\n".join(f"  - {k}: {v}" for k, v in sorted(event.metadata.items()))
        lines.append(f"\nOperational metadata:\n{rendered}")

    if context:
        rendered = "\n".join(f"  - {k}: {v}" for k, v in sorted(context.items()))
        lines.append(
            "\nVerified context gathered from the network and asset register:\n" + rendered
        )

    lines.append("\nClassify the business criticality of this operation.")
    return "\n".join(lines)
