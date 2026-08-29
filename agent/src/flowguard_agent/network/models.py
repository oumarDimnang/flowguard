"""Results returned by the network provider.

Deliberately a small, provider-neutral vocabulary: the mock and the real Nokia
SDK both produce these, so nothing downstream can tell which one it is talking
to. That is what makes the demo-mode swap a config change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..shared.models import CongestionLevel, QosStatus, QosStatusInfo


@dataclass
class DeviceStatusResult:
    reachable: bool
    connectivity: str | None = None
    roaming: bool | None = None


@dataclass
class CongestionResult:
    level: CongestionLevel
    #: True when this reading is a forecast rather than a current observation.
    predicted: bool = False
    confidence: float | None = None


@dataclass
class QodSession:
    session_id: str
    qos_status: QosStatus
    qos_profile: str
    duration_seconds: int
    status_info: QosStatusInfo | None = None
    started_at: str | None = None
    expires_at: str | None = None


@dataclass
class LocationResult:
    """CAMARA Location Retrieval — where the device actually is."""

    latitude: float
    longitude: float
    #: Accuracy radius in metres. Network location is approximate by nature.
    accuracy_meters: float | None = None
    observed_at: str | None = None


@dataclass
class LocationVerificationResult:
    """CAMARA Location Verification — a yes/no, not coordinates.

    Privacy-preserving by design: the network confirms whether the device is
    within a radius of a point without disclosing where it is. That is the
    right primitive for checking a claim.
    """

    #: TRUE | FALSE | UNKNOWN | PARTIAL, per the CAMARA spec.
    verdict: str
    match_rate: int | None = None

    @property
    def verified(self) -> bool:
        return self.verdict == "TRUE"


@dataclass
class SliceAttachment:
    slice_id: str
    attachment_id: str


@dataclass
class NetworkCallTrace:
    """Raw request/response captured for the audit trail and demo replay."""

    api: str
    operation: str
    request: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)
    duration_ms: int | None = None

    def to_wire(self) -> dict[str, Any]:
        return {
            "api": self.api,
            "operation": self.operation,
            "request": self.request,
            "response": self.response,
            "durationMs": self.duration_ms,
        }
