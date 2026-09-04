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
  /** A container move advanced through the crane's physical sequence. */
  TERMINAL_MOVE_UPDATED: 'terminal.move_updated',
  /** The berth work queue was reset back to its planned state. */
  TERMINAL_QUEUE_RESET: 'terminal.queue_reset',
} as const;

export type LiveEventName = (typeof LIVE_EVENTS)[keyof typeof LIVE_EVENTS];

/** Socket.IO namespace the dashboard connects to. */
export const LIVE_NAMESPACE = 'live';
