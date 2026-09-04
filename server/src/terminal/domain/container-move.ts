/**
 * The physical container-move sequence, as a state machine.
 *
 * These states mirror what actually happens on a ship-to-shore or yard crane,
 * in order, and the naming follows TIC4.0 vocabulary — the terminal industry's
 * own semantic standard for equipment data, which aligns to ISA-95 functional
 * levels. This is TIC4.0-*aligned* naming, not a claim of schema compliance:
 * the field-level definitions sit behind the committee's member documentation.
 *
 * Deliberately NOT in common/domain/enums.ts. That file is the cross-language
 * contract mirrored in agent/src/flowguard_agent/shared/models.py; move state
 * never reaches the worker. The terminal is a facility system, and FlowGuard
 * learns about it only through business events.
 */
export enum MoveState {
  /** In the work queue. No job instruction issued — FlowGuard knows nothing. */
  QUEUED = 'QUEUED',
  /** Job instruction issued. Gantry aligning to the vessel bay. */
  GANTRY = 'GANTRY',
  /** Trolley positioning over the target container. */
  TROLLEY = 'TROLLEY',
  /** Spreader descending onto the container's corner castings. */
  SPREADER = 'SPREADER',
  /**
   * Twistlocks engaging.
   *
   * The PLC withholds hoist authorisation until all four corner sensors
   * confirm a secure lock. This is a real interlock on a real crane, and it is
   * the last moment before the load becomes suspended — which makes it the
   * natural place to wait for a connectivity decision.
   */
  TWISTLOCK = 'TWISTLOCK',
  /** Load suspended and travelling. Nothing can be safely paused from here. */
  HOISTING = 'HOISTING',
  /** Placing onto the AGV, chassis or yard stack. */
  LANDING = 'LANDING',
  /** Twistlocks released, move complete. */
  RELEASED = 'RELEASED',
  /** Cancelled before completion. */
  ABORTED = 'ABORTED',
}

/**
 * Why the crane was allowed to hoist.
 *
 * TIMEOUT is not a failure path, it is the safety property: FlowGuard is
 * advisory to the interlock, never a precondition of it. If the agent, the
 * worker or the whole network optimiser is down, the crane still lifts. A
 * connectivity optimiser that can stop a terminal is a worse problem than the
 * one it solves.
 */
export enum HoistAuthorisation {
  /** A FlowGuard decision was recorded before the hold expired. */
  DECISION = 'DECISION',
  /** The hold expired. The move proceeds unprotected, and that is logged. */
  TIMEOUT = 'TIMEOUT',
}

/** What the TOS knows about the box being moved. */
export interface ContainerAttributes {
  /** ISO 6346 equipment identifier, e.g. MSCU4823157. */
  containerId: string;
  grossWeightKg: number;
  /** IMDG dangerous-goods class, e.g. '3' for flammable liquids. Absent = not hazardous. */
  imdgClass?: string;
  /** Refrigerated unit — carries its own monitoring traffic. */
  reefer?: boolean;
  /** Path crosses an active pedestrian walkway. */
  overWalkway: boolean;
  /** Two containers on one spreader. */
  twinLift?: boolean;
}

/** A planned move, as it sits in the work queue before dispatch. */
export interface MoveDefinition {
  /** Stable identifier within the berth plan. */
  id: string;
  craneId: string;
  /** E.164 identity of the crane's SIM on the Nokia sandbox. */
  devicePhoneNumber?: string;
  container: ContainerAttributes;
  /** Vessel stowage position, e.g. 'BAY 22 ROW 04 TIER 82'. */
  fromLocation: string;
  /** Yard position or transport unit, e.g. 'YARD A-12-3'. */
  toLocation: string;
  /** Drives the conservative QoD duration that doubles as the TTL backstop (D8). */
  expectedDurationSeconds: number;
  /**
   * Operational summary. This is the text the classifier reasons over, so it
   * should read the way a terminal would describe the job — not the way a
   * prompt engineer would.
   */
  summary: string;
  /** True for work that can simply be repeated later. Consumed by the offline classifier. */
  deferrable?: boolean;
}

/** A move plus its live execution state. */
export interface ContainerMove extends MoveDefinition {
  state: MoveState;
  /** Business event / workflow correlation id. Fresh on every dispatch. */
  operationId?: string;
  workflowId?: string;
  dispatchedAt?: Date;
  hoistAuthorisedAt?: Date;
  hoistAuthorisedBy?: HoistAuthorisation;
  completedAt?: Date;
}
