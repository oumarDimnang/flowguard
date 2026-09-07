import type { AssetType } from '../../common/domain/enums';

/**
 * How a physical asset is addressed on the mobile network.
 *
 * In the Nokia sandbox a device is identified by phone number (the simulated
 * devices use numbers such as +99999991000). A real deployment would carry the
 * SIM identity instead — the shape is the same either way.
 */
export interface DeviceRef {
  /** Facility-local asset identifier, e.g. 'crane-a', 'drone-3'. */
  id: string;
  phoneNumber?: string;
  ipv4Address?: string;
  ipv6Address?: string;
}

/**
 * A business event reported by a facility system.
 *
 * This object is serialised across the task queue and arrives as the sole
 * argument to CriticalOperationWorkflow in the Python worker. It is therefore a
 * cross-language contract: adding a required field here without updating
 * agent/ will break deserialisation at the worker.
 */
export interface BusinessEvent {
  /**
   * Which tenant this operation belongs to.
   *
   * Taken from the session of whoever dispatched — never from the request body.
   * It rides through the workflow to the agent and comes back on every decision
   * record, which is how a component with no session still knows the tenant.
   */
  organizationId: string;

  /** Idempotency key. Becomes the workflow ID as operation-{org}-{id} (S7). */
  id: string;
  assetType: AssetType;
  device: DeviceRef;
  /** Human-readable operation name, e.g. 'Move Container #A392'. */
  operation: string;
  /** Free text the LLM reasons over when classifying criticality. */
  description?: string;
  /** Drives the initial conservative QoD duration (D8). */
  expectedDurationSeconds: number;
  site?: string;
  /** Anything the facility wants carried into the decision log. */
  metadata?: Record<string, unknown>;
  /** ISO-8601. Supplied by the facility, not the server clock. */
  occurredAt: string;
}

export interface OperationAccepted {
  operationId: string;
  workflowId: string;
  runId: string;
  /** True when this event had already been submitted and is still running (S7). */
  alreadyRunning: boolean;
}
