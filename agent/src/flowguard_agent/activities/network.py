"""Activities that touch the mobile network.

Every CAMARA call the agent makes lives here. Activities run outside Temporal's
workflow sandbox, which is exactly why the I/O belongs in them: workflow code is
replayed to rebuild state and must stay deterministic, while these are recorded
once and never re-executed on replay.
"""

from __future__ import annotations

import logging
from typing import Any

from temporalio import activity

from ..network.models import SliceAttachment
from ..network.provider import NetworkProvider
from ..shared.constants import (
    ACTIVITY_ALLOCATE,
    ACTIVITY_CHECK_DEVICE_STATUS,
    ACTIVITY_ESCALATE_TO_SLICE,
    ACTIVITY_EXTEND_QOD,
    ACTIVITY_POLL_QOD,
    ACTIVITY_QUERY_CONGESTION,
    ACTIVITY_RELEASE,
)
from ..shared.models import DeviceRef, NetworkAction

logger = logging.getLogger(__name__)


class NetworkActivities:
    """Bound-method activities, so the provider can be injected.

    Registering bound methods is how Temporal supports dependency injection:
    the worker constructs this with a provider and the swap between mock and
    real Nokia happens once, at startup.
    """

    def __init__(self, provider: NetworkProvider, *, qos_profile: str) -> None:
        self._provider = provider
        self._qos_profile = qos_profile

    @activity.defn(name=ACTIVITY_CHECK_DEVICE_STATUS)
    async def check_device_status(self, device_raw: dict[str, Any]) -> dict[str, Any]:
        """CAMARA Device Status — the guard clause.

        Runs before anything else because it is the cheapest way to avoid
        spending money on a device that is not there.
        """
        device = DeviceRef.from_wire(device_raw)
        result = await self._provider.get_device_status(device)

        return {
            "reachable": result.reachable,
            "connectivity": result.connectivity,
            "roaming": result.roaming,
        }

    @activity.defn(name=ACTIVITY_QUERY_CONGESTION)
    async def query_congestion(self, device_raw: dict[str, Any]) -> dict[str, Any]:
        """CAMARA Congestion Insights — the risk signal, never the trigger."""
        device = DeviceRef.from_wire(device_raw)
        result = await self._provider.get_congestion(device)

        return {
            "level": result.level.value,
            "predicted": result.predicted,
            "confidence": result.confidence,
        }

    @activity.defn(name=ACTIVITY_ALLOCATE)
    async def allocate(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Request Quality on Demand, and attach a slice when escalated.

        The requested duration is deliberately conservative: it doubles as a TTL
        so that if this worker dies while holding the session, the network
        reclaims it rather than billing indefinitely. The workflow extends it if
        the operation actually runs long.
        """
        device = DeviceRef.from_wire(payload["device"])
        action = NetworkAction(payload["action"])
        duration = int(payload["durationSeconds"])
        sink_url = payload.get("sinkUrl")

        session = await self._provider.create_qod_session(
            device,
            qos_profile=self._qos_profile,
            duration_seconds=duration,
            sink_url=sink_url,
        )

        result: dict[str, Any] = {
            "qodSessionId": session.session_id,
            "qosStatus": session.qos_status.value,
            "qosProfile": session.qos_profile,
            "durationSeconds": session.duration_seconds,
            "sliceId": None,
            "attachmentId": None,
        }

        if action is NetworkAction.QOD_AND_SLICE:
            slice_id = self._provider.slice_id
            if slice_id:
                attachment = await self._provider.attach_device_to_slice(device, slice_id)
                result["sliceId"] = attachment.slice_id
                result["attachmentId"] = attachment.attachment_id
            else:
                # Slicing is not universally supported. Degrade to QoD rather
                # than failing the operation — the guarantee still applies.
                logger.warning("Slice escalation requested but no slice is provisioned")
                result["sliceUnavailable"] = True

        return result

    @activity.defn(name=ACTIVITY_ESCALATE_TO_SLICE)
    async def escalate_to_slice(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Attach an already-running operation's device to the pre-provisioned slice.

        For a device that moves into worse congestion mid-operation while
        already holding plain QoD — the mirror of the slice branch in
        ``allocate()``, without creating a second QoD session for the same
        operation.
        """
        device = DeviceRef.from_wire(payload["device"])

        slice_id = self._provider.slice_id
        if not slice_id:
            logger.warning("Mid-operation slice escalation retried, but still no slice is provisioned")
            return {"sliceId": None, "attachmentId": None, "sliceUnavailable": True}

        attachment = await self._provider.attach_device_to_slice(device, slice_id)
        return {"sliceId": attachment.slice_id, "attachmentId": attachment.attachment_id}

    @activity.defn(name=ACTIVITY_POLL_QOD)
    async def poll_qod(self, session_id: str) -> dict[str, Any]:
        """Read a session's current status.

        QoD is asynchronous: a session is REQUESTED before it is AVAILABLE. This
        is the fallback path for when no status webhook arrives in time.
        """
        session = await self._provider.get_qod_session(session_id)
        return {
            "qodSessionId": session.session_id,
            "qosStatus": session.qos_status.value,
            "statusInfo": session.status_info.value if session.status_info else None,
            "startedAt": session.started_at,
            "expiresAt": session.expires_at,
        }

    @activity.defn(name=ACTIVITY_EXTEND_QOD)
    async def extend_qod(self, payload: dict[str, Any]) -> dict[str, Any]:
        session = await self._provider.extend_qod_session(
            payload["qodSessionId"], int(payload["additionalSeconds"])
        )
        return {
            "qodSessionId": session.session_id,
            "durationSeconds": session.duration_seconds,
            "expiresAt": session.expires_at,
        }

    @activity.defn(name=ACTIVITY_RELEASE)
    async def release(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Release everything this operation is holding.

        The single most important activity in the system. The entire cost
        argument depends on it running, which is why the workflow calls it from
        a ``finally`` block and gives it the most aggressive retry policy.

        Each resource is released independently: a failure detaching the slice
        must not prevent the QoD session from being deleted.
        """
        released: dict[str, Any] = {"qodReleased": False, "sliceDetached": False, "errors": []}

        session_id = payload.get("qodSessionId")
        if session_id:
            try:
                await self._provider.delete_qod_session(session_id)
                released["qodReleased"] = True
            except Exception as exc:  # noqa: BLE001 - reported, then re-raised below
                released["errors"].append(f"qod: {exc}")

        attachment_id = payload.get("attachmentId")
        slice_id = payload.get("sliceId")
        if attachment_id and slice_id:
            try:
                await self._provider.detach_device_from_slice(
                    SliceAttachment(slice_id=slice_id, attachment_id=attachment_id)
                )
                released["sliceDetached"] = True
            except Exception as exc:  # noqa: BLE001
                released["errors"].append(f"slice: {exc}")

        # Surface partial failure so Temporal retries. A QoD session expires on
        # its own, but a slice attachment has no TTL — nothing else will ever
        # clean it up.
        if released["errors"]:
            raise RuntimeError(f"Release incomplete: {'; '.join(released['errors'])}")

        return released
