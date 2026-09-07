/**
 * Drone-operations vocabulary.
 *
 * The second industry, and the reason the facility port exists. Nothing
 * downstream of the business event changes to support it — the policy, the
 * workflow, the CAMARA calls and the audit trail were already industry-
 * agnostic; only the physical job and its gate are new.
 */

/** The flight sequence, in order. */
export const FLIGHT_LIFECYCLE = [
  'PREFLIGHT',
  'TAKEOFF',
  'TRANSIT',
  'ON_STATION',
  'RETURN',
  'LANDED',
] as const;

/**
 * Where the flight pauses.
 *
 * The same argument as the crane's twistlock: pre-flight is the last moment
 * before the aircraft is committed to the air, so it is the last moment it can
 * wait for anything. And the same safety property — FlowGuard delays a launch
 * at most, and never prevents one.
 */
export const FLIGHT_GATE = 'PREFLIGHT';

/**
 * What the flight-ops system knows about the sortie.
 *
 * A type alias, not an interface — see ContainerAttributes for why.
 */
export type FlightAttributes = {
  /** Tail or registration, e.g. 'A7-GAS-114'. */
  registration: string;
  /** What the flight is for, in the operator's own words. */
  missionType: string;
  payloadKg: number;
  /** Crosses inhabited ground — the drone equivalent of over-walkway. */
  overPopulated: boolean;
  /** Beyond visual line of sight: no observer, so the link is the only link. */
  bvlos: boolean;
};

export interface FlightDefinition {
  id: string;
  droneId: string;
  devicePhoneNumber?: string;
  flight: FlightAttributes;
  fromLocation: string;
  toLocation: string;
  expectedDurationSeconds: number;
  summary: string;
  deferrable?: boolean;
  /** Where this job claims to be. See FacilityJob.siteFix. */
  siteFix?: { latitude: number; longitude: number; radiusMeters: number };
}
