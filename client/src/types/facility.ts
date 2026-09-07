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
