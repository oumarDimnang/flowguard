import type { IsoDateString } from './common';

/** Mirrored from server/src/facility/domain/facility-job.ts. */

export const GateAuthorisation = {
  DECISION: 'DECISION',
  TIMEOUT: 'TIMEOUT',
} as const;
export type GateAuthorisation = (typeof GateAuthorisation)[keyof typeof GateAuthorisation];

export const JOB_QUEUED = 'QUEUED';
export const JOB_ABORTED = 'ABORTED';

/**
 * Halted with the load committed — an emergency stop, a fault, an abort called
 * with the box already in the air.
 *
 * Still in flight, and the one state where FlowGuard deliberately holds on
 * rather than releasing: the operator is now landing a suspended load on the
 * video feed, which is the feed this whole product exists to protect.
 */
export const JOB_HELD = 'HELD';

/**
 * One job in a facility's work queue, whatever the facility is.
 *
 * `lifecycle` and `gateState` travel with the job, so the shared progress strip
 * and gate panel render any industry without knowing what a twistlock is. The
 * `attributes` bag stays open and is narrowed by that industry's panel — a
 * container and a flight plan have nothing in common worth flattening.
 */
export interface FacilityJob<A = unknown> {
  id: string;
  assetId: string;
  devicePhoneNumber?: string;

  state: string;
  /** The lifecycle state a held job stopped at, so it can be put back. */
  heldFrom?: string;
  /** Why it halted, in the facility's own words. */
  heldReason?: string;
  lifecycle: readonly string[];
  gateState?: string;

  summary: string;
  attributes: A;

  from: string;
  to: string;
  expectedDurationSeconds: number;
  deferrable?: boolean;

  operationId?: string;
  workflowId?: string;
  dispatchedAt?: IsoDateString;
  gateAuthorisedAt?: IsoDateString;
  gateAuthorisedBy?: GateAuthorisation;
  completedAt?: IsoDateString;
}

/** What the facility itself is — a berth, a fleet, a district. */
export interface FacilityDescriptor {
  industry: string;
  id: string;
  name: string;
  context: string;
  throughputLabel: string;
  throughputTarget: number;
  columns: readonly string[];
}

/** Container-terminal attributes. Mirrors the adapter's ContainerAttributes. */
export interface ContainerAttributes {
  containerId: string;
  grossWeightKg: number;
  imdgClass?: string;
  reefer?: boolean;
  overWalkway: boolean;
  twinLift?: boolean;
}

/** Drone-operations attributes. Mirrors the adapter's FlightAttributes. */
export interface FlightAttributes {
  registration: string;
  missionType: string;
  payloadKg: number;
  overPopulated: boolean;
  bvlos: boolean;
}

export type ContainerMoveJob = FacilityJob<ContainerAttributes>;
export type FlightJob = FacilityJob<FlightAttributes>;

/**
 * True while the job is under way and may be holding paid connectivity.
 *
 * Derived from the job's own lifecycle rather than a name pattern, so a new
 * industry does not have to call its final state anything in particular.
 */
export function isJobInFlight(job: Pick<FacilityJob, 'state' | 'lifecycle'>): boolean {
  const finished = job.lifecycle[job.lifecycle.length - 1];
  return job.state !== JOB_QUEUED && job.state !== JOB_ABORTED && job.state !== finished;
}

/** True while the job is halted with its load committed. */
export function isJobHeld(job: Pick<FacilityJob, 'state'>): boolean {
  return job.state === JOB_HELD;
}

/**
 * True once the load is committed and the job can no longer simply be dropped.
 *
 * Mirrors the server's own check, and reads the gate's *position* rather than
 * its name so it holds in every industry: a crane's twistlock and a drone's
 * pre-flight are both the last instant before commitment, and anything past
 * either has a load in the air.
 *
 * This is what makes the difference between "Abort" and "Stop" on a row. Before
 * the gate, cancelling is free and connectivity goes back. After it, cancelling
 * is an emergency and the feed is the thing keeping it safe.
 */
export function isLoadCommitted(
  job: Pick<FacilityJob, 'state' | 'lifecycle' | 'gateState'>,
): boolean {
  if (job.state === JOB_HELD) return true;
  if (job.gateState === undefined) return false;

  const gate = job.lifecycle.indexOf(job.gateState);
  const current = job.lifecycle.indexOf(job.state);
  return gate >= 0 && current > gate;
}
