import type { AssetType } from '../../common/domain/enums';
import type { Industry } from '../../common/domain/tenancy';

/**
 * Why a job was allowed past its gate.
 *
 * TIMEOUT is not a failure path, it is the safety property: FlowGuard is
 * advisory to the interlock, never a precondition of it. A crane that lifts
 * without a decision, or a drone that launches without one, is a correct
 * outcome — a connectivity optimiser that can stop a facility is a worse
 * problem than the one it solves.
 */
export enum GateAuthorisation {
  DECISION = 'DECISION',
  TIMEOUT = 'TIMEOUT',
}

/** Before dispatch. Every industry starts here. */
export const JOB_QUEUED = 'QUEUED';
/** Cancelled before completion. Reachable from any in-flight state. */
export const JOB_ABORTED = 'ABORTED';

/**
 * One job in a facility's work queue, whatever the facility is.
 *
 * The generic part of the contract. `lifecycle` and `gateState` are supplied by
 * the industry's adapter, so the client can render progress and the gate
 * without knowing what a twistlock is — while `attributes` stays open, because
 * a container and a flight plan have nothing in common worth flattening.
 *
 * Deliberately *not* generic enough to render blandly. The port is shared; the
 * panels are per-industry, and the sequence strip works precisely because it
 * names eight real physical stations rather than "step 4 of 8".
 */
export interface FacilityJob<A = unknown> {
  id: string;
  /** The asset performing it — a crane, an aircraft, a vehicle. */
  assetId: string;
  /** E.164 identity of the asset's SIM. */
  devicePhoneNumber?: string;

  /** Current state. A member of `lifecycle`, or QUEUED / ABORTED. */
  state: string;
  /** The ordered states for this industry, oldest first. */
  lifecycle: readonly string[];
  /** Where the job pauses for a decision. Undefined means it never pauses. */
  gateState?: string;

  /** What the model reasons over. Reads the way the industry would say it. */
  summary: string;
  /** Industry-specific detail, narrowed by that industry's panel. */
  attributes: A;

  from: string;
  to: string;

  /**
   * Where the job claims to be, if the facility knows.
   *
   * Shared rather than per-industry, because the check it unlocks is the same
   * in both: ask the network whether the asset is actually at the site the job
   * names. A crane that says it is on Berth 3 and a drone that says it is at
   * Riser 7 are the same claim, and one CAMARA read settles either.
   *
   * Optional on purpose — a job with no coordinates is simply one the agent
   * cannot verify, which is the honest default rather than a fabricated fix.
   */
  siteFix?: { latitude: number; longitude: number; radiusMeters: number };
  /** Drives the conservative QoD duration that doubles as the TTL backstop. */
  expectedDurationSeconds: number;
  /** True for work that can simply be repeated later. */
  deferrable?: boolean;

  operationId?: string;
  workflowId?: string;
  dispatchedAt?: Date;
  gateAuthorisedAt?: Date;
  gateAuthorisedBy?: GateAuthorisation;
  completedAt?: Date;
}

/** What the facility itself is — a berth, a fleet, a district. */
export interface FacilityDescriptor {
  industry: Industry;
  /** e.g. 'berth-3', 'fleet-north'. */
  id: string;
  name: string;
  /** One line of context: the vessel alongside, the survey area. */
  context: string;
  /** What the job column is called here: 'moves/hour', 'sorties/day'. */
  throughputLabel: string;
  throughputTarget: number;
  /** Labels for the work-queue columns, in order. */
  columns: readonly string[];
}

/** The asset kind and operation naming an industry files its events under. */
export interface JobEventShape {
  assetType: AssetType;
  operation: string;
  site: string;
  metadata: Record<string, unknown>;
}

/**
 * True while the job is under way and may be holding paid connectivity.
 *
 * Derived from the job's own lifecycle rather than from a name pattern: the
 * terminal state is simply the last one the industry declared, so a new
 * industry does not have to name its final state anything in particular.
 */
export function isJobInFlight(job: Pick<FacilityJob, 'state' | 'lifecycle'>): boolean {
  const finished = job.lifecycle[job.lifecycle.length - 1];
  return job.state !== JOB_QUEUED && job.state !== JOB_ABORTED && job.state !== finished;
}
