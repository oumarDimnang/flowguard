import { useMemo } from 'react';

import { useAuth } from '@/auth/auth-context';
import { buildAnalysis } from '@/features/analysis/analysis-model';
import { congestionByDevice, median, share } from '@/features/dashboard/dashboard-model';
import {
  CongestionByDevice,
  DecisionLatency,
  DecisionMatrix,
  GATE_SECONDS,
  HeldNow,
  Kpis,
  Outcomes,
  RecentOperations,
  RulesFired,
  SessionsHeld,
  type KpiProps,
} from '@/features/dashboard/dashboard-panels';
import { useDecisionFeed } from '@/hooks/use-decision-feed';
import { useMetrics } from '@/hooks/use-metrics';
import { useActiveOperations, useHoldings } from '@/hooks/use-operations';
import { useOperationsHistory } from '@/hooks/use-operations-history';
import { industryLabel } from '@/types';

/**
 * Records the charts are drawn from. The all-time figures come from the
 * server; the patterns come from this many of the latest decision records,
 * kept live as new ones arrive.
 */
const WINDOW = 200;

const RECENT = 6;

/** The landing page: every figure the product keeps, on one screen. */
export function Dashboard() {
  const { identity } = useAuth();
  const metrics = useMetrics();
  const active = useActiveOperations();
  const holdings = useHoldings(active.operations);
  const history = useOperationsHistory('all');
  const log = useDecisionFeed(WINDOW);

  const model = useMemo(() => buildAnalysis(log.records), [log.records]);
  const congestion = useMemo(() => congestionByDevice(history.operations), [history.operations]);

  const m = metrics.data;
  const typical = median(model.latencies);
  const slowest = model.latencies[model.latencies.length - 1];
  const logLoading = log.loading && log.records.length === 0;

  const kpis: KpiProps[] = [
    {
      label: 'held now',
      value: holdings.count,
      sub: `${holdings.sliceCount} with slice`,
      tone: holdings.count > 0 ? 'accent' : undefined,
    },
    { label: 'decisions', value: m?.totalDecisions ?? '—', sub: 'operations' },
    {
      label: 'protected',
      value: m?.premiumGranted ?? '—',
      sub: m ? `${share(m.premiumGranted, m.totalDecisions)}% of total` : undefined,
    },
    {
      label: 'left on standard',
      value: m ? `${m.premiumReductionPct}%` : '—',
      sub: m ? `${m.totalDecisions - m.premiumGranted} operations` : undefined,
    },
    {
      label: 'critical protected',
      value: m ? `${m.criticalOperationsProtectedPct}%` : '—',
      sub: m ? `of ${m.criticalProtected + m.criticalUnprotected} at risk` : undefined,
      tone: 'accent',
    },
    {
      label: 'unprotected',
      value: m?.criticalUnprotected ?? '—',
      sub: 'critical, at risk',
      tone: (m?.criticalUnprotected ?? 0) > 0 ? 'alarm' : undefined,
    },
    {
      label: 'median decision',
      value: typical === undefined ? '—' : `${typical} s`,
      sub: slowest === undefined ? `gate ${GATE_SECONDS} s` : `max ${slowest} s · gate ${GATE_SECONDS} s`,
    },
  ];

  const organization = identity?.organization;

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-3">
        <h1>Dashboard</h1>
        {organization ? (
          <span className="datum text-xs text-muted-foreground">
            {organization.name} · {industryLabel(organization.industry)}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-4">
        <Kpis items={kpis} loading={metrics.loading && !m} />

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <SessionsHeld
            holds={model.holds}
            returnsToZero={model.returnsToZero}
            peak={model.peak}
            loading={logLoading}
          />
          <DecisionMatrix cells={model.matrix} loading={logLoading} />
          <DecisionLatency seconds={model.latencies} loading={logLoading} />
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-3">
          <RulesFired rules={model.rules} loading={logLoading} />
          <Outcomes metrics={m} loading={metrics.loading && !m} />
          <CongestionByDevice rows={congestion} loading={history.loading && !history.hasData} />
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <RecentOperations
            operations={history.operations.slice(0, RECENT)}
            total={history.total}
            loading={history.loading && !history.hasData}
          />
          <HeldNow operations={holdings.operations} loading={active.loading && active.operations.length === 0} />
        </div>
      </div>
    </>
  );
}
