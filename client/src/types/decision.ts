import type {
  CongestionLevel,
  Criticality,
  IsoDateString,
  NetworkAction,
  QosStatus,
  QosStatusInfo,
} from './common';

/** Mirrored from server/src/decision-log/domain/decision-record.ts. */

/**
 * Which stage of the workflow emitted a record.
 *
 * Reading these in order for one operation *is* the audit trail — that is the
 * "explainable decision" the product claims, so the trace panel should render
 * every one, including the ones that carry no payload.
 */
export const DecisionStep = {
  DEVICE_CHECKED: 'DEVICE_CHECKED',
  CONGESTION_CHECKED: 'CONGESTION_CHECKED',
  CRITICALITY_ASSESSED: 'CRITICALITY_ASSESSED',
  DECIDED: 'DECIDED',
  ALLOCATED: 'ALLOCATED',
  QOS_STATUS_CHANGED: 'QOS_STATUS_CHANGED',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED',
} as const;
export type DecisionStep = (typeof DecisionStep)[keyof typeof DecisionStep];

/** Canonical order for rendering a trail, independent of arrival order. */
export const DECISION_SEQUENCE: readonly DecisionStep[] = [
  DecisionStep.DEVICE_CHECKED,
  DecisionStep.CONGESTION_CHECKED,
  DecisionStep.CRITICALITY_ASSESSED,
  DecisionStep.DECIDED,
  DecisionStep.ALLOCATED,
  DecisionStep.QOS_STATUS_CHANGED,
  DecisionStep.RELEASED,
];

/**
 * One raw CAMARA call, captured for audit and replay.
 *
 * These are the receipts: a real endpoint path, the body that was sent, what
 * Nokia returned, and how long it took. Rendering them is what separates a
 * working integration from a claim about one.
 */
export interface NetworkCallTrace {
  api: 'CONGESTION_INSIGHTS' | 'DEVICE_STATUS' | 'QUALITY_ON_DEMAND' | 'NETWORK_SLICE';
  operation: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * One read-only tool call the agent chose to make while gathering evidence.
 *
 * `result` is deliberately untyped: each of the four read tools returns a
 * different shape, mirroring the dynamic payload the agent actually sends.
 */
export interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  failed?: boolean;
}

/**
 * The complete read-only toolbox available to the agent, and the empty set of
 * write tools beside it.
 *
 * Not derived from the API — it mirrors agent/src/flowguard_agent/tools/
 * network_tools.py, where a test fails the build if a write tool is ever added.
 * It is here so the trace panel can show what the agent *could* have called
 * next to what it did, and show that allocation was never among the options.
 */
export const AGENT_READ_TOOLS = [
  'verify_device_location',
  'retrieve_device_location',
  'check_device_status',
  'check_network_congestion',
] as const;

export const AGENT_WRITE_TOOLS: readonly string[] = [];

/** One immutable entry in the decision trail. */
export interface DecisionRecord {
  /** Deduplication key, `{runId}:{step}`. */
  idempotencyKey: string;

  operationId: string;
  workflowId: string;
  runId: string;
  step: DecisionStep;

  criticality?: Criticality;
  /** 0..1. Drives model escalation inside the assessment graph. */
  criticalityConfidence?: number;
  congestion?: CongestionLevel;
  deviceReachable?: boolean;

  action?: NetworkAction;
  /** Model-generated justification. Render verbatim — do not summarise it. */
  reasoning?: string;
  /** The path the LangGraph assessment took, including loops back to classify. */
  graphTrace?: string[];
  /** Which read-only CAMARA signals the agent chose to consult, and what they said. */
  toolCalls?: ToolCall[];

  /**
   * Which branch of the agent's `decide()` fired, e.g.
   * `SAFETY_CRITICAL_CONGESTED_SLICE`.
   *
   * The most auditable field in the trail — the evidence that a readable rule
   * made the call rather than the model. Links a record to /policy.
   */
  rule?: string;

  /**
   * The pinned model id behind the criticality judgement.
   *
   * Named `modelId`, not `model`: that key is reserved on a Mongoose document
   * server-side, so the wire field carries the longer name.
   */
  modelId?: string;

  qodSessionId?: string;
  qosStatus?: QosStatus;
  qosStatusInfo?: QosStatusInfo;
  sliceId?: string;

  networkCall?: NetworkCallTrace;
  error?: string;

  /** Supplied by the emitting activity, not the server clock. */
  occurredAt: IsoDateString;
  recordedAt: IsoDateString;
}
