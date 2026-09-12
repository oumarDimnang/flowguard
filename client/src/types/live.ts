import type { QosStatus, QosStatusInfo } from './common';
import type { DecisionRecord } from './decision';
import type { Operation } from './operation';
import type { FacilityJob } from './facility';
import type { ReasoningTraceEvent } from './reasoning';

/**
 * Socket.IO push events, mirrored from server/src/realtime/realtime.events.ts.
 *
 * The socket is push-only by design — the dashboard never sends commands over
 * it, only over REST — so there is no outbound event map here.
 */
export const LIVE_EVENTS = {
  OPERATION_STARTED: 'operation.started',
  OPERATION_UPDATED: 'operation.updated',
  DECISION_RECORDED: 'decision.recorded',
  QOD_STATUS_CHANGED: 'qod.status_changed',
  FACILITY_JOB_UPDATED: 'facility.job_updated',
  FACILITY_PLAN_RESET: 'facility.plan_reset',
  /** The agent's reasoning, one node or tool call at a time, while it runs. */
  REASONING_TRACE: 'reasoning.trace',
} as const;

export type LiveEventName = (typeof LIVE_EVENTS)[keyof typeof LIVE_EVENTS];

/** Socket.IO namespace. The client connects to `${API_URL}/live`. */
export const LIVE_NAMESPACE = 'live';

/**
 * Payload shape per event, verified against the publish sites on the server:
 * operations.service.ts, decision-log.service.ts and terminal.service.ts.
 *
 * Most carry the full entity, so a handler can merge by id without refetching.
 * `qod.status_changed` is the exception — it is a notification, not an entity.
 */
export interface LiveEventPayloads {
  'operation.started': Operation;
  'operation.updated': Operation;
  'decision.recorded': DecisionRecord;
  'qod.status_changed': {
    operationId: string;
    sessionId?: string;
    qosStatus?: QosStatus;
    qosStatusInfo?: QosStatusInfo;
  };
  'facility.job_updated': FacilityJob;
  'facility.plan_reset': FacilityJob[];
  'reasoning.trace': ReasoningTraceEvent;
}

export type LiveEventPayload<E extends LiveEventName> = LiveEventPayloads[E];
