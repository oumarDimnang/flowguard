"""Wire contracts shared with the NestJS server.

Every value in this module crosses a process boundary — either over the Temporal
task queue or over HTTP to the server. The string values MUST match
``server/src/common/domain/enums.ts`` exactly; there is no compile-time link
between the two codebases, so a mismatch surfaces as a silent misrouting rather
than an error.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Criticality(str, Enum):
    """How business-critical an operation is, as judged by the LLM."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class CongestionLevel(str, Enum):
    """Network congestion in the device's area.

    Values match Nokia's Congestion Insights enum exactly, capitalisation
    included. Do not normalise these to upper case — they are compared against
    values returned by the CAMARA API.
    """

    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class NetworkAction(str, Enum):
    """The three outcomes the decision policy can produce."""

    NONE = "NONE"
    QOD = "QOD"
    QOD_AND_SLICE = "QOD_AND_SLICE"


class QosStatus(str, Enum):
    """CAMARA Quality on Demand session status.

    A session starts REQUESTED and transitions asynchronously, which is why the
    dashboard models the transition rather than assuming instant availability.
    """

    REQUESTED = "REQUESTED"
    AVAILABLE = "AVAILABLE"
    UNAVAILABLE = "UNAVAILABLE"


class QosStatusInfo(str, Enum):
    DURATION_EXPIRED = "DURATION_EXPIRED"
    NETWORK_TERMINATED = "NETWORK_TERMINATED"
    DELETE_REQUESTED = "DELETE_REQUESTED"


class AssetType(str, Enum):
    CRANE = "CRANE"
    DRONE = "DRONE"
    CAMERA = "CAMERA"
    VEHICLE = "VEHICLE"
    AMBULANCE = "AMBULANCE"


class DecisionStep(str, Enum):
    """Workflow stage that emitted a decision record."""

    DEVICE_CHECKED = "DEVICE_CHECKED"
    CONGESTION_CHECKED = "CONGESTION_CHECKED"
    CRITICALITY_ASSESSED = "CRITICALITY_ASSESSED"
    DECIDED = "DECIDED"
    ALLOCATED = "ALLOCATED"
    QOS_STATUS_CHANGED = "QOS_STATUS_CHANGED"
    RELEASED = "RELEASED"
    FAILED = "FAILED"


@dataclass
class DeviceRef:
    """How a physical asset is addressed on the mobile network."""

    id: str
    phone_number: str | None = None
    ipv4_address: str | None = None
    ipv6_address: str | None = None
    #: Required by Nokia's Device Attach API. Not derivable from a phone number
    #: on a real network, so a deployment must supply it on the asset record.
    imsi: int | None = None

    @classmethod
    def from_wire(cls, raw: dict[str, Any]) -> DeviceRef:
        imsi = raw.get("imsi")
        return cls(
            id=raw["id"],
            phone_number=raw.get("phoneNumber"),
            ipv4_address=raw.get("ipv4Address"),
            ipv6_address=raw.get("ipv6Address"),
            imsi=int(imsi) if imsi is not None else None,
        )


@dataclass
class BusinessEvent:
    """A business event reported by a facility system.

    Arrives from the TypeScript server as camelCase JSON, so this is
    reconstructed via :meth:`from_wire` rather than deserialised directly. Doing
    the conversion explicitly keeps the Python side idiomatic without forcing
    camelCase field names onto every dataclass.
    """

    id: str
    asset_type: AssetType
    device: DeviceRef
    operation: str
    expected_duration_seconds: int
    description: str | None = None
    site: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    occurred_at: str | None = None

    @classmethod
    def from_wire(cls, raw: dict[str, Any]) -> BusinessEvent:
        return cls(
            id=raw["id"],
            asset_type=AssetType(raw["assetType"]),
            device=DeviceRef.from_wire(raw["device"]),
            operation=raw["operation"],
            expected_duration_seconds=int(raw["expectedDurationSeconds"]),
            description=raw.get("description"),
            site=raw.get("site"),
            metadata=raw.get("metadata") or {},
            occurred_at=raw.get("occurredAt"),
        )


@dataclass
class CriticalityAssessment:
    """The LLM's judgement — the only thing a model is allowed to decide.

    Note what is absent: any network action. The model classifies criticality;
    deterministic rules in ``policy.rules`` map that to an allocation decision.
    That separation is what makes the decision trail auditable.
    """

    criticality: Criticality
    confidence: float
    reasoning: str
    safety_critical: bool = False
    model: str = "unknown"
    escalated: bool = False


@dataclass
class Decision:
    """Terminal result of a CriticalOperationWorkflow."""

    operation_id: str
    action: NetworkAction
    reasoning: str
    criticality: Criticality | None = None
    congestion: CongestionLevel | None = None
    device_reachable: bool | None = None
    qod_session_id: str | None = None
    slice_id: str | None = None
    released: bool = False

    def to_wire(self) -> dict[str, Any]:
        return {
            "operationId": self.operation_id,
            "action": self.action.value,
            "reasoning": self.reasoning,
            "criticality": self.criticality.value if self.criticality else None,
            "congestion": self.congestion.value if self.congestion else None,
            "deviceReachable": self.device_reachable,
            "qodSessionId": self.qod_session_id,
            "sliceId": self.slice_id,
            "released": self.released,
        }
