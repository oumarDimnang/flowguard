import { Injectable } from '@nestjs/common';

import { NetworkAction } from '../common/domain/enums';
import { DecisionLogService } from '../decision-log/decision-log.service';

export interface ImpactMetrics {
  /** Decisions considered (workflow steps of type DECIDED). */
  totalDecisions: number;
  /** Operations that received QoD or QoD + Slice. */
  premiumGranted: number;

  /**
   * Percent reduction in premium allocation versus always-on provisioning.
   *
   * The always-on baseline is "every operation gets premium connectivity", so
   * the reduction is simply the share of operations left on standard
   * connectivity. This is the headline 42% figure.
   */
  premiumReductionPct: number;

  /**
   * Percent of **at-risk** HIGH-criticality operations that received enhanced
   * connectivity.
   *
   * The denominator counts only operations where the network was actually
   * congested. A critical operation on a healthy network needed nothing, and
   * including it would score correct restraint as a protection failure.
   */
  criticalOperationsProtectedPct: number;

  /** At-risk HIGH-criticality operations that received nothing — the real miss. */
  criticalUnprotected: number;

  /** Critical operations correctly withheld because the network was healthy. */
  criticalNotAtRisk: number;

  /** LOW-criticality operations correctly left on standard connectivity. */
  unnecessaryQodAvoided: number;

  byAction: Record<string, number>;
  byCriticality: Record<string, number>;
}

/**
 * Derives the submission's impact metrics from the decision log.
 *
 * Computed from recorded decisions rather than tracked in counters, so the
 * numbers are reproducible: reset the database, replay the scenario set, get
 * the same figures. That reproducibility is the point — the percentages are
 * claims that need to survive being checked.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly decisionLog: DecisionLogService) {}

  async impact(): Promise<ImpactMetrics> {
    const counts = await this.decisionLog.counts();

    const premiumGranted =
      (counts.byAction[NetworkAction.QOD] ?? 0) +
      (counts.byAction[NetworkAction.QOD_AND_SLICE] ?? 0);

    const totalDecisions = Object.values(counts.byAction).reduce((sum, n) => sum + n, 0);

    // Only at-risk operations belong in the protection ratio.
    const criticalAtRisk = counts.criticalProtected + counts.criticalUnprotected;

    return {
      totalDecisions,
      premiumGranted,
      premiumReductionPct: percent(totalDecisions - premiumGranted, totalDecisions),
      criticalOperationsProtectedPct: percent(counts.criticalProtected, criticalAtRisk),
      criticalUnprotected: counts.criticalUnprotected,
      criticalNotAtRisk: counts.criticalNotAtRisk,
      unnecessaryQodAvoided: counts.unnecessaryQodAvoided,
      byAction: counts.byAction,
      byCriticality: counts.byCriticality,
    };
  }
}

/** Zero denominator yields 0 rather than NaN, so a fresh database renders cleanly. */
function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
