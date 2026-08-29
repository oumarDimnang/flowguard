"""The single boundary between FlowGuard and the mobile network.

This is the most important abstraction in the project. Every CAMARA call the
agent makes goes through it, which buys three things:

* the whole loop runs offline against ``MockNetworkProvider`` — no API key, no
  internet, and a deterministic demo that cannot fail on stage;
* swapping in the real Nokia SDK is a config change, not a rewrite;
* every network interaction has one place to be traced for the audit log.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..shared.models import DeviceRef
from .models import (
    CongestionResult,
    DeviceStatusResult,
    LocationResult,
    LocationVerificationResult,
    QodSession,
    SliceAttachment,
)


class NetworkProvider(ABC):
    """CAMARA capabilities, as FlowGuard needs them."""

    # ── Bootstrap ─────────────────────────────────────────────────────

    @abstractmethod
    async def bootstrap(self) -> None:
        """Prepare long-lived resources before any operation runs.

        Two things happen here rather than per-request, and both matter:

        * **Congestion subscriptions.** Nokia requires a device to be subscribed
          to congestion notifications before congestion queries return anything.
        * **Slice pre-provisioning.** A slice takes minutes to create and
          activate, so it cannot be built inside a two-second decision window.
          It is created once and only *attached to* per operation.
        """

    # ── Read: the signals the agent reasons over ──────────────────────

    @abstractmethod
    async def get_device_status(self, device: DeviceRef) -> DeviceStatusResult:
        """CAMARA Device Status — is this device actually reachable?"""

    @abstractmethod
    async def get_congestion(self, device: DeviceRef) -> CongestionResult:
        """CAMARA Congestion Insights — how loaded is the network here?"""

    @abstractmethod
    async def get_device_location(self, device: DeviceRef) -> LocationResult:
        """CAMARA Location Retrieval — where is this device?"""

    @abstractmethod
    async def verify_device_location(
        self,
        device: DeviceRef,
        latitude: float,
        longitude: float,
        radius_meters: int,
    ) -> LocationVerificationResult:
        """CAMARA Location Verification — is the device near this point?

        Returns a verdict rather than coordinates, so a claim can be checked
        without the system learning where anyone is when the answer is no.
        """

    # ── Write: the levers the agent pulls ─────────────────────────────

    @abstractmethod
    async def create_qod_session(
        self,
        device: DeviceRef,
        qos_profile: str,
        duration_seconds: int,
        sink_url: str | None = None,
    ) -> QodSession:
        """CAMARA Quality on Demand — request a temporary guarantee.

        ``duration_seconds`` is mandatory and acts as a TTL backstop: even if
        this worker dies holding the session, the network reclaims it. Request
        conservatively and extend rather than over-booking up front.
        """

    @abstractmethod
    async def get_qod_session(self, session_id: str) -> QodSession:
        """Poll a session. QoD is asynchronous — it starts REQUESTED."""

    @abstractmethod
    async def extend_qod_session(self, session_id: str, additional_seconds: int) -> QodSession:
        """Extend a session whose operation is running long."""

    @abstractmethod
    async def delete_qod_session(self, session_id: str) -> None:
        """Release the guarantee. This is the call the cost saving depends on."""

    @abstractmethod
    async def attach_device_to_slice(self, device: DeviceRef, slice_id: str) -> SliceAttachment:
        """Attach a device to the pre-provisioned slice."""

    @abstractmethod
    async def detach_device_from_slice(self, attachment: SliceAttachment) -> None:
        """Detach.

        Unlike a QoD session, a slice attachment has **no TTL** — nothing
        expires it. If this call never happens the device stays attached
        indefinitely, which is the unbounded failure the durable workflow
        exists to prevent.
        """

    @property
    @abstractmethod
    def slice_id(self) -> str | None:
        """Pre-provisioned slice, or None when slicing is unavailable."""
