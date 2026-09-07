import type { AssetType, DeviceRef } from './common';

/**
 * Mirrored from server/src/simulator/scenarios/scenario.definitions.ts.
 *
 * The simulator is the scripted, reproducible path — distinct from the terminal,
 * which is interactive. Both submit the same business events; the scenarios
 * exist so the impact percentages come from replaying a fixed set rather than
 * from whatever happened to be dispatched by hand.
 */

export interface ScenarioEvent {
  /** Suffix appended to the run nonce to build a unique event id. */
  key: string;
  assetType: AssetType;
  device: DeviceRef;
  operation: string;
  description: string;
  expectedDurationSeconds: number;
  site?: string;
  metadata?: Record<string, unknown>;
}

export interface ScenarioStep {
  /** Delay from scenario start before this event is emitted. */
  atMs: number;
  event: ScenarioEvent;
  /** Emit a completion signal this long after the event, if set. */
  completeAfterMs?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
}

/**
 * Returned by POST /simulator/scenarios/:id/run.
 *
 * The planned timeline, not the results — the point of a scenario is that it
 * unfolds over time and is watched on the socket.
 */
export interface ScenarioRun {
  runId: string;
  scenarioId: string;
  scheduled: { operationId: string; atMs: number; operation: string }[];
}

/** The pair that demonstrates the thesis: same device, same congestion, opposite decisions. */
export const CONTRAST_SCENARIO_ID = 'drone-contrast';
