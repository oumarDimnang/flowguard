import type {
  AssetType,
  CongestionLevel,
  Criticality,
  NetworkAction,
  OperationStatus,
  QosStatus,
} from '../../common/domain/enums';

/**
 * Dashboard read model for one critical operation.
 *
 * NOT the source of truth. Authoritative operation state lives in Temporal's
 * workflow history; this is a denormalised projection built from the decision
 * events the Python activities emit, so the dashboard can render without
 * querying Temporal on every paint.
 */
export interface Operation {
  /** Equals the originating business event id. */
  operationId: string;
  workflowId: string;
  runId?: string;

  assetType: AssetType;
  deviceId: string;
  /** Human-readable operation name, e.g. 'Move Container #A392'. */
  operationName: string;
  site?: string;

  status: OperationStatus;

  // ── Decision inputs ────────────────────────────────────────────────
  criticality?: Criticality;
  congestion?: CongestionLevel;
  deviceReachable?: boolean;

  // ── Decision output ────────────────────────────────────────────────
  action?: NetworkAction;
  /** Model-generated justification. Rendered verbatim in the decision trace. */
  reasoning?: string;

  // ── Network resources currently held ───────────────────────────────
  qodSessionId?: string;
  qosStatus?: QosStatus;
  sliceId?: string;

  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export type OperationCreate = Pick<
  Operation,
  'operationId' | 'workflowId' | 'assetType' | 'deviceId' | 'operationName'
> &
  Partial<Pick<Operation, 'runId' | 'site' | 'status'>>;

export type OperationPatch = Partial<Omit<Operation, 'operationId' | 'startedAt'>>;
