"""Contract tests against payloads the live Nokia sandbox actually returned.

Every body here was captured verbatim from a real response, not written from the
CAMARA specification. That distinction matters: the spec text and Nokia's
implementation disagree in at least one place — congestion windows come back as
``timeIntervalStart`` / ``timeIntervalStop``, not ``startTime`` / ``endTime`` —
and only a real response reveals that.

If Nokia changes a shape, these fail before the workflow does.
"""

from __future__ import annotations

from flowguard_agent.network.schemas import (
    CongestionReading,
    LocationRetrievalResponse,
    LocationVerificationResponse,
    QodSessionResponse,
    ReachabilityResponse,
)

# ── Device Reachability Status ────────────────────────────────────────

REACHABILITY_RESPONSE = {
    "device": {"phoneNumber": "+99999991000"},
    "reachable": True,
    "connectivity": ["SMS"],
    "lastStatusTime": "2026-08-31T21:53:20.114389Z",
}


def test_reachability_response_parses():
    parsed = ReachabilityResponse.model_validate(REACHABILITY_RESPONSE)

    assert parsed.reachable is True
    assert parsed.connectivity == ["SMS"]
    assert parsed.last_status_time is not None


def test_reachability_tolerates_the_echoed_device_block():
    """The response echoes the request's device; nothing downstream needs it."""
    parsed = ReachabilityResponse.model_validate(REACHABILITY_RESPONSE)
    assert not hasattr(parsed, "device")


def test_sms_only_connectivity_still_counts_as_reachable():
    """The sandbox reports SMS-only. Reachability is the guard, not throughput.

    A device answering only on SMS is still attached to the network — whether it
    can carry the operation's traffic is what QoD is for, and is decided later.
    """
    parsed = ReachabilityResponse.model_validate(REACHABILITY_RESPONSE)
    assert parsed.reachable is True
    assert "DATA" not in parsed.connectivity


# ── Congestion Insights ───────────────────────────────────────────────

CONGESTION_RESPONSE = [
    {
        "timeIntervalStart": "2026-08-31T21:48:24.257072Z",
        "timeIntervalStop": "2026-08-31T21:53:24.257072Z",
        "congestionLevel": "High",
        "confidenceLevel": 66,
    },
    {
        "timeIntervalStart": "2026-08-31T21:43:24.257072Z",
        "timeIntervalStop": "2026-08-31T21:48:24.257072Z",
        "congestionLevel": "Medium",
        "confidenceLevel": 40,
    },
]


def test_congestion_window_parses_with_nokia_field_names():
    """timeIntervalStart/Stop, not the spec's startTime/endTime.

    These were silently None until a live response exposed the difference.
    """
    parsed = CongestionReading.model_validate(CONGESTION_RESPONSE[0])

    assert parsed.congestion_level == "High"
    assert parsed.confidence_level == 66
    assert parsed.start_time is not None, "timeIntervalStart alias is wrong"
    assert parsed.end_time is not None, "timeIntervalStop alias is wrong"


def test_congestion_returns_a_bare_array_newest_first():
    """The endpoint returns a JSON array, and element 0 is the current window."""
    readings = [CongestionReading.model_validate(r) for r in CONGESTION_RESPONSE]

    assert len(readings) == 2
    assert readings[0].start_time > readings[1].start_time


def test_confidence_is_a_percentage_not_a_fraction():
    """0-100. The mock provider matches this scale so the UI stays consistent."""
    parsed = CongestionReading.model_validate(CONGESTION_RESPONSE[0])
    assert 0 <= parsed.confidence_level <= 100
    assert parsed.confidence_level > 1


# ── Location Verification ─────────────────────────────────────────────

VERIFICATION_RESPONSE = {
    "verificationResult": "FALSE",
    "lastLocationTime": "2026-08-31T21:53:21.260770",
}


def test_verification_response_parses_without_a_match_rate():
    """matchRate is absent in practice; only the verdict is guaranteed."""
    parsed = LocationVerificationResponse.model_validate(VERIFICATION_RESPONSE)

    assert parsed.verification_result == "FALSE"
    assert parsed.match_rate is None


def test_naive_timestamp_is_accepted():
    """lastLocationTime arrives without a timezone suffix on this endpoint."""
    parsed = LocationVerificationResponse.model_validate(VERIFICATION_RESPONSE)
    assert parsed.last_location_time is not None
    assert parsed.last_location_time.tzinfo is None


# ── Quality on Demand ─────────────────────────────────────────────────

QOD_CREATE_RESPONSE = {
    "qosProfile": "DOWNLINK_M_UPLINK_L",
    "device": {
        "phoneNumber": "+99999991001",
        "ipv4Address": {
            "publicAddress": "233.252.0.2",
            "privateAddress": "192.0.2.25",
            "publicPort": 80,
        },
    },
    "applicationServer": {"ipv4Address": "8.8.8.8"},
    "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "qosStatus": "REQUESTED",
    "duration": 60,
}


def test_qod_create_response_parses():
    parsed = QodSessionResponse.model_validate(QOD_CREATE_RESPONSE)

    assert parsed.session_id
    assert parsed.qos_status == "REQUESTED"
    assert parsed.qos_profile == "DOWNLINK_M_UPLINK_L"


def test_session_starts_requested_not_available():
    """QoD is asynchronous. The dashboard renders the transition, so nothing
    downstream may assume a new session is already carrying traffic."""
    parsed = QodSessionResponse.model_validate(QOD_CREATE_RESPONSE)
    assert parsed.qos_status != "AVAILABLE"


# ── Location Retrieval ────────────────────────────────────────────────

RETRIEVAL_RESPONSE = {
    "lastLocationTime": "2026-08-31T21:57:00.535505Z",
    "area": {
        "areaType": "CIRCLE",
        "center": {"latitude": 47.48627616952785, "longitude": 19.07915612501993},
        "radius": 1000,
    },
}


def test_location_retrieval_response_parses():
    """Network location is an area, not a point — radius is the accuracy."""
    parsed = LocationRetrievalResponse.model_validate(RETRIEVAL_RESPONSE)

    assert parsed.area.area_type == "CIRCLE"
    assert parsed.area.radius == 1000
    assert parsed.last_location_time is not None


def test_sandbox_devices_are_not_where_the_demo_scenarios_are():
    """Documents a trap rather than asserting desired behaviour.

    Nokia's sandbox devices report a fixed position near Budapest, while the
    demo scenarios use Bahrain coordinates. Under NETWORK_PROVIDER=nokia every
    location check therefore returns FALSE, and every safety-critical claim is
    downgraded as a contradiction. That is the agent working correctly on a
    real signal — but it will look like a broken demo.
    """
    parsed = LocationRetrievalResponse.model_validate(RETRIEVAL_RESPONSE)

    bahrain_lat, bahrain_lon = 26.2041, 50.6050
    assert abs(parsed.area.center.latitude - bahrain_lat) > 20
    assert abs(parsed.area.center.longitude - bahrain_lon) > 20
