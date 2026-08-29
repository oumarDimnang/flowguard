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
   * Percent of HIGH-criticality operations that received enhanced
   * connectivity. The headline 97% figure.
   */
  criticalOperationsProtectedPct: number;

  /** HIGH-criticality operations that did NOT get premium — the failure mode. */
  criticalUnprotected: number;

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

    const criticalTotal = counts.criticalProtected + counts.criticalUnprotected;

    return {
      totalDecisions,
      premiumGranted,
      premiumReductionPct: percent(totalDecisions - premiumGranted, totalDecisions),
      criticalOperationsProtectedPct: percent(counts.criticalProtected, criticalTotal),
      criticalUnprotected: counts.criticalUnprotected,
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
