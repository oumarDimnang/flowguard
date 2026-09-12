/** Mirrored from server/src/metrics/metrics.service.ts. */

export interface ImpactMetrics {
  /** Operations decided — one each, by its first DECIDED record. */
  totalDecisions: number;
  /** Operations that received QoD or QoD + Slice. */
  premiumGranted: number;

  /**
   * Percent reduction in premium allocation versus always-on provisioning.
   *
   * Baseline is "every operation gets premium connectivity", so this is just
   * the share left on standard. Be careful how this is labelled: against a
   * private network the buyer pays no per-session fee, and a saving claim there
   * invites an argument you will lose.
   */
  premiumReductionPct: number;

  /**
   * Percent of **at-risk** HIGH-criticality operations that received enhanced
   * connectivity.
   *
   * The denominator counts only operations where the network was actually
   * congested — a critical operation on a healthy network needed nothing, and
   * counting it would score correct restraint as a failure.
   */
  criticalOperationsProtectedPct: number;

  /** At-risk HIGH-criticality operations that received enhanced connectivity. */
  criticalProtected: number;

  /** At-risk HIGH-criticality operations that received nothing — the real miss. */
  criticalUnprotected: number;

  /** Critical operations correctly withheld because the network was healthy. */
  criticalNotAtRisk: number;

  /** LOW-criticality operations correctly left on standard connectivity. */
  unnecessaryQodAvoided: number;

  /** Keyed by NetworkAction; absent actions are omitted rather than zeroed. */
  byAction: Record<string, number>;
  /** Keyed by Criticality; same. */
  byCriticality: Record<string, number>;
}

/** Mirrored from the HealthReport interface in server/src/health/health.controller.ts. */
export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    mongo: { up: boolean; state: string };
    temporal: { up: boolean };
    realtime: { up: boolean; connectedClients: number };
  };
}
