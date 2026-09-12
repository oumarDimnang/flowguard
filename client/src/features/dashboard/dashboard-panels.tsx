import { Link } from 'react-router';

import { Eyebrow, Glyph, SkeletonBlock, SkeletonRows, Status } from '@/components/primitives';
import {
  CONGESTION_COLUMNS,
  CRITICALITY_ROWS,
  type HoldSample,
  type MatrixCell,
  type RuleCount,
} from '@/features/analysis/analysis-model';
import { outcomePhrase } from '@/features/operations/operation-summary';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  CongestionLevel,
  NetworkAction,
  QosStatus,
  type CongestionLevel as Congestion,
  type ImpactMetrics,
  type Operation,
} from '@/types';

/** The interlock's budget. facility-system.base.ts, GATE_TIMEOUT_MS. */
export const GATE_SECONDS = 30;

// ── Shell ────────────────────────────────────────────────────────────

/** A region, ruled rather than boxed: hairline above, title left, meta right. */
export function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-4 border-t pt-2.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {meta !== undefined ? <Eyebrow className="truncate">{meta}</Eyebrow> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-xs text-muted-foreground">{children}</p>;
}

// ── Headline figures ─────────────────────────────────────────────────

export interface KpiProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'accent' | 'alarm';
}

export function Kpis({ items, loading }: { items: readonly KpiProps[]; loading: boolean }) {
  return (
    <dl
      className="grid border-y py-3"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => (
        <div key={item.label} className={cn('flex min-w-0 flex-col gap-1.5', index > 0 && 'border-l pl-4')}>
          <dt className="eyebrow truncate">{item.label}</dt>
          <dd
            className={cn(
              'datum m-0 text-[22px] leading-none font-medium',
              item.tone === 'accent' && 'text-primary',
              item.tone === 'alarm' && 'text-destructive',
              loading && 'text-muted-foreground',
            )}
          >
            {loading ? '—' : item.value}
          </dd>
          <dd className="datum m-0 truncate text-[11px] text-muted-foreground">
            {loading ? '' : item.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Sessions held over time ──────────────────────────────────────────

/**
 * Operations holding premium connectivity at once, replayed from the log.
 *
 * Drawn in percentage space with a stretched SVG, so the step line fills the
 * panel at any width; the labels and markers are HTML, which a stretched SVG
 * would distort.
 */
export function SessionsHeld({
  holds,
  returnsToZero,
  peak,
  loading,
}: {
  holds: readonly HoldSample[];
  returnsToZero: number;
  peak: { held: number; at: number } | undefined;
  loading: boolean;
}) {
  const ceiling = Math.max(1, peak?.held ?? 1);
  const first = holds[0]?.at ?? 0;
  const span = Math.max(1, (holds[holds.length - 1]?.at ?? 0) - first);
  const x = (at: number) => ((at - first) / span) * 100;
  const y = (held: number) => 100 - (held / ceiling) * 100;

  // A step line: the count changes at an instant and holds until the next
  // event. Interpolating would draw sessions that never existed.
  const points = holds
    .flatMap((sample, index) => {
      const previous = holds[index - 1];
      const step = previous ? [`${x(sample.at)},${y(previous.held)}`] : [];
      return [...step, `${x(sample.at)},${y(sample.held)}`];
    })
    .join(' ');

  return (
    <Panel title="Sessions held" meta={holds.length > 0 ? `peak ${peak?.held ?? 0}` : undefined}>
      {loading ? (
        <SkeletonBlock height={104} />
      ) : holds.length === 0 ? (
        <Empty>No allocations in this window.</Empty>
      ) : (
        <>
          <div className="relative ml-5 h-[84px] border-b border-b-foreground">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-label={`Peak ${peak?.held ?? 0}, back to zero ${returnsToZero} times.`}
              role="img"
            >
              <line
                x1="0"
                y1="0"
                x2="100"
                y2="0"
                stroke="var(--border)"
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1.5"
                points={points}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {holds
              .filter((sample) => sample.held === 0)
              .map((sample) => (
                <i
                  key={sample.at}
                  aria-hidden="true"
                  className="absolute -bottom-[3px] block size-[5px] -translate-x-1/2 bg-foreground"
                  style={{ left: `${x(sample.at)}%` }}
                />
              ))}

            <span className="datum absolute top-0 -left-5 -translate-y-1/2 text-[10px] text-muted-foreground">
              {ceiling}
            </span>
            <span className="datum absolute bottom-0 -left-5 translate-y-1/2 text-[10px]">0</span>
          </div>

          <div className="datum flex justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{returnsToZero} returns to zero</span>
            {peak ? <span>peak at {clock(new Date(peak.at).toISOString())}</span> : null}
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Criticality × congestion ─────────────────────────────────────────

const MATRIX_GRID = 'grid grid-cols-[3.25rem_repeat(3,minmax(0,1fr))] gap-x-1.5';

export function DecisionMatrix({ cells, loading }: { cells: readonly MatrixCell[]; loading: boolean }) {
  return (
    <Panel title="Decision matrix" meta="criticality × congestion">
      {loading ? (
        <SkeletonRows rows={3} layoutClassName={MATRIX_GRID} columns={['3ch', '70%', '70%', '70%']} />
      ) : (
        <div>
          <div className={cn(MATRIX_GRID, 'eyebrow pb-1')}>
            <span />
            {CONGESTION_COLUMNS.map((level) => (
              <span key={level}>{level}</span>
            ))}
          </div>

          {CRITICALITY_ROWS.map((criticality) => (
            <div key={criticality} className={cn(MATRIX_GRID, 'items-center border-t py-2')}>
              <span className="datum text-[12px] font-medium">{criticality}</span>
              {CONGESTION_COLUMNS.map((congestion) => (
                <MatrixCellView
                  key={congestion}
                  cell={cells.find((c) => c.criticality === criticality && c.congestion === congestion)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MatrixCellView({ cell }: { cell: MatrixCell | undefined }) {
  const empty = !cell || cell.count === 0;
  const allocated = cell?.action !== undefined && cell.action !== NetworkAction.NONE;

  return (
    <span className="datum flex min-w-0 items-baseline gap-1.5 border-l pl-2 text-[11px]">
      <span className={cn('w-[2ch] shrink-0 text-[14px]', empty && 'text-muted-foreground')}>
        {cell?.count ?? 0}
      </span>
      {empty ? (
        <span className="truncate text-muted-foreground">—</span>
      ) : (
        <span
          className={cn('inline-flex min-w-0 items-center gap-1', allocated && 'text-primary')}
          title={cell.action}
        >
          <Glyph kind={allocated ? 'filled' : 'hollow'} />
          <span className="truncate">{shortAction(cell.action)}</span>
        </span>
      )}
    </span>
  );
}

/** `QOD_AND_SLICE` truncates to `QOD_AND_…` in a third of a column — the word that matters is SLICE. */
function shortAction(action: NetworkAction | string | undefined): string {
  return action === NetworkAction.QOD_AND_SLICE ? 'QOD+SLICE' : (action ?? '—');
}

// ── Decision latency ─────────────────────────────────────────────────

export function DecisionLatency({ seconds, loading }: { seconds: readonly number[]; loading: boolean }) {
  const slowest = Math.max(GATE_SECONDS, ...seconds);
  const overBudget = seconds.filter((value) => value >= GATE_SECONDS).length;
  const gate = (GATE_SECONDS / slowest) * 100;

  return (
    <Panel title="Decision latency" meta={`${GATE_SECONDS} s gate`}>
      {loading ? (
        <SkeletonBlock height={104} />
      ) : seconds.length === 0 ? (
        <Empty>No decisions in this window.</Empty>
      ) : (
        <>
          <div className="relative h-[84px] border-b border-b-foreground">
            {seconds.map((value, index) => (
              <span
                key={`${value}-${index}`}
                className="absolute bottom-0 block w-[3px] -translate-x-1/2 bg-primary"
                style={{ left: `${(value / slowest) * 100}%`, height: 14 + (index % 5) * 12 }}
                title={`${value} s`}
              />
            ))}
            <span
              className="absolute top-0 bottom-0 block border-l border-dashed border-l-foreground"
              style={{ left: `${gate}%` }}
            />
          </div>

          <div className="datum flex justify-between gap-3 text-[11px] text-muted-foreground">
            <span>
              0 s
            </span>
            <span className={overBudget > 0 ? 'text-destructive' : undefined}>
              {overBudget === 0 ? 'all inside the gate' : `${overBudget} past the gate`}
            </span>
            <span>{slowest} s</span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Rules ────────────────────────────────────────────────────────────

export function RulesFired({ rules, loading }: { rules: readonly RuleCount[]; loading: boolean }) {
  const most = Math.max(1, ...rules.map((rule) => rule.count));

  return (
    <Panel title="Rules fired" meta={`${rules.length} rules`}>
      {loading ? (
        <SkeletonRows
          rows={6}
          layoutClassName="grid grid-cols-[minmax(0,1fr)_4rem_2rem] gap-3"
          rowClassName="items-center border-t py-1.5"
          columns={['80%', '60%', { width: '2ch', end: true }]}
        />
      ) : (
        <div className="flex flex-col">
          {rules.map((rule) => (
            <Link
              key={rule.id}
              to={`/policy?rule=${rule.id}`}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_2rem] items-center gap-3 border-t py-[3px] hover:text-primary"
            >
              <span
                className={cn('datum truncate text-[10.5px]', rule.count === 0 && 'text-muted-foreground')}
                title={rule.id}
              >
                {rule.id}
              </span>
              <span className="flex h-1.5 items-center bg-border/40">
                {rule.count > 0 ? (
                  <span className="block h-1.5 bg-primary" style={{ width: `${(rule.count / most) * 100}%` }} />
                ) : null}
              </span>
              <span
                className={cn('datum text-right text-[11px]', rule.count === 0 && 'text-muted-foreground')}
              >
                {rule.disabled ? 'off' : rule.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Outcomes ─────────────────────────────────────────────────────────

const ACTION_ORDER = [NetworkAction.QOD_AND_SLICE, NetworkAction.QOD, NetworkAction.NONE] as const;

export function Outcomes({ metrics, loading }: { metrics: ImpactMetrics | undefined; loading: boolean }) {
  return (
    <Panel title="Outcomes" meta="all time">
      {loading || !metrics ? (
        <SkeletonRows
          rows={6}
          layoutClassName="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-3"
          rowClassName="items-center border-t py-1.5"
          columns={['60%', '50%', { width: '2ch', end: true }]}
        />
      ) : (
        <div className="flex flex-col">
          <Bars
            entries={ACTION_ORDER.map((action) => [shortAction(action), metrics.byAction[action] ?? 0])}
            accent={(label) => label !== NetworkAction.NONE}
          />
          <Figure label="routine, left alone" value={metrics.unnecessaryQodAvoided} />
          <Figure label="critical, network healthy" value={metrics.criticalNotAtRisk} />
          <Figure
            label="critical, at risk, unprotected"
            value={metrics.criticalUnprotected}
            alarm={metrics.criticalUnprotected > 0}
          />
          {(metrics.byCriticality.UNKNOWN ?? 0) > 0 ? (
            <Figure label="not assessed · device unreachable" value={metrics.byCriticality.UNKNOWN} />
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function Bars({
  entries,
  accent,
}: {
  entries: readonly (readonly [string, number])[];
  accent?: (label: string) => boolean;
}) {
  const max = Math.max(1, ...entries.map(([, count]) => count));

  return (
    <>
      {entries.map(([label, count]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-3 border-t py-1"
        >
          <span className="datum truncate text-[11px]">{label}</span>
          <span className="h-1.5 bg-border/40">
            <span
              className={cn('block h-1.5', accent?.(label) ? 'bg-primary' : 'bg-foreground')}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </span>
          <span className="datum text-right text-[11px]">{count}</span>
        </div>
      ))}
    </>
  );
}

function Figure({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-1 text-[11px]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className={cn('datum', alarm && 'font-medium text-destructive')}>{value}</span>
    </div>
  );
}

// ── Congestion by device ─────────────────────────────────────────────

export function CongestionByDevice({
  rows,
  loading,
}: {
  rows: readonly { deviceId: string; level: Congestion; at: string }[];
  loading: boolean;
}) {
  return (
    <Panel title="Congestion by device" meta="latest reading">
      {loading ? (
        <SkeletonRows
          rows={5}
          layoutClassName="flex justify-between"
          rowClassName="items-center border-t py-1.5"
          columns={['9ch', '6ch']}
        />
      ) : rows.length === 0 ? (
        <Empty>No readings yet.</Empty>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <Link
              key={row.deviceId}
              to={`/assets/${row.deviceId}`}
              className="datum grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-baseline gap-3 border-t py-1 text-[11px] hover:text-primary"
            >
              <span className="truncate">{row.deviceId}</span>
              <span className="text-right text-muted-foreground">{clock(row.at)}</span>
              <Status
                kind={row.level === CongestionLevel.HIGH ? 'filled' : 'hollow'}
                className={cn(
                  'justify-end',
                  row.level === CongestionLevel.HIGH && 'text-destructive',
                  row.level === CongestionLevel.LOW && 'text-muted-foreground',
                )}
              >
                {row.level}
              </Status>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Recent operations ────────────────────────────────────────────────

const RECENT_GRID = 'grid grid-cols-[4.25rem_minmax(0,1.6fr)_minmax(0,0.8fr)_5.75rem_minmax(0,1.3fr)] gap-x-3';

export function RecentOperations({
  operations,
  total,
  loading,
}: {
  operations: readonly Operation[];
  total: number;
  loading: boolean;
}) {
  return (
    <Panel
      title="Recent operations"
      meta={
        <Link to="/operations" className="hover:text-primary">
          {total} total · history
        </Link>
      }
    >
      <div className={cn(RECENT_GRID, 'eyebrow')}>
        <span>started</span>
        <span>operation</span>
        <span>device</span>
        <span>criticality</span>
        <span>outcome</span>
      </div>
      {loading ? (
        <SkeletonRows
          rows={6}
          layoutClassName={RECENT_GRID}
          rowClassName="items-center border-t py-1.5"
          columns={['7ch', '80%', '60%', '5ch', '70%']}
        />
      ) : operations.length === 0 ? (
        <Empty>No operations yet.</Empty>
      ) : (
        <div className="flex flex-col">
          {operations.map((operation) => {
            const allocated =
              operation.action !== undefined && operation.action !== NetworkAction.NONE;
            return (
              <Link
                key={operation.operationId}
                to={`/operations/${operation.operationId}`}
                className={cn(RECENT_GRID, 'items-baseline border-t py-1 text-[12px] hover:text-primary')}
              >
                <span className="datum text-[11px] text-muted-foreground">{clock(operation.startedAt)}</span>
                <span className="truncate">{operation.operationName}</span>
                <span className="datum truncate text-[11px]">{operation.deviceId}</span>
                <span className="datum text-[11px]">{operation.criticality ?? '—'}</span>
                <span className={cn('truncate text-[11px]', allocated ? 'text-primary' : 'text-muted-foreground')}>
                  {outcomePhrase(operation)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Held right now ───────────────────────────────────────────────────

const HELD_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_5.5rem] gap-x-3';

export function HeldNow({ operations, loading }: { operations: readonly Operation[]; loading: boolean }) {
  return (
    <Panel title="Held right now" meta={`${operations.length} session${operations.length === 1 ? '' : 's'}`}>
      <div className={cn(HELD_GRID, 'eyebrow')}>
        <span>device</span>
        <span>slice</span>
        <span className="text-right">QoD</span>
      </div>
      {loading ? (
        <SkeletonRows
          rows={2}
          layoutClassName={HELD_GRID}
          rowClassName="items-center border-t py-1.5"
          columns={['60%', '70%', { width: '8ch', end: true }]}
        />
      ) : operations.length === 0 ? (
        <p className="border-t py-2 text-xs text-muted-foreground">Nothing held.</p>
      ) : (
        <div className="flex flex-col">
          {operations.map((operation) => (
            <Link
              key={operation.operationId}
              to={`/operations/${operation.operationId}`}
              className={cn(HELD_GRID, 'datum items-baseline border-t py-1 text-[11px] hover:text-primary')}
            >
              <span className="truncate">{operation.deviceId}</span>
              <span className="truncate text-muted-foreground">{operation.sliceId ?? '—'}</span>
              <Status
                kind={operation.qosStatus === QosStatus.AVAILABLE ? 'filled' : 'hollow'}
                className="justify-end text-primary"
              >
                {operation.qosStatus ?? QosStatus.REQUESTED}
              </Status>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
