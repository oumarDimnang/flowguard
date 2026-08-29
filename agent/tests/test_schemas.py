"""CAMARA payload validation.

These schemas exist because hand-rolled ``.get()`` parsing fails silently in the
worst possible direction. ``bool(body.get("reachable"))`` is ``False`` when the
field is absent — so a renamed field or an unexpected body would report a
healthy device as unreachable, the guard clause would fire, and a safety-critical
operation would go unprotected with nothing logged anywhere.

The tests below pin the behaviour that prevents that: required fields raise,
optional ones don't, and unknown fields are tolerated.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from flowguard_agent.network.schemas import (
    CongestionReading,
    CreateQodSessionRequest,
    LocationVerificationResponse,
    QodSessionResponse,
    ReachabilityResponse,
    SliceAttachmentResponse,
)

# ── The bug these schemas exist to prevent ────────────────────────────


def test_missing_reachability_raises_instead_of_defaulting_to_false():
    """The single most important test in this file.

    Silently defaulting to False would mean a schema change quietly disables
    protection for every operation, with no error to notice.
    """
    with pytest.raises(ValidationError):
        ReachabilityResponse.model_validate({"lastStatusTime": "2026-08-29T04:12:03Z"})


def test_reachability_parses_the_documented_response():
    parsed = ReachabilityResponse.model_validate(
        {
            "reachable": True,
            "lastStatusTime": "2026-08-29T04:12:03Z",
            "connectivity": ["DATA"],
        }
    )
    assert parsed.reachable is True
    assert parsed.connectivity == ["DATA"]
    assert parsed.last_status_time is not None


def test_unknown_fields_are_tolerated():
    """Nokia adding a field must not break a running agent."""
    parsed = ReachabilityResponse.model_validate(
        {"reachable": False, "someNewFieldNokiaAdded": {"nested": 1}}
    )
    assert parsed.reachable is False


# ── Congestion ────────────────────────────────────────────────────────


def test_congestion_accepts_nokia_casing_exactly():
    parsed = CongestionReading.model_validate({"congestionLevel": "High", "confidenceLevel": 90})
    assert parsed.congestion_level == "High"
    assert parsed.confidence_level == 90


@pytest.mark.parametrize("bad", ["HIGH", "high", "Severe", "", None])
def test_unrecognised_congestion_level_is_rejected(bad):
    """An unknown level must fail loudly rather than be coerced.

    The policy compares against exact values; anything else silently becoming a
    valid level would produce an allocation decision from a value nobody
    checked.
    """
    with pytest.raises(ValidationError):
        CongestionReading.model_validate({"congestionLevel": bad})


def test_congestion_level_none_is_valid():
    """CAMARA reports 'None' for an uncongested cell — a real value, not absence."""
    parsed = CongestionReading.model_validate({"congestionLevel": "None"})
    assert parsed.congestion_level == "None"


# ── Quality on Demand ─────────────────────────────────────────────────


def test_qod_session_requires_an_id_and_status():
    """Without a session ID there is nothing to release — the costly failure."""
    with pytest.raises(ValidationError):
        QodSessionResponse.model_validate({"qosStatus": "REQUESTED"})

    with pytest.raises(ValidationError):
        QodSessionResponse.model_validate({"sessionId": "abc"})


def test_qod_session_parses_the_201_body():
    parsed = QodSessionResponse.model_validate(
        {
            "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "qosStatus": "REQUESTED",
            "qosProfile": "DOWNLINK_M_UPLINK_L",
            "duration": 240,
            "startedAt": "2026-08-29T04:12:05Z",
            "expiresAt": "2026-08-29T04:16:05Z",
            "messages": [{"severity": "INFO", "description": ""}],
        }
    )
    assert parsed.session_id.startswith("3fa85f64")
    assert parsed.qos_status == "REQUESTED"
    assert parsed.duration == 240


def test_qod_request_serialises_to_the_verified_wire_shape():
    """Must match the body the account playground accepted, exactly."""
    request = CreateQodSessionRequest.model_validate(
        {
            "device": {"phoneNumber": "+99999991001"},
            "applicationServer": {"ipv4Address": "8.8.8.8"},
            "qosProfile": "DOWNLINK_M_UPLINK_L",
            "duration": 60,
        }
    )

    wire = request.model_dump(by_alias=True, exclude_none=True)

    assert wire == {
        "device": {"phoneNumber": "+99999991001"},
        "applicationServer": {"ipv4Address": "8.8.8.8"},
        "qosProfile": "DOWNLINK_M_UPLINK_L",
        "duration": 60,
    }


def test_qod_duration_must_be_positive():
    """Duration is the TTL backstop; zero would mean no protection at all."""
    with pytest.raises(ValidationError):
        CreateQodSessionRequest.model_validate(
            {
                "device": {"phoneNumber": "+99999991001"},
                "applicationServer": {"ipv4Address": "8.8.8.8"},
                "qosProfile": "DOWNLINK_M_UPLINK_L",
                "duration": 0,
            }
        )


# ── Location ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("verdict", ["TRUE", "FALSE", "PARTIAL", "UNKNOWN"])
def test_all_four_verification_verdicts_are_accepted(verdict):
    """PARTIAL and UNKNOWN are real answers, not errors.

    A device may straddle the boundary, or the network may not know. Only FALSE
    means the operation is somewhere it claims not to be — treating the other
    two as contradictions would downgrade genuine emergencies.
    """
    parsed = LocationVerificationResponse.model_validate({"verificationResult": verdict})
    assert parsed.verification_result == verdict


def test_match_rate_outside_percentage_range_is_rejected():
    with pytest.raises(ValidationError):
        LocationVerificationResponse.model_validate(
            {"verificationResult": "TRUE", "matchRate": 150}
        )


# ── Slicing ───────────────────────────────────────────────────────────


def test_slice_attachment_requires_an_identifier():
    """A slice attachment has no TTL; losing its ID means it never detaches."""
    with pytest.raises(ValidationError):
        SliceAttachmentResponse.model_validate({"state": "ATTACHED"})

    parsed = SliceAttachmentResponse.model_validate({"id": "att-123", "state": "ATTACHED"})
    assert parsed.id == "att-123"
