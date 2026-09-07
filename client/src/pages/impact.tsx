import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Section, Slot } from '@/components/primitives';
import { useMetrics } from '@/hooks/use-metrics';
import { percent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A quay crane runs 25–40 moves per hour, so roughly 90 seconds is one move.
 * Used to express protected operations in the unit a terminal actually
 * measures itself in.
 */
const SECONDS_PER_MOVE = 90;

/** Conservative default for a stopped ship-to-shore crane. Theirs to change. */
const DEFAULT_COST_PER_HOUR = 50_000;

/**
 * What the decisions were worth.
 *
 * The centrepiece is an input, not a claim. Rather than asserting a saving, the
 * page takes the viewer's own cost of a stopped crane and does the arithmetic
 * with it — so the number on screen is their assumption, which is not something
 * they can argue with us about.
 */
export function Impact() {
  const metrics = useMetrics();
  const [costPerHour, setCostPerHour] = useState(DEFAULT_COST_PER_HOUR);

  const data = metrics.data;
  // `premiumGranted` is reported directly. The protected count cannot be
  // recovered from `criticalOperationsProtectedPct` — at 100% the ratio is
  // satisfied by any numerator, so inverting it would invent a number.
  const protectedCount = data?.premiumGranted ?? 0;

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Impact' }]}
        title="Impact"
        description="Computed from the decision log itself, not tracked in counters — reset the database, replay the scenarios, get the same figures."
        meta={
          data ? (
            <>
              <Slot ch={3}>{data.totalDecisions}</Slot> decisions
            </>
          ) : null
        }
      />

      <Section title="Protection" meta="of operations that were genuinely at risk" ruled>
        <dl className="flex flex-col">
          <Figure
            label="Critical operations protected"
            value={percent(data?.criticalOperationsProtectedPct)}
            note="Denominator counts only operations where the network was actually congested. A critical operation on a healthy network needed nothing."
            emphasis
          />
          <Figure
            label="Critical and unprotected"
            value={String(data?.criticalUnprotected ?? '—')}
            note="The real miss: business-critical, at risk, and left on standard connectivity."
            alarming={(data?.criticalUnprotected ?? 0) > 0}
          />
          <Figure
            label="Critical, network healthy"
            value={String(data?.criticalNotAtRisk ?? '—')}
            note="Correctly withheld. Reads as a miss until you notice congestion was Low — spending here would have been the error."
          />
          <Figure
            label="Unnecessary allocation avoided"
            value={String(data?.unnecessaryQodAvoided ?? '—')}
            note="Routine work left alone despite congestion."
          />
          <div className="border-t" />
        </dl>
      </Section>

      <Section title="In your terms" meta="your assumption, not our claim" className="mt-12">
        <div className="log-row py-4">
          <Eyebrow className="pt-2">cost input</Eyebrow>

          <div className="flex flex-col gap-4">
            <label className="flex flex-wrap items-baseline gap-3 text-[15px]">
              <span>A stopped crane costs us</span>
              <span className="inline-flex items-baseline gap-1">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={costPerHour}
                  onChange={(event) => setCostPerHour(Number(event.target.value) || 0)}
                  className="datum w-[12ch] border-b bg-transparent pb-0.5 text-[15px] focus:border-b-primary focus:outline-none"
                />
              </span>
              <span>per hour.</span>
            </label>

            <div className="flex flex-col gap-1">
              <div className="datum text-[44px] leading-none font-medium text-primary">
                {formatMoney(exposureFor(protectedCount, costPerHour))}
              </div>
              <p className="max-w-[60ch] text-xs text-muted-foreground">
                exposure across <Slot ch={2}>{protectedCount}</Slot> protected operation
                {protectedCount === 1 ? '' : 's'}, valued at roughly {SECONDS_PER_MOVE}s per
                move at the rate above.
              </p>
            </div>

            {/*
             * The caveat is set quietly and never removed. The honest claim is
             * about exposure, not accidents: we know these operations ran at
             * risk and were protected, and we do not know what would have
             * happened otherwise.
             */}
            <p className="max-w-[68ch] border-l pl-4 text-xs text-muted-foreground">
              This counts operations protected while genuinely at risk — not accidents prevented,
              and not downtime measured. The multiplier is yours; the operation count is the
              system's own record.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Distribution" meta="decided operations" className="mt-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Breakdown title="By action" counts={data?.byAction} />
          <Breakdown title="By criticality" counts={data?.byCriticality} />
        </div>
      </Section>
    </>
  );
}

function Figure({
  label,
  value,
  note,
  emphasis,
  alarming,
}: {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
  alarming?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,24rem)_8rem_minmax(0,1fr)] items-baseline gap-x-6 border-t py-3">
      <dt className="text-[15px]">{label}</dt>
      <dd
        className={cn(
          'datum m-0 text-right font-medium',
          emphasis ? 'text-2xl text-primary' : 'text-[15px]',
          alarming && 'text-destructive',
        )}
      >
        {value}
      </dd>
      <dd className="m-0 max-w-[52ch] text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/**
 * A ruled bar, not a pie.
 *
 * A pie chart of four values proves nothing and cannot be read precisely. A
 * ruled bar with the figure printed beside it can be.
 */
function Breakdown({ title, counts }: { title: string; counts?: Record<string, number> }) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{title}</Eyebrow>
      {entries.length === 0 ? (
        <p className="border-t py-2 text-muted-foreground">No decisions yet.</p>
      ) : (
        entries.map(([key, count]) => (
          <div key={key} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem] items-center gap-x-4 border-t py-2">
            <span className="datum text-[13px]">{key}</span>
            <span className="h-0.5 bg-border">
              <span className="block h-0.5 bg-foreground" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="datum text-right text-[13px]">{count}</span>
          </div>
        ))
      )}
      <div className="border-t" />
    </div>
  );
}

function exposureFor(operations: number, costPerHour: number): number {
  return (operations * SECONDS_PER_MOVE * costPerHour) / 3600;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
