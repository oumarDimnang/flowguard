/**
 * Container-terminal vocabulary.
 *
 * The attribute bag a FacilityJob carries for this industry, and the only part
 * of the facility contract that knows what a twistlock is.
 */

/** The crane's physical sequence, in order. TIC4.0-aligned naming. */
export const MOVE_LIFECYCLE = [
  'GANTRY',
  'TROLLEY',
  'SPREADER',
  'TWISTLOCK',
  'HOISTING',
  'LANDING',
  'RELEASED',
] as const;

/**
 * Where the job pauses.
 *
 * A real PLC withholds hoist authorisation until all four twistlock sensors
 * confirm a secure lock, which makes it the last moment before the load
 * becomes suspended — and therefore the last moment the move can wait.
 */
export const MOVE_GATE = 'TWISTLOCK';

/**
 * What the TOS knows about the box being moved.
 *
 * A type alias rather than an interface: it has to be assignable to the
 * `Record<string, unknown>` attribute bag on FacilityJob, and TypeScript gives
 * interfaces no implicit index signature.
 */
export type ContainerAttributes = {
  /** ISO 6346 equipment identifier, e.g. MSCU4823157. */
  containerId: string;
  grossWeightKg: number;
  /** IMDG dangerous-goods class, e.g. '3'. Absent means not hazardous. */
  imdgClass?: string;
  reefer?: boolean;
  overWalkway: boolean;
  twinLift?: boolean;
};

/** A planned move, as it sits in the berth plan before dispatch. */
export interface MoveDefinition {
  id: string;
  craneId: string;
  devicePhoneNumber?: string;
  container: ContainerAttributes;
  fromLocation: string;
  toLocation: string;
  expectedDurationSeconds: number;
  summary: string;
  deferrable?: boolean;
  /** Where this job claims to be. See FacilityJob.siteFix. */
  siteFix?: { latitude: number; longitude: number; radiusMeters: number };
}
