"""Deterministic offline implementation of :class:`NetworkProvider`.

This is not a stub — it is the demo mode. It lets the entire observe → decide →
allocate → release loop run with no Nokia key, no internet and no possibility of
a live API failing mid-pitch, which the hackathon's own guidance recommends
("cache demo data; live API calls fail at the worst moment").

Congestion is *scripted* rather than random, because the headline demo depends
on two events seeing the identical network conditions: the same drone under the
same HIGH congestion must be refused for routine mapping and granted for a
pipeline leak inspection. Randomness would destroy that comparison.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
from datetime import UTC, datetime, timedelta

from ..shared.models import CongestionLevel, DeviceRef, QosStatus
from .models import (
    CongestionResult,
    DeviceStatusResult,
    LocationResult,
    LocationVerificationResult,
    QodSession,
    SliceAttachment,
)
from .provider import NetworkProvider

logger = logging.getLogger(__name__)

#: Congestion for the scripted demo devices. Both drone-3 events resolve to the
#: same value on purpose — that identity is the entire point of the contrast.
SCRIPTED_CONGESTION: dict[str, CongestionLevel] = {
    "crane-a": CongestionLevel.HIGH,
    "crane-b": CongestionLevel.HIGH,
    "drone-3": CongestionLevel.HIGH,
    "drone-9": CongestionLevel.HIGH,
    "ambulance-7": CongestionLevel.MEDIUM,
    # A capacity stadium crowd is the canonical congestion scenario — the
    # same HIGH congestion both events see, matching the drone-3 contrast.
    "medic-12": CongestionLevel.HIGH,
}

#: Devices the mock reports as unreachable, for exercising the guard clause.
#:
#: 'crane-c' and 'drone-7' are here so each industry has a job that cannot be
#: decided at all. The resulting trail is two steps long — checked, then
#: declined — which is the shape worth being able to show: FlowGuard spending
#: nothing on an asset that is not there is the same discipline as releasing.
UNREACHABLE_DEVICES: set[str] = {"camera-offline", "crane-c", "drone-7"}

#: Where each demo device actually is, as (latitude, longitude).
#:
#: These are Bahrain coordinates, chosen to match the demo scenarios. Note that
#: Nokia's *sandbox* devices report a fixed position near Budapest
#: (47.4863, 19.0792) — so with NETWORK_PROVIDER=nokia, a location check against
#: these coordinates always returns FALSE and every safety-critical claim is
#: downgraded. Use the mock for scenarios that depend on location verification,
#: or move the scenario coordinates to the sandbox's position.
#:
#: 'drone-9' is the interesting one: it reports a pipeline leak inspection but
#: is ~18 km from the pipeline. A criticality claim the network can contradict
#: is the reason location is worth querying at all.
#:
#: Every demo asset needs an entry here. DEFAULT_LOCATION is ~2.8 km from the
#: berth and ~7 km from the riser, so an asset that is missing lands outside
#: both verification radii and its perfectly honest job gets downgraded as a
#: false claim — which is indistinguishable, in the trail, from the one case
#: that is *supposed* to be downgraded. The quay cranes all sit at the berth.
SCRIPTED_LOCATIONS: dict[str, tuple[float, float]] = {
    "crane-a": (26.2041, 50.6050),
    "crane-b": (26.2041, 50.6050),
    "crane-c": (26.2041, 50.6050),
    "drone-2": (26.1500, 50.6200),
    "drone-3": (26.1500, 50.6200),
    "drone-7": (26.1500, 50.6200),
    "drone-9": (26.3100, 50.7900),
    "ambulance-7": (26.2285, 50.5860),
    "medic-12": (26.1655, 50.5470),  # Bahrain National Stadium, Isa Town
}

#: Fallback for devices with no scripted position. See the note above before
#: relying on it for anything that carries site coordinates.
DEFAULT_LOCATION = (26.2235, 50.5876)

#: Rough metres per degree at this latitude. Adequate for a proximity check;
#: a real implementation would let the network answer this.
_METRES_PER_DEGREE = 111_000

MOCK_SLICE_ID = "mock-urllc-slice-01"


class MockNetworkProvider(NetworkProvider):
    """Offline provider with realistic timing and state transitions."""

    def __init__(self, *, simulate_latency: bool = True) -> None:
        self._sessions: dict[str, QodSession] = {}
        self._attachments: dict[str, SliceAttachment] = {}
        self._slice_id: str | None = None
        self._simulate_latency = simulate_latency
        self._counter = 0

    # ── Bootstrap ─────────────────────────────────────────────────────

    async def bootstrap(self) -> None:
        await self._delay(0.05)
        self._slice_id = MOCK_SLICE_ID
        logger.info("Mock network bootstrapped (slice %s pre-provisioned)", self._slice_id)

    @property
    def slice_id(self) -> str | None:
        return self._slice_id

    # ── Read ──────────────────────────────────────────────────────────

    async def get_device_status(self, device: DeviceRef) -> DeviceStatusResult:
        await self._delay(0.03)
        reachable = device.id not in UNREACHABLE_DEVICES
        return DeviceStatusResult(
            reachable=reachable,
            connectivity="DATA" if reachable else None,
            roaming=False,
        )

    async def get_congestion(self, device: DeviceRef) -> CongestionResult:
        await self._delay(0.04)
        level = SCRIPTED_CONGESTION.get(device.id) or self._derive_congestion(device.id)
        # Confidence is 0-100 in the real API, not 0-1. Matching the scale keeps
        # the dashboard consistent across mock and live.
        return CongestionResult(level=level, predicted=False, confidence=90.0)

    async def get_device_location(self, device: DeviceRef) -> LocationResult:
        await self._delay(0.05)
        latitude, longitude = SCRIPTED_LOCATIONS.get(device.id, DEFAULT_LOCATION)
        return LocationResult(
            latitude=latitude,
            longitude=longitude,
            # The sandbox reports a 1000m accuracy radius. Matching it keeps the
            # mock honest about how coarse network location really is — this is
            # not GPS, and a verification radius must be sized accordingly.
            accuracy_meters=1000.0,
        )

    async def verify_device_location(
        self,
        device: DeviceRef,
        latitude: float,
        longitude: float,
        radius_meters: int,
    ) -> LocationVerificationResult:
        await self._delay(0.05)
        actual_lat, actual_lon = SCRIPTED_LOCATIONS.get(device.id, DEFAULT_LOCATION)

        # Equirectangular approximation — accurate enough over a few kilometres
        # and deterministic, which matters more here than geodesic precision.
        dx = (longitude - actual_lon) * _METRES_PER_DEGREE * math.cos(math.radians(latitude))
        dy = (latitude - actual_lat) * _METRES_PER_DEGREE
        distance = math.hypot(dx, dy)

        within = distance <= radius_meters
        logger.info(
            "Mock location check for %s: %.0fm from target (radius %dm) -> %s",
            device.id,
            distance,
            radius_meters,
            "TRUE" if within else "FALSE",
        )

        return LocationVerificationResult(
            verdict="TRUE" if within else "FALSE",
            match_rate=100 if within else 0,
        )

    # ── Write ──────────────────────────────────────────────────────────

    async def create_qod_session(
        self,
        device: DeviceRef,
        qos_profile: str,
        duration_seconds: int,
        sink_url: str | None = None,
    ) -> QodSession:
        await self._delay(0.08)
        self._counter += 1
        session_id = f"mock-qod-{device.id}-{self._counter:04d}"

        # Mirrors the real API: a session is REQUESTED first and only becomes
        # AVAILABLE once the network has actually provisioned it.
        session = QodSession(
            session_id=session_id,
            qos_status=QosStatus.REQUESTED,
            qos_profile=qos_profile,
            duration_seconds=duration_seconds,
        )
        self._sessions[session_id] = session
        logger.info("Mock QoD session %s REQUESTED for %ss", session_id, duration_seconds)
        return session

    async def get_qod_session(self, session_id: str) -> QodSession:
        await self._delay(0.02)
        session = self._sessions[session_id]

        # Promote REQUESTED -> AVAILABLE on the first poll, reproducing the
        # asynchronous transition the dashboard is built to render.
        if session.qos_status is QosStatus.REQUESTED:
            now = datetime.now(UTC)
            session.qos_status = QosStatus.AVAILABLE
            session.started_at = now.isoformat()
            session.expires_at = (now + timedelta(seconds=session.duration_seconds)).isoformat()
            logger.info("Mock QoD session %s -> AVAILABLE", session_id)

        return session

    async def extend_qod_session(self, session_id: str, additional_seconds: int) -> QodSession:
        await self._delay(0.05)
        session = self._sessions[session_id]
        session.duration_seconds += additional_seconds
        if session.expires_at:
            expires = datetime.fromisoformat(session.expires_at)
            session.expires_at = (expires + timedelta(seconds=additional_seconds)).isoformat()
        logger.info("Mock QoD session %s extended by %ss", session_id, additional_seconds)
        return session

    async def delete_qod_session(self, session_id: str) -> None:
        await self._delay(0.05)
        self._sessions.pop(session_id, None)
        logger.info("Mock QoD session %s released", session_id)

    async def attach_device_to_slice(self, device: DeviceRef, slice_id: str) -> SliceAttachment:
        await self._delay(0.1)
        self._counter += 1
        attachment = SliceAttachment(
            slice_id=slice_id,
            attachment_id=f"mock-attach-{device.id}-{self._counter:04d}",
        )
        self._attachments[attachment.attachment_id] = attachment
        logger.info("Mock device %s attached to slice %s", device.id, slice_id)
        return attachment

    async def detach_device_from_slice(self, attachment: SliceAttachment) -> None:
        await self._delay(0.1)
        self._attachments.pop(attachment.attachment_id, None)
        logger.info("Mock attachment %s detached", attachment.attachment_id)

    # ── Internals ─────────────────────────────────────────────────────

    async def _delay(self, seconds: float) -> None:
        """Simulate network round-trip so latency budgets are exercised."""
        if self._simulate_latency:
            await asyncio.sleep(seconds)

    @staticmethod
    def _derive_congestion(device_id: str) -> CongestionLevel:
        """Stable pseudo-random congestion for devices outside the demo script.

        Hashed rather than random so repeated runs of the same scenario produce
        identical results — the impact metrics have to be reproducible.
        """
        digest = hashlib.sha256(device_id.encode()).digest()[0]
        if digest % 3 == 0:
            return CongestionLevel.LOW
        if digest % 3 == 1:
            return CongestionLevel.MEDIUM
        return CongestionLevel.HIGH
