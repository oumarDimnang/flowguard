"""Prompts, kept out of the code that uses them.

Public surface is deliberately small::

    from ..prompts import CRITICALITY_SYSTEM, build_user_prompt, get_prompt

    system = get_prompt(CRITICALITY_SYSTEM)
    user = build_user_prompt(event, context)
"""

from .builders import build_user_prompt
from .registry import (
    CRITICALITY_SYSTEM,
    TOOL_SELECTION_SYSTEM,
    available_prompts,
    get_prompt,
)

__all__ = [
    "CRITICALITY_SYSTEM",
    "TOOL_SELECTION_SYSTEM",
    "available_prompts",
    "build_user_prompt",
    "get_prompt",
]
