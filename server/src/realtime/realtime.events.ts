/**
 * WebSocket event names pushed to the dashboard.
 *
 * Consumed by client/src/hooks/useLiveEvents.ts — renaming one of these is a
 * breaking change for the dashboard.
 */
export const LIVE_EVENTS = {
  /** A business event was accepted and its workflow started. */
  OPERATION_STARTED: 'operation.started',
  /** An operation changed lifecycle state (assessing, allocated, released...). */
  OPERATION_UPDATED: 'operation.updated',
  /** A decision was recorded — this is what drives the decision trace panel. */
  DECISION_RECORDED: 'decision.recorded',
  /** A CAMARA QoD session changed status (REQUESTED -> AVAILABLE), see D8. */
  QOD_STATUS_CHANGED: 'qod.status_changed',
  /**
   * A facility job advanced through its physical sequence.
   *
   * Industry-neutral: the payload carries its own lifecycle, so a container
   * move and a drone sortie arrive on the same channel and the dashboard picks
   * a panel from the organization's industry rather than from the event name.
   */
  FACILITY_JOB_UPDATED: 'facility.job_updated',
  /** The facility plan was reset back to its planned state. */
  FACILITY_PLAN_RESET: 'facility.plan_reset',
} as const;

export type LiveEventName = (typeof LIVE_EVENTS)[keyof typeof LIVE_EVENTS];

/** Socket.IO namespace the dashboard connects to. */
export const LIVE_NAMESPACE = 'live';
