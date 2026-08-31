"""Pydantic schemas for CAMARA request and response bodies.

**Why these exist.** The provider previously parsed responses with ``.get()``
chains, which fail silently and dangerously. ``bool(body.get("reachable"))``
returns ``False`` when the field is absent — so a renamed field, an error body,
or a schema change would report a healthy device as *unreachable*, the guard
clause would fire, and a safety-critical operation would go unprotected with no
error anywhere. A parse failure would have become a safety decision.

The rule these models encode: **strict about what the decision depends on,
tolerant of everything else.**

* Fields the decision reads are required with no default. A missing one raises
  ``ValidationError``, the activity fails, Temporal retries, and the problem is
  visible instead of silent.
* ``extra="ignore"`` so Nokia can add fields without breaking the agent.
* Aliases map CAMARA's camelCase to Python names in one place rather than at
  every call site.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CamaraModel(BaseModel):
    """Shared conventions for every CAMARA payload."""

    model_config = ConfigDict(
        populate_by_name=True,
        # Forward compatibility: an added field is not a breaking change.
        extra="ignore",
        str_strip_whitespace=True,
    )


# ── Device identifiers ────────────────────────────────────────────────


class Ipv4Address(CamaraModel):
    public_address: str = Field(alias="publicAddress")
    private_address: str | None = Field(default=None, alias="privateAddress")
    public_port: int | None = Field(default=None, alias="publicPort")


class DeviceIdentifier(CamaraModel):
    """At least one identifier is required by CAMARA; which one varies by API."""

    phone_number: str | None = Field(default=None, alias="phoneNumber")
    network_access_identifier: str | None = Field(
        default=None, alias="networkAccessIdentifier"
    )
    ipv4_address: Ipv4Address | None = Field(default=None, alias="ipv4Address")
    ipv6_address: str | None = Field(default=None, alias="ipv6Address")


# ── Device Reachability Status ────────────────────────────────────────


class ReachabilityResponse(CamaraModel):
    """``POST /device-reachability-status/v1/retrieve``.

    ``reachable`` has no default on purpose. It is the guard clause, and a
    missing value must fail loudly rather than resolve to "not reachable".
    """

    reachable: bool
    last_status_time: datetime | None = Field(default=None, alias="lastStatusTime")
    connectivity: list[Literal["DATA", "SMS"]] = Field(default_factory=list)


class RoamingResponse(CamaraModel):
    roaming: bool
    country_code: int | None = Field(default=None, alias="countryCode")
    country_name: list[str] = Field(default_factory=list, alias="countryName")


# ── Congestion Insights ───────────────────────────────────────────────


class CongestionReading(CamaraModel):
    """One congestion window.

    The API returns a list covering the current window and forecast windows;
    the first entry is the current reading.

    ``congestionLevel`` is required and its values are constrained to Nokia's
    exact casing. An unrecognised value fails validation rather than being
    coerced into something the policy would silently act on.
    """

    congestion_level: Literal["None", "Low", "Medium", "High"] = Field(
        alias="congestionLevel"
    )
    #: Reported 0-100 by the API, not 0-1.
    confidence_level: int | None = Field(default=None, alias="confidenceLevel")
    #: Nokia names these timeIntervalStart / timeIntervalStop — not the
    #: startTime / endTime the CAMARA spec text suggests. Confirmed against a
    #: live sandbox response.
    start_time: datetime | None = Field(default=None, alias="timeIntervalStart")
    end_time: datetime | None = Field(default=None, alias="timeIntervalStop")


# ── Quality on Demand ─────────────────────────────────────────────────


class ApplicationServer(CamaraModel):
    ipv4_address: str | None = Field(default=None, alias="ipv4Address")
    ipv6_address: str | None = Field(default=None, alias="ipv6Address")


class SinkCredential(CamaraModel):
    credential_type: Literal["ACCESSTOKEN", "PRIVATE_KEY_JWT"] = Field(
        default="ACCESSTOKEN", alias="credentialType"
    )
    access_token: str | None = Field(default=None, alias="accessToken")
    access_token_type: str | None = Field(default="bearer", alias="accessTokenType")


class CreateQodSessionRequest(CamaraModel):
    """``POST /quality-on-demand/v1/sessions``.

    Modelled as a request schema, not just a response one, so a malformed body
    cannot leave the process. Shape verified against the account playground.
    """

    device: DeviceIdentifier
    application_server: ApplicationServer = Field(alias="applicationServer")
    qos_profile: str = Field(alias="qosProfile", min_length=3, max_length=256)
    #: Mandatory, and doubles as a TTL: if this worker dies holding the session,
    #: the network reclaims it rather than billing indefinitely.
    duration: int = Field(ge=1, le=2_147_483_647)
    sink: str | None = None
    sink_credential: SinkCredential | None = Field(default=None, alias="sinkCredential")


class QodMessage(CamaraModel):
    severity: str | None = None
    description: str | None = None


class QodSessionResponse(CamaraModel):
    """``201 Created`` from session creation, and the GET/extend responses.

    ``sessionId`` and ``qosStatus`` are required: without a session ID there is
    nothing to release later, which is the failure that costs money.
    """

    session_id: str = Field(alias="sessionId")
    qos_status: Literal["REQUESTED", "AVAILABLE", "UNAVAILABLE"] = Field(alias="qosStatus")
    qos_profile: str | None = Field(default=None, alias="qosProfile")
    duration: int | None = None
    status_info: (
        Literal["DURATION_EXPIRED", "NETWORK_TERMINATED", "DELETE_REQUESTED"] | None
    ) = Field(default=None, alias="statusInfo")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    messages: list[QodMessage] = Field(default_factory=list)


# ── Location ──────────────────────────────────────────────────────────


class Point(CamaraModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CircleArea(CamaraModel):
    area_type: Literal["CIRCLE"] = Field(default="CIRCLE", alias="areaType")
    center: Point
    radius: int = Field(ge=1)


class LocationRetrievalResponse(CamaraModel):
    """``POST /location-retrieval/v0.2/retrieve``.

    Network location is an area, not a point — the radius is the accuracy.
    """

    area: CircleArea
    last_location_time: datetime | None = Field(default=None, alias="lastLocationTime")


class LocationVerificationResponse(CamaraModel):
    """``POST /location-verification/v1/verify``.

    ``PARTIAL`` and ``UNKNOWN`` are real answers, not errors: the device may
    straddle the boundary, or the network may not know. Treating either as a
    contradiction would downgrade genuine emergencies, so only ``FALSE`` counts
    as the operation being somewhere it claims not to be.
    """

    verification_result: Literal["TRUE", "FALSE", "PARTIAL", "UNKNOWN"] = Field(
        alias="verificationResult"
    )
    match_rate: int | None = Field(default=None, alias="matchRate", ge=0, le=100)
    last_location_time: datetime | None = Field(default=None, alias="lastLocationTime")


# ── Slicing ───────────────────────────────────────────────────────────


class SliceResponse(CamaraModel):
    name: str | None = None
    state: str | None = None


class SliceAttachmentResponse(CamaraModel):
    """``POST /slice-device-attach/v1/attachments``.

    The identifier is required: a slice attachment has no TTL, so losing its ID
    means it can never be detached.
    """

    id: str = Field(validation_alias="id")
    state: str | None = None


# ── Errors ────────────────────────────────────────────────────────────


class CamaraError(CamaraModel):
    """CAMARA's standard error body, used to produce a readable failure."""

    status: int | None = None
    code: str | None = None
    message: str | None = None
