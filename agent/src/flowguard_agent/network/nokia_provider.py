"""Nokia Network as Code provider — direct REST over the API hub.

**Why direct HTTP instead of the ``network-as-code`` SDK.** Nokia ships two
incompatible SDK generations (an older fluent one, and a Fern-regenerated one
with different method names), and neither is guaranteed to target the regional
API hub this account is provisioned on. The REST contract below was read
directly from this account's own playground, so it is the thing that is actually
known to work. httpx is already a dependency; the SDK would add ambiguity, not
remove it.

**Verified against the sandbox playground:**

* Endpoint  ``POST {base}/quality-on-demand/v1/sessions``
* Auth      ``x-rapidapi-key`` + ``x-rapidapi-host`` headers. No OAuth bearer.
* Profile   ``DOWNLINK_M_UPLINK_L``  — *not* ``QOS_L``, which is the TypeScript
            SDK's name and is rejected here.
* Device    ``+99999991001`` with an ``ipv4Address`` block.

**Inferred, not yet verified:** the paths for Device Reachability, Congestion
Insights and Slice Device Attach. Each is marked below. Run
``scripts/verify_nokia.py`` to find out which ones are wrong — it reports the
status code per endpoint so a bad path is a one-line fix rather than a hunt.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..shared.models import CongestionLevel, DeviceRef, QosStatus, QosStatusInfo
from .models import (
    CongestionResult,
    DeviceStatusResult,
    LocationResult,
    LocationVerificationResult,
    QodSession,
    SliceAttachment,
)
from .provider import NetworkProvider
from .schemas import (
    ApplicationServer,
    CamaraError,
    CongestionReading,
    CreateQodSessionRequest,
    DeviceIdentifier,
    Ipv4Address,
    LocationRetrievalResponse,
    LocationVerificationResponse,
    QodSessionResponse,
    ReachabilityResponse,
    SinkCredential,
    SliceAttachmentResponse,
)

logger = logging.getLogger(__name__)

# ── API paths ─────────────────────────────────────────────────────────
# VERIFIED from the account playground:
PATH_QOD_SESSIONS = "/quality-on-demand/v1/sessions"
PATH_SLICES = "/slice/v1/slices"

# INFERRED from the catalog's naming convention — confirm with verify_nokia.py:
PATH_DEVICE_REACHABILITY = "/device-reachability-status/v1/retrieve"
PATH_CONGESTION_QUERY = "/congestion-insights/v1/query"
PATH_SLICE_ATTACH = "/slice-device-attach/v1/attachments"
PATH_LOCATION_RETRIEVE = "/location-retrieval/v0.2/retrieve"
PATH_LOCATION_VERIFY = "/location-verification/v1/verify"


class NokiaApiError(RuntimeError):
    def __init__(self, operation: str, status: int, body: str) -> None:
        super().__init__(f"{operation} failed ({status}): {body[:400]}")
        self.operation = operation
        self.status = status
        self.body = body


class NokiaNetworkProvider(NetworkProvider):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        rapidapi_host: str,
        qos_profile: str,
        application_server_ipv4: str,
        slice_id: str | None = None,
        webhook_base_url: str | None = None,
        webhook_token: str = "",
        timeout_seconds: float = 20.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._qos_profile = qos_profile
        self._application_server_ipv4 = application_server_ipv4
        self._slice_id = slice_id
        self._webhook_base_url = webhook_base_url
        self._webhook_token = webhook_token
        self._timeout = timeout_seconds
        self._headers = {
            "Content-Type": "application/json",
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": rapidapi_host,
        }

    # ── HTTP plumbing ─────────────────────────────────────────────────

    async def _request(
        self, method: str, path: str, *, json: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.request(method, url, headers=self._headers, json=json)

        if response.status_code >= 400:
            detail = response.text
            try:
                error = CamaraError.model_validate(response.json())
                if error.message:
                    detail = f"{error.code or 'ERROR'}: {error.message}"
            except Exception as parse_exc:  # noqa: BLE001 - raw body is the fallback
                logger.debug('Error body was not a CAMARA error: %s', parse_exc)
            raise NokiaApiError(f"{method} {path}", response.status_code, detail)

        if not response.content:
            return {}
        return response.json()

    def _device(self, device: DeviceRef) -> DeviceIdentifier:
        """Build the CAMARA device identifier block.

        The sandbox's working example supplies both a phone number and an IPv4
        block, so both are sent when available rather than assuming the phone
        number alone is sufficient.
        """
        identifier = DeviceIdentifier(
            phoneNumber=device.phone_number,
            ipv4Address=(
                Ipv4Address(publicAddress=device.ipv4_address)
                if device.ipv4_address
                else None
            ),
            ipv6Address=device.ipv6_address,
        )

        if not any(
            (identifier.phone_number, identifier.ipv4_address, identifier.ipv6_address)
        ):
            raise ValueError(f"Device '{device.id}' has no network identifier")
        return identifier

    def _device_payload(self, device: DeviceRef) -> dict[str, Any]:
        return self._device(device).model_dump(by_alias=True, exclude_none=True)

    def _sink(self, path: str) -> str | None:
        """Correlation carried in the callback URL rather than looked up later."""
        if not self._webhook_base_url:
            return None
        return f"{self._webhook_base_url.rstrip('/')}/webhooks/nac/{path}"

    # ── Bootstrap ─────────────────────────────────────────────────────

    async def bootstrap(self) -> None:
        """Confirm the pre-provisioned slice, if slice escalation is configured.

        Deliberately does not *create* a slice: creation runs through
        create → AVAILABLE → activate → OPERATING, which takes minutes and
        cannot happen inside a decision window. Provision it once, out of band.
        """
        if not self._slice_id:
            logger.info("No NOKIA_SLICE_ID set — slice escalation disabled, QoD only")
            return

        try:
            info = await self._request("GET", f"{PATH_SLICES}/{self._slice_id}")
            logger.info(
                "Slice '%s' present (state=%s)", self._slice_id, info.get("state", "unknown")
            )
        except NokiaApiError as exc:
            logger.warning(
                "Could not confirm slice '%s' (%s). Disabling slice escalation; "
                "QoD still applies.",
                self._slice_id,
                exc.status,
            )
            self._slice_id = None

    @property
    def slice_id(self) -> str | None:
        return self._slice_id

    # ── Read ──────────────────────────────────────────────────────────

    async def get_device_status(self, device: DeviceRef) -> DeviceStatusResult:
        """CAMARA Device Reachability Status — the guard clause."""
        body = await self._request(
            "POST",
            PATH_DEVICE_REACHABILITY,
            json={"device": self._device_payload(device)},
        )

        # Validated rather than .get()-ed: a missing reachability flag must
        # raise, not quietly resolve to False and strand a critical operation.
        parsed = ReachabilityResponse.model_validate(body)

        return DeviceStatusResult(
            reachable=parsed.reachable,
            connectivity=parsed.connectivity[0] if parsed.connectivity else None,
            roaming=None,
        )

    async def get_congestion(self, device: DeviceRef) -> CongestionResult:
        """CAMARA Congestion Insights — the risk signal.

        Returns a list covering current and forecast windows; the first entry is
        the current reading. Levels come back as 'Low' | 'Medium' | 'High' with
        that exact casing.
        """
        body = await self._request(
            "POST",
            PATH_CONGESTION_QUERY,
            json={"device": self._device_payload(device)},
        )

        raw_readings = (
            body if isinstance(body, list) else body.get("congestionInsights") or [body]
        )
        if not raw_readings:
            raise NokiaApiError("congestion query", 200, "empty congestion response")

        current = CongestionReading.model_validate(raw_readings[0])

        # CAMARA can report "None" for an uncongested cell. The policy vocabulary
        # starts at Low, and both mean the same thing: no action warranted.
        level = (
            CongestionLevel.LOW
            if current.congestion_level == "None"
            else CongestionLevel(current.congestion_level)
        )

        return CongestionResult(
            level=level,
            predicted=False,
            confidence=current.confidence_level,
        )

    async def get_device_location(self, device: DeviceRef) -> LocationResult:
        """CAMARA Location Retrieval.

        ``maxAge`` bounds how stale a cached fix may be. Sixty seconds keeps the
        answer meaningful for a moving asset without forcing a fresh page of the
        device on every call.
        """
        body = await self._request(
            "POST",
            PATH_LOCATION_RETRIEVE,
            json={"device": self._device_payload(device), "maxAge": 60},
        )

        parsed = LocationRetrievalResponse.model_validate(body)

        return LocationResult(
            latitude=parsed.area.center.latitude,
            longitude=parsed.area.center.longitude,
            accuracy_meters=float(parsed.area.radius),
            observed_at=(
                parsed.last_location_time.isoformat() if parsed.last_location_time else None
            ),
        )

    async def verify_device_location(
        self,
        device: DeviceRef,
        latitude: float,
        longitude: float,
        radius_meters: int,
    ) -> LocationVerificationResult:
        """CAMARA Location Verification — verdict only, never coordinates."""
        body = await self._request(
            "POST",
            PATH_LOCATION_VERIFY,
            json={
                "device": self._device_payload(device),
                "area": {
                    "areaType": "CIRCLE",
                    "center": {"latitude": latitude, "longitude": longitude},
                    "radius": radius_meters,
                },
                "maxAge": 60,
            },
        )

        parsed = LocationVerificationResponse.model_validate(body)

        return LocationVerificationResult(
            verdict=parsed.verification_result,
            match_rate=parsed.match_rate,
        )

    # ── Write ─────────────────────────────────────────────────────────

    async def create_qod_session(
        self,
        device: DeviceRef,
        qos_profile: str,
        duration_seconds: int,
        sink_url: str | None = None,
    ) -> QodSession:
        """CAMARA Quality on Demand — request a temporary guarantee.

        Body shape verified against this account's playground.
        """
        # Built through the schema so a malformed body cannot leave the process.
        request = CreateQodSessionRequest(
            device=self._device(device),
            applicationServer=ApplicationServer(ipv4Address=self._application_server_ipv4),
            qosProfile=qos_profile or self._qos_profile,
            duration=duration_seconds,
            sink=sink_url,
            sinkCredential=(
                SinkCredential(credentialType="ACCESSTOKEN", accessToken=self._webhook_token)
                if sink_url and self._webhook_token
                else None
            ),
        )

        body = await self._request(
            "POST",
            PATH_QOD_SESSIONS,
            json=request.model_dump(by_alias=True, exclude_none=True),
        )
        return self._to_session(body)

    async def get_qod_session(self, session_id: str) -> QodSession:
        body = await self._request("GET", f"{PATH_QOD_SESSIONS}/{session_id}")
        return self._to_session(body)

    async def extend_qod_session(self, session_id: str, additional_seconds: int) -> QodSession:
        body = await self._request(
            "POST",
            f"{PATH_QOD_SESSIONS}/{session_id}/extend",
            json={"requestedAdditionalDuration": additional_seconds},
        )
        return self._to_session(body)

    async def delete_qod_session(self, session_id: str) -> None:
        """Release the guarantee — the call the cost saving depends on."""
        await self._request("DELETE", f"{PATH_QOD_SESSIONS}/{session_id}")

    async def attach_device_to_slice(self, device: DeviceRef, slice_id: str) -> SliceAttachment:
        body = await self._request(
            "POST",
            PATH_SLICE_ATTACH,
            json={
                "device": self._device_payload(device),
                "sliceId": slice_id,
                **({"sink": self._sink(f"slice/{device.id}")} if self._webhook_base_url else {}),
            },
        )
        # The attachment ID is required: a slice attachment has no TTL, so
        # losing it means the device can never be detached.
        parsed = SliceAttachmentResponse.model_validate(body)

        return SliceAttachment(slice_id=slice_id, attachment_id=parsed.id)

    async def detach_device_from_slice(self, attachment: SliceAttachment) -> None:
        """Detach.

        A slice attachment has no TTL — if this never runs, the device stays
        attached indefinitely. That is why the workflow calls it from a finally
        block with the most aggressive retry policy in the system.
        """
        await self._request("DELETE", f"{PATH_SLICE_ATTACH}/{attachment.attachment_id}")

    # ── Mapping ───────────────────────────────────────────────────────

    def _to_session(self, body: dict[str, Any]) -> QodSession:
        parsed = QodSessionResponse.model_validate(body)

        return QodSession(
            session_id=parsed.session_id,
            qos_status=QosStatus(parsed.qos_status),
            qos_profile=parsed.qos_profile or self._qos_profile,
            duration_seconds=parsed.duration or 0,
            status_info=QosStatusInfo(parsed.status_info) if parsed.status_info else None,
            started_at=parsed.started_at.isoformat() if parsed.started_at else None,
            expires_at=parsed.expires_at.isoformat() if parsed.expires_at else None,
        )
