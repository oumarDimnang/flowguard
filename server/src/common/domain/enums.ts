/**
 * Shared vocabulary. These values cross the wire to the Python worker and the
 * React dashboard, so they are part of the system's public contract — changing
 * a string here is a breaking change in three places.
 */

/** Business criticality of an operation, as classified by the LLM. */
export enum Criticality {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * Network congestion in the device's area.
 *
 * Values match Nokia's Congestion Insights enum EXACTLY, including the
 * capitalisation ('Low' | 'Medium' | 'High'). Do not normalise these to
 * upper case — they are compared against values returned by the CAMARA API.
 */
export enum CongestionLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

/** The three outcomes the decision policy can produce (D1). */
export enum NetworkAction {
  NONE = 'NONE',
  QOD = 'QOD',
  QOD_AND_SLICE = 'QOD_AND_SLICE',
}

/** Lifecycle of a single critical operation. */
export enum OperationStatus {
  PENDING = 'PENDING',
  ASSESSING = 'ASSESSING',
  ALLOCATED = 'ALLOCATED',
  MONITORING = 'MONITORING',
  RELEASING = 'RELEASING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** Facility asset types the simulator can emit events for. */
export enum AssetType {
  CRANE = 'CRANE',
  DRONE = 'DRONE',
  CAMERA = 'CAMERA',
  VEHICLE = 'VEHICLE',
  AMBULANCE = 'AMBULANCE',
}

/**
 * CAMARA Quality on Demand session status.
 * A session starts REQUESTED and transitions asynchronously (D8) — the
 * dashboard renders that transition, so it must be modelled explicitly.
 */
export enum QosStatus {
  REQUESTED = 'REQUESTED',
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

/** CAMARA statusInfo, present when qosStatus is UNAVAILABLE. */
export enum QosStatusInfo {
  DURATION_EXPIRED = 'DURATION_EXPIRED',
  NETWORK_TERMINATED = 'NETWORK_TERMINATED',
  DELETE_REQUESTED = 'DELETE_REQUESTED',
}
