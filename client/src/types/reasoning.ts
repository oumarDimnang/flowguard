import type { IsoDateString } from './common';

/** Mirrored from server/src/decision-log/dto/reasoning-trace.dto.ts. */

/**
 * What one live reasoning event is about.
 *
 * A node is one of the four in the assessment graph; a tool is one of the
 * four read-only CAMARA tools. Both start and finish, so a watcher can show
 * "thinking" between the two rather than only the result.
 */
export const ReasoningTraceKind = {
  NODE_STARTED: 'node_started',
  NODE_FINISHED: 'node_finished',
  TOOL_STARTED: 'tool_started',
  TOOL_FINISHED: 'tool_finished',
} as const;
export type ReasoningTraceKind = (typeof ReasoningTraceKind)[keyof typeof ReasoningTraceKind];

/**
 * One event from inside the agent's assessment graph, pushed as it happens.
 *
 * Ephemeral. These are never stored: they exist so the dashboard can show the
 * reasoning while the model is still running. The durable, audited account of
 * the same reasoning is the CRITICALITY_ASSESSED decision record, whose
 * `graphTrace` carries the same `detail` lines these events carried live.
 */
export interface ReasoningTraceEvent {
  organizationId: string;
  operationId: string;
  workflowId?: string;
  runId?: string;
  /** Order within one assessment. Monotonic, starting at 1. */
  seq: number;
  kind: ReasoningTraceKind;
  /** A graph node name for node events, a tool name for tool events. */
  node: string;
  /** The `graphTrace` line for a finished node, or a tool's result. */
  detail?: string;
  /** Structured payload; shape depends on `kind` and `node`. */
  data?: Record<string, unknown>;
  occurredAt: IsoDateString;
}

/** The nodes of the assessment graph, mirrored from assessment_graph.py. */
export const REASONING_NODES = ['classify', 'gather_evidence', 'escalate', 'validate'] as const;

export function isReasoningNode(name: string): boolean {
  return (REASONING_NODES as readonly string[]).includes(name);
}
