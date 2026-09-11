/**
 * Contract shared with the Python worker (`agent/`).
 *
 * These strings are how a TypeScript process addresses workflows written in
 * Python. There is no compile-time link between the two, so any change here
 * MUST be mirrored in `agent/src/flowguard_agent/` or the workflow will start
 * and then sit unclaimed on the task queue.
 */

/** Workflow type names — must equal the Python class names exactly. */
export const WORKFLOW_TYPES = {
  CRITICAL_OPERATION: 'CriticalOperationWorkflow',
  NETWORK_BOOTSTRAP: 'NetworkBootstrapWorkflow',
} as const;

/**
 * Signal names — must equal the Python `@workflow.signal` method names.
 * Python registers a signal under its method name unless given an explicit
 * `name=` argument.
 */
export const SIGNALS = {
  OPERATION_COMPLETED: 'operation_completed',

  /**
   * The operation halted with its load committed — a crane emergency stop, an
   * abort with the box in the air.
   *
   * Deliberately not a completion. The workflow holds connectivity through a
   * suspension and stops its safety valve counting, because a stopped lift is
   * the state the video feed exists for, not the state to withdraw it in.
   */
  OPERATION_SUSPENDED: 'operation_suspended',

  /** Moving again, or the committed load has been landed. */
  OPERATION_RESUMED: 'operation_resumed',
  QOD_STATUS_CHANGED: 'qod_status_changed',
  CONGESTION_UPDATED: 'congestion_updated',
  DEVICE_STATUS_CHANGED: 'device_status_changed',
} as const;

/** Query names — must equal the Python `@workflow.query` method names. */
export const QUERIES = {
  GET_STATE: 'get_state',
} as const;

/**
 * Deterministic workflow ID derived from the tenant and the business event (S7).
 *
 * Temporal rejects a duplicate workflow ID while an execution is running, so a
 * double-submitted business event cannot start two workflows holding two QoD
 * sessions. This is idempotency on the exact path where duplication costs money.
 *
 * The organization is part of the id, not decoration. Without it two tenants
 * submitting the same event id would collide — and because Temporal's response
 * to a duplicate is to hand back the *running* execution, the second tenant
 * would silently adopt the first one's workflow and its paid session.
 */
export function operationWorkflowId(organizationId: string, businessEventId: string): string {
  return `operation-${organizationId}-${businessEventId}`;
}

/** Singleton ID for the long-running bootstrap workflow (D5). */
export const NETWORK_BOOTSTRAP_WORKFLOW_ID = 'network-bootstrap';
