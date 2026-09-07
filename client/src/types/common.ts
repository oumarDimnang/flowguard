/**
 * Shared vocabulary, mirrored from server/src/common/domain/enums.ts.
 *
 * There is no compile-time link between the two files. A value renamed on the
 * server surfaces here as a badge that silently stops matching, not as a build
 * error — so treat this file as a contract and change it in lockstep.
 *
 * Declared as const objects rather than TypeScript enums: these values arrive
 * as plain JSON strings, and a const object keeps the runtime representation
 * identical to what comes over the wire.
 */

/** Business criticality of an operation, as classified by the model. */
export const Criticality = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type Criticality = (typeof Criticality)[keyof typeof Criticality];

/**
 * Network congestion in the device's area.
 *
 * Values match Nokia's Congestion Insights enum exactly, capitalisation
 * included ('Low' | 'Medium' | 'High'). Do not upper-case these for display —
 * format at the render site instead.
 */
export const CongestionLevel = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
} as const;
export type CongestionLevel = (typeof CongestionLevel)[keyof typeof CongestionLevel];

/** The three outcomes the decision policy can produce. */
export const NetworkAction = {
  NONE: 'NONE',
  QOD: 'QOD',
  QOD_AND_SLICE: 'QOD_AND_SLICE',
} as const;
export type NetworkAction = (typeof NetworkAction)[keyof typeof NetworkAction];

/** Lifecycle of a single critical operation. */
export const OperationStatus = {
  PENDING: 'PENDING',
  ASSESSING: 'ASSESSING',
  ALLOCATED: 'ALLOCATED',
  MONITORING: 'MONITORING',
  RELEASING: 'RELEASING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type OperationStatus = (typeof OperationStatus)[keyof typeof OperationStatus];

export const AssetType = {
  CRANE: 'CRANE',
  DRONE: 'DRONE',
  CAMERA: 'CAMERA',
  VEHICLE: 'VEHICLE',
  AMBULANCE: 'AMBULANCE',
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/**
 * CAMARA Quality on Demand session status.
 *
 * A session starts REQUESTED and transitions asynchronously — rendering that
 * transition is the point, so it must be modelled rather than collapsed into a
 * boolean.
 */
export const QosStatus = {
  REQUESTED: 'REQUESTED',
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type QosStatus = (typeof QosStatus)[keyof typeof QosStatus];

/** CAMARA statusInfo, present when qosStatus is UNAVAILABLE. */
export const QosStatusInfo = {
  DURATION_EXPIRED: 'DURATION_EXPIRED',
  NETWORK_TERMINATED: 'NETWORK_TERMINATED',
  DELETE_REQUESTED: 'DELETE_REQUESTED',
} as const;
export type QosStatusInfo = (typeof QosStatusInfo)[keyof typeof QosStatusInfo];

/** How a physical asset is addressed on the mobile network. */
export interface DeviceRef {
  /** Facility-local asset identifier, e.g. 'crane-a'. */
  id: string;
  phoneNumber?: string;
  ipv4Address?: string;
  ipv6Address?: string;
}

/** Mirrors Paginated<T> from server/src/common/dto/pagination.dto.ts. */
export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * A type alias, not an interface, so it satisfies the query-string
 * `Record<string, ...>` in api/client.ts. Interfaces get no implicit index
 * signature; type aliases do.
 */
export type PaginationQuery = {
  skip?: number;
  /** Server caps this at 200. */
  limit?: number;
};

/**
 * An ISO-8601 timestamp.
 *
 * The server's domain types use `Date`, but JSON serialisation turns every one
 * of them into a string before it reaches here. Typing these as `Date` would
 * compile and then fail at runtime on the first `.getTime()`, so the alias
 * exists to make the boundary impossible to forget.
 */
export type IsoDateString = string;
