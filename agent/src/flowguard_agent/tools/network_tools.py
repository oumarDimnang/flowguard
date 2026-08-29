"""Read-only CAMARA tools the agent may choose to call.

This module is where FlowGuard's agent stops being a pipeline and starts
orchestrating. When the agent is unsure about an operation, it decides for
itself which network signal would resolve the uncertainty and calls it.

**Only reads are exposed. This is the safety boundary, and it is enforced by
absence rather than by a rule the model could talk itself past.** Creating a QoD
session or attaching a slice is not in this toolset, so a model cannot commit
paid network capacity on its own judgement no matter what it decides. Allocation
stays with the deterministic policy in ``policy.rules``.

The tools are backed by whichever :class:`NetworkProvider` is configured, so the
agent keeps its full toolset offline — which is why this is built here rather
than against Nokia's MCP server. An agent whose tools vanish when the network
does would be an odd thing to demo alongside a product about degrading
gracefully.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from ..network.provider import NetworkProvider
from ..shared.models import DeviceRef

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    """One tool invocation and its outcome, for the decision trail."""

    name: str
    arguments: dict[str, Any]
    result: str
    failed: bool = False


#: Schemas advertised to the model. Descriptions are written for the model, not
#: for developers — they are the only thing it uses to decide what to call.
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "verify_device_location",
        "description": (
            "Check whether the device is physically within a radius of a given "
            "point. Use this to VERIFY A CLAIM: if an operation says it is "
            "inspecting a specific site, this confirms the asset is actually "
            "there. Returns TRUE or FALSE, never coordinates. A FALSE result "
            "means the stated operation cannot be happening where it claims."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number", "description": "Latitude of the claimed site."},
                "longitude": {"type": "number", "description": "Longitude of the claimed site."},
                "radius_meters": {
                    "type": "integer",
                    "description": "Acceptable distance from the point, in metres.",
                },
            },
            "required": ["latitude", "longitude", "radius_meters"],
        },
    },
    {
        "name": "retrieve_device_location",
        "description": (
            "Get the device's approximate position. Use only when you need to "
            "know WHERE something is; prefer verify_device_location when you are "
            "checking a claim, because it does not disclose position."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "check_device_status",
        "description": (
            "Check whether the device is reachable on the network and whether it "
            "is roaming. Useful when an operation's feasibility is in doubt."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "check_network_congestion",
        "description": (
            "Read current network congestion in the device's area (Low, Medium "
            "or High). Note this describes the NETWORK, not the operation — it "
            "must not change how business-critical the work is."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]


class NetworkToolbox:
    """Executes tool calls against the configured provider.

    Bound to a single device per assessment: the model names a tool and supplies
    its arguments, but never chooses *which device* to interrogate. That removes
    a whole class of mistake — and of abuse — from the surface.
    """

    def __init__(self, provider: NetworkProvider, device: DeviceRef) -> None:
        self._provider = provider
        self._device = device

    @property
    def schemas(self) -> list[dict[str, Any]]:
        return TOOL_SCHEMAS

    async def call(self, name: str, arguments: dict[str, Any] | None = None) -> ToolCall:
        """Run one tool and render its result as a short factual string.

        Never raises. A failed network read should make the agent less certain,
        not crash the assessment — so the failure is reported back to the model
        as an observation it can reason about.
        """
        args = arguments or {}

        try:
            result = await self._dispatch(name, args)
            return ToolCall(name=name, arguments=args, result=result)
        except Exception as exc:  # noqa: BLE001 - surfaced to the model, not swallowed
            logger.warning("Tool %s failed: %s", name, exc)
            return ToolCall(
                name=name,
                arguments=args,
                result=f"Unavailable: {type(exc).__name__}. Treat this signal as unknown.",
                failed=True,
            )

    async def _dispatch(self, name: str, args: dict[str, Any]) -> str:
        if name == "verify_device_location":
            verification = await self._provider.verify_device_location(
                self._device,
                latitude=float(args["latitude"]),
                longitude=float(args["longitude"]),
                radius_meters=int(args["radius_meters"]),
            )
            if verification.verified:
                return (
                    f"CONFIRMED: the device is within {args['radius_meters']}m of the "
                    "stated location."
                )
            return (
                f"CONTRADICTED: the device is NOT within {args['radius_meters']}m of the "
                "stated location. The operation is not taking place where it claims."
            )

        if name == "retrieve_device_location":
            location = await self._provider.get_device_location(self._device)
            accuracy = (
                f", accurate to about {location.accuracy_meters:.0f}m"
                if location.accuracy_meters
                else ""
            )
            return f"Device is at {location.latitude:.4f}, {location.longitude:.4f}{accuracy}."

        if name == "check_device_status":
            status = await self._provider.get_device_status(self._device)
            if not status.reachable:
                return "Device is NOT reachable on the network."
            roaming = " and is roaming" if status.roaming else ""
            return f"Device is reachable ({status.connectivity or 'DATA'}){roaming}."

        if name == "check_network_congestion":
            congestion = await self._provider.get_congestion(self._device)
            return (
                f"Network congestion in this area is {congestion.level.value}. "
                "This describes network conditions only."
            )

        raise ValueError(f"Unknown tool '{name}'")
