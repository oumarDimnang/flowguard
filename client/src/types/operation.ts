import type {
  AssetType,
  CongestionLevel,
  Criticality,
  DeviceRef,
  IsoDateString,
  NetworkAction,
  OperationStatus,
  QosStatus,
} from './common';

/** Mirrored from server/src/operations/domain/operation.ts. */

/**
 * Dashboard read model for one critical operation.
 *
 * NOT the source of truth — authoritative state lives in Temporal's workflow
 * history. This is a projection built from the decision events the Python
 * activities emit. When the two disagree the workflow is right, which is what
 * `GET /operations/:id/execution` is for.
 */
export interface Operation {
  /** Equals the originating business event id. */
  operationId: string;
  workflowId: string;
  runId?: string;

  assetType: AssetType;
  deviceId: string;
  operationName: string;
  site?: string;

  status: OperationStatus;

  criticality?: Criticality;
  congestion?: CongestionLevel;
  deviceReachable?: boolean;

  action?: NetworkAction;
  reasoning?: string;

  qodSessionId?: string;
  qosStatus?: QosStatus;
  sliceId?: string;

  startedAt: IsoDateString;
  updatedAt: IsoDateString;
  completedAt?: IsoDateString;
}

/**
 * Live execution state straight from Temporal, bypassing the read model.
 *
 * Mirrors OperationSnapshot in server/src/temporal/ports/. The endpoint returns
 * `{ status: 'NOT_FOUND', operationId }` when no such workflow exists, hence
 * the union.
 */
export type OperationExecution =
  | {
      workflowId: string;
      runId: string;
      status: string;
      startedAt?: IsoDateString;
      closedAt?: IsoDateString;
    }
  | { status: 'NOT_FOUND'; operationId: string };

export function isExecutionFound(
  execution: OperationExecution,
): execution is Extract<OperationExecution, { workflowId: string }> {
  return execution.status !== 'NOT_FOUND';
}

/** Response from POST /events. */
export interface OperationAccepted {
  operationId: string;
  workflowId: string;
  runId: string;
  /** True when this event was already submitted and its workflow is still running. */
  alreadyRunning: boolean;
}

/**
 * Payload for POST /events.
 *
 * The dashboard does not normally send these — the terminal and the simulator
 * do. It is typed here so a manual-trigger control can exist without inventing
 * the shape. The server validates with forbidNonWhitelisted, so an unrecognised
 * top-level field is a 400; anything extra belongs in `metadata`.
 */
export interface CreateBusinessEvent {
  /** Idempotency key. Becomes the workflow id as `operation-{id}`. */
  id: string;
  assetType: AssetType;
  device: DeviceRef;
  operation: string;
  description?: string;
  expectedDurationSeconds: number;
  site?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: IsoDateString;
}

/** True while the operation may still be holding network resources. */
export function isOperationInFlight(status: OperationStatus): boolean {
  return status !== 'COMPLETED' && status !== 'FAILED';
}

/** True when the operation currently holds a QoD session or a slice attachment. */
export function holdsPremiumConnectivity(operation: Operation): boolean {
  return (
    isOperationInFlight(operation.status) &&
    (operation.qodSessionId !== undefined || operation.sliceId !== undefined)
  );
}
