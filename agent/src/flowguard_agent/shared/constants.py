"""Names that cross process boundaries.

Activities are invoked by name rather than by importing the function, for two
reasons: it keeps heavy dependencies (LangChain, httpx, the Nokia SDK) out of
the workflow sandbox, and it mirrors how the TypeScript server starts these
workflows — neither side can import the other's code.
"""

# Workflow type names — must match server/src/temporal/temporal.constants.ts
WORKFLOW_CRITICAL_OPERATION = "CriticalOperationWorkflow"
WORKFLOW_NETWORK_BOOTSTRAP = "NetworkBootstrapWorkflow"

# Signal names — must match SIGNALS in the same server file.
SIGNAL_OPERATION_COMPLETED = "operation_completed"
SIGNAL_QOD_STATUS_CHANGED = "qod_status_changed"
SIGNAL_CONGESTION_UPDATED = "congestion_updated"
SIGNAL_DEVICE_STATUS_CHANGED = "device_status_changed"

# Query names.
QUERY_GET_STATE = "get_state"

# Activity names — internal to the worker.
ACTIVITY_GET_POLICY_CONFIG = "get_policy_config"
ACTIVITY_CHECK_DEVICE_STATUS = "check_device_status"
ACTIVITY_QUERY_CONGESTION = "query_congestion"
ACTIVITY_ASSESS_CRITICALITY = "assess_criticality"
ACTIVITY_ALLOCATE = "allocate"
ACTIVITY_ESCALATE_TO_SLICE = "escalate_to_slice"
ACTIVITY_POLL_QOD = "poll_qod"
ACTIVITY_EXTEND_QOD = "extend_qod"
ACTIVITY_RELEASE = "release"
ACTIVITY_EMIT_DECISION = "emit_decision"
