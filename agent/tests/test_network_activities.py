"""Allocation boundary checks with no network or Temporal server."""

from unittest import IsolatedAsyncioTestCase
from unittest.mock import Mock, call

from temporalio.exceptions import ApplicationError

from flowguard_agent.activities.network import NetworkActivities
from flowguard_agent.network.models import QodSession, SliceAttachment
from flowguard_agent.network.provider import NetworkProvider
from flowguard_agent.shared.models import DeviceRef, NetworkAction, QosStatus


class AllocationTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.provider = Mock(spec=NetworkProvider)
        self.provider.slice_id = "slice-test"
        self.provider.create_qod_session.return_value = QodSession(
            session_id="session-test",
            qos_status=QosStatus.REQUESTED,
            qos_profile="test-profile",
            duration_seconds=60,
        )
        self.provider.attach_device_to_slice.return_value = SliceAttachment(
            slice_id="slice-test", attachment_id="attachment-test"
        )
        self.activities = NetworkActivities(self.provider, qos_profile="test-profile")

    async def test_none_rejected_without_any_provider_calls(self):
        with self.assertRaisesRegex(ApplicationError, "NONE decision") as error:
            await self.activities.allocate(self.payload(NetworkAction.NONE))

        self.assertTrue(error.exception.non_retryable)
        self.assertEqual(self.provider.mock_calls, [])

    async def test_qod_allocates_without_slice(self):
        await self.check_valid_allocation(NetworkAction.QOD, slice_available=True)

    async def test_qod_and_slice_allocates_both(self):
        await self.check_valid_allocation(NetworkAction.QOD_AND_SLICE, slice_available=True)

    async def test_missing_slice_preserves_qod_fallback(self):
        await self.check_valid_allocation(NetworkAction.QOD_AND_SLICE, slice_available=False)

    async def test_slice_failure_releases_qod_before_propagating(self):
        failure = RuntimeError("slice unavailable")
        self.provider.attach_device_to_slice.side_effect = failure

        with self.assertRaises(RuntimeError) as error:
            await self.activities.allocate(self.payload(NetworkAction.QOD_AND_SLICE))

        self.assertIs(error.exception, failure)
        self.assertEqual(
            self.provider.mock_calls,
            [
                call.create_qod_session(
                    DeviceRef(id="device-test"), qos_profile="test-profile",
                    duration_seconds=60, sink_url=None,
                ),
                call.attach_device_to_slice(DeviceRef(id="device-test"), "slice-test"),
                call.delete_qod_session("session-test"),
            ],
        )
        self.provider.delete_qod_session.assert_awaited_once_with("session-test")

    async def test_cleanup_failure_preserves_original_allocation_error(self):
        failure = RuntimeError("slice unavailable")
        self.provider.attach_device_to_slice.side_effect = failure
        self.provider.delete_qod_session.side_effect = RuntimeError("delete unavailable")

        with (
            self.assertLogs("flowguard_agent.activities.network", level="ERROR") as logs,
            self.assertRaises(RuntimeError) as error,
        ):
            await self.activities.allocate(self.payload(NetworkAction.QOD_AND_SLICE))

        self.assertIs(error.exception, failure)
        self.provider.delete_qod_session.assert_awaited_once_with("session-test")
        self.assertIn("QoD cleanup failed", logs.output[0])
        self.assertIn("session-test", logs.output[0])

    async def test_qod_creation_failure_does_not_attempt_cleanup(self):
        failure = RuntimeError("create unavailable")
        self.provider.create_qod_session.side_effect = failure

        with self.assertRaises(RuntimeError) as error:
            await self.activities.allocate(self.payload(NetworkAction.QOD_AND_SLICE))

        self.assertIs(error.exception, failure)
        self.provider.attach_device_to_slice.assert_not_called()
        self.provider.delete_qod_session.assert_not_called()

    async def test_retry_keeps_successful_session_after_failed_attempt_cleanup(self):
        self.provider.create_qod_session.side_effect = [
            QodSession("failed-session", QosStatus.REQUESTED, "test-profile", 60),
            QodSession("retry-session", QosStatus.REQUESTED, "test-profile", 60),
        ]
        self.provider.attach_device_to_slice.side_effect = [
            RuntimeError("temporary slice failure"),
            SliceAttachment("slice-test", "attachment-test"),
        ]

        with self.assertRaises(RuntimeError):
            await self.activities.allocate(self.payload(NetworkAction.QOD_AND_SLICE))
        result = await self.activities.allocate(self.payload(NetworkAction.QOD_AND_SLICE))

        self.assertEqual(result["qodSessionId"], "retry-session")
        self.assertEqual(result["attachmentId"], "attachment-test")
        self.provider.delete_qod_session.assert_awaited_once_with("failed-session")

    async def check_valid_allocation(self, action, *, slice_available):
        if not slice_available:
            self.provider.slice_id = None
        result = await self.activities.allocate(self.payload(action))

        self.provider.create_qod_session.assert_awaited_once_with(
            DeviceRef(id="device-test"),
            qos_profile="test-profile",
            duration_seconds=60,
            sink_url=None,
        )
        self.provider.delete_qod_session.assert_not_called()
        self.assertEqual(result["qodSessionId"], "session-test")
        self.assertEqual(result["qosStatus"], "REQUESTED")
        if action is NetworkAction.QOD_AND_SLICE and slice_available:
            self.provider.attach_device_to_slice.assert_awaited_once_with(
                DeviceRef(id="device-test"), "slice-test"
            )
            self.assertEqual(result["sliceId"], "slice-test")
            self.assertEqual(result["attachmentId"], "attachment-test")
        else:
            self.provider.attach_device_to_slice.assert_not_called()
            self.assertIsNone(result["sliceId"])
            self.assertIsNone(result["attachmentId"])
        self.assertEqual(
            result.get("sliceUnavailable", False),
            action is NetworkAction.QOD_AND_SLICE and not slice_available,
        )

    @staticmethod
    def payload(action):
        return {
            "device": {"id": "device-test"},
            "action": action.value,
            "durationSeconds": 60,
        }
