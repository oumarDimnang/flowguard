import type {
  CongestionLevel,
  Criticality,
  NetworkAction,
  QosStatus,
  QosStatusInfo,
} from '../../common/domain/enums';

/**
 * Which stage of the workflow emitted a record.
 *
 * Together these form the audit trail: replaying a decision means reading the
 * records for one operation in order.
 */
export enum DecisionStep {
  DEVICE_CHECKED = 'DEVICE_CHECKED',
  CONGESTION_CHECKED = 'CONGESTION_CHECKED',
  CRITICALITY_ASSESSED = 'CRITICALITY_ASSESSED',
  DECIDED = 'DECIDED',
  ALLOCATED = 'ALLOCATED',
  QOS_STATUS_CHANGED = 'QOS_STATUS_CHANGED',
  RELEASED = 'RELEASED',
  FAILED = 'FAILED',
}

/** Raw CAMARA call captured for audit and demo replay. */
export interface NetworkCallTrace {
  api: 'CONGESTION_INSIGHTS' | 'DEVICE_STATUS' | 'QUALITY_ON_DEMAND' | 'NETWORK_SLICE';
  operation: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  durationMs?: number;
}

/** One read-only tool call the agent chose to make while gathering evidence. */
export interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  failed?: boolean;
}

/**
 * One immutable entry in the decision trail.
 *
 * This collection is append-only. Nothing in the system updates a record after
 * it is written — that is what makes it usable as evidence rather than state.
 */
export interface DecisionRecord {
  /**
   * Deduplication key, `{runId}:{step}`.
   *
   * Temporal activities retry, so the same decision event can be delivered more
   * than once. Without this, a retried emit would double-render the decision
   * trace and skew the impact metrics.
   */
  idempotencyKey: string;

  /**
   * The tenant this record belongs to.
   *
   * Arrives in the payload from the workflow rather than from a session — the
   * agent posts with a machine token and has no session to read one from.
   */
  organizationId: string;

  operationId: string;
  workflowId: string;
  runId: string;
  step: DecisionStep;

  criticality?: Criticality;
  criticalityConfidence?: number;
  congestion?: CongestionLevel;
  deviceReachable?: boolean;

  action?: NetworkAction;
  /** Model-generated justification, rendered verbatim in the dashboard. */
  reasoning?: string;
  /** The path the LangGraph assessment took — shown alongside `reasoning`. */
  graphTrace?: string[];
  /** Which read-only CAMARA signals the agent chose to consult, and what they said. */
  toolCalls?: ToolCall[];

  /** Which branch of the agent's decide() fired — the auditable half. */
  rule?: string;
  /** Pinned model id behind the criticality judgement. Not `model` — reserved by Mongoose. */
  modelId?: string;

  qodSessionId?: string;
  qosStatus?: QosStatus;
  qosStatusInfo?: QosStatusInfo;
  sliceId?: string;

  networkCall?: NetworkCallTrace;
  error?: string;

  /** Supplied by the emitting activity, not the server clock. */
  occurredAt: Date;
  recordedAt: Date;
}
