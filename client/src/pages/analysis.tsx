import { useMemo } from 'react';
import { Link } from 'react-router';

import { api } from '@/api/endpoints';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Loadable, SkeletonBlock, SkeletonRows, SkeletonText, Slot } from '@/components/primitives';
import {
  buildAnalysis,
  CONGESTION_COLUMNS,
  CRITICALITY_ROWS,
  type MatrixCell,
  type RuleCount,
} from '@/features/analysis/analysis-model';
import { useResource } from '@/hooks/use-resource';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NetworkAction } from '@/types';

/** The interlock's budget. Every latency is read against it. */
const GATE_SECONDS = 30;

/**
 * Pattern, rather than now or one operation.
 *
 * Control Room shows the current shift and a decision trail shows one lift.
 * Neither can answer "does this system behave consistently", which is the
 * question a second look always asks. This page exists for that, and its top
 * left corner is the whole product argument as a data object: the LOW row reads
 * NONE straight across, however congested the column.
 */
export function Analysis() {
  // One page of the log, aggregated in the browser. The server keeps no
  // rollups, and computing from the records is what makes the figures
  // reproducible rather than accumulated.
  const log = useResource((signal) => api.decisionLog.list({ limit: 200 }, signal), []);
  const records = log.data?.items;

  const model = useMemo(() => buildAnalysis(records ?? []), [records]);
  const loading = log.loading && !records;

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Analysis' }]}
        title="Analysis"
        description="Every decision the system has made, read as a pattern rather than one at a time."
        meta={
          <>
            <Slot ch={3}>{model.decisions}</Slot> decisions ·{' '}
            <Slot ch={2}>{model.protectedCount}</Slot> protected ·{' '}
            <Slot ch={4}>{model.reductionPct}</Slot>% left on standard connectivity
          </>
        }
      />

      <Loadable loading={loading} skeleton={<AnalysisSkeleton />}>
        <div className="grid grid-cols-1 gap-x-10 gap-y-7 xl:grid-cols-2">
          <Matrix cells={model.matrix} />
          <Holds
            holds={model.holds}
            returnsToZero={model.returnsToZero}
            peak={model.peak}
          />
          <Rules rules={model.rules} />
          <Latency seconds={model.latencies} />
        </div>
      </Loadable>
    </>
  );
}

/**
 * The four panels, at rest. Each placeholder takes the shape of the panel it
 * stands in for, so the page does not reflow when the figures arrive.
 */
function AnalysisSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-7 xl:grid-cols-2">
      <Panel title="Decision matrix" meta="criticality × congestion">
        <SkeletonRows rows={3} layoutClassName={MATRIX_GRID} columns={['3ch', '70%', '70%', '70%']} />
      </Panel>
      <Panel title="Sessions held" meta="loading">
        <SkeletonBlock height={128} />
      </Panel>
      <Panel title="Rules fired" meta="8 rules · first match wins">
        <SkeletonRows
          rows={8}
          layoutClassName="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_2.5rem] gap-3"
          rowClassName="items-center border-t py-2"
          columns={['80%', '40%', { width: '2ch', end: true }]}
        />
      </Panel>
      <Panel title="Decision latency" meta="loading">
        <SkeletonBlock height={76} />
        <SkeletonText ruled={false} lines={['60%']} />
      </Panel>
    </div>
  );
}

// ── The matrix ──────────────────────────────────────────────────────

/**
 * Narrow on purpose.
 *
 * At the 1280px breakpoint the two-column page halves this grid, and every
 * pixel spent on the row label is one the cell does not have — `QOD_AND_SLICE`
 * needs 79 of them and was clipping to `QOD + S…`, losing the only word that
 * says a slice was involved.
 */
const MATRIX_GRID = 'grid grid-cols-[3.25rem_repeat(3,minmax(0,1fr))] gap-x-1.5';

/**
 * Criticality down, congestion across.
 *
 * Read the bottom row: `NONE` in every column. Congestion rises left to right
 * and changes nothing, which is the claim the entire product rests on and the
 * one thing a judge should be able to check without being talked through it.
 */
function Matrix({ cells }: { cells: MatrixCell[] }) {
  return (
    <Panel title="Decision matrix" meta="criticality × congestion">
      <div className={cn(MATRIX_GRID, 'eyebrow pb-1')}>
        <span />
        {CONGESTION_COLUMNS.map((level) => (
          <span key={level}>{level}</span>
        ))}
      </div>

      {CRITICALITY_ROWS.map((criticality) => (
        <div key={criticality} className={cn(MATRIX_GRID, 'items-center border-t py-2.5')}>
          <span className="datum text-[13px] font-medium">{criticality}</span>

          {CONGESTION_COLUMNS.map((congestion) => {
            const cell = cells.find(
              (c) => c.criticality === criticality && c.congestion === congestion,
            );
            return <Cell key={congestion} cell={cell} />;
          })}
        </div>
      ))}

      <p className="border-t pt-2.5 text-xs text-muted-foreground">
        Congestion rises left to right and changes nothing along the bottom row. That is the
        product: criticality triggers action, congestion never does on its own.
      </p>
    </Panel>
  );
}

function Cell({ cell }: { cell: MatrixCell | undefined }) {
  const empty = !cell || cell.count === 0;
  const allocated = cell?.action && cell.action !== NetworkAction.NONE;

  return (
    <span className="datum flex min-w-0 items-baseline gap-1.5 border-l pl-2 text-xs">
      <span
        className={cn('w-[2ch] shrink-0 text-[15px]', empty && 'text-muted-foreground')}
      >
        {cell?.count ?? 0}
      </span>

      {empty ? (
        // Drawn rather than blanked: a combination that has not occurred is
        // information, and an absent cell reads as a rendering fault.
        <span className="truncate text-muted-foreground">not seen</span>
      ) : (
        <span
          className={cn('inline-flex min-w-0 items-center gap-1.5', allocated && 'text-primary')}
          title={cell.action}
        >
          <Glyph kind={allocated ? 'filled' : 'hollow'} />
          <span className="truncate">{shortAction(cell.action)}</span>
        </span>
      )}
    </span>
  );
}

/**
 * `QOD_AND_SLICE` in a third of a column.
 *
 * The enum is what the trail records and what the tooltip carries, but at this
 * width it truncates to `QOD_AND_...`, which loses the one word that says a
 * slice was involved. Shortened rather than clipped — a cell nobody can read
 * fails at the only job this grid has.
 */
function shortAction(action: NetworkAction | undefined): string {
  return action === NetworkAction.QOD_AND_SLICE ? 'QOD+SLICE' : (action ?? '—');
}

// ── Sessions held over time ─────────────────────────────────────────

/**
 * Concurrency, replayed from the log.
 *
 * The line has to touch zero between operations. A staircase would mean
 * capacity accumulating, which is exactly the failure the release guarantee
 * exists to prevent — so the returns are counted and labelled rather than left
 * for the reader to notice.
 */
function Holds({
  holds,
  returnsToZero,
  peak,
}: {
  holds: { at: number; held: number }[];
  returnsToZero: number;
  peak: { held: number; at: number } | undefined;
}) {
  const ceiling = Math.max(1, peak?.held ?? 1);
  const width = 600;
  const height = 128;
  const floor = height - 22;

  const first = holds[0]?.at ?? 0;
  const span = Math.max(1, (holds[holds.length - 1]?.at ?? 0) - first);

  const x = (at: number) => 26 + ((at - first) / span) * (width - 34);
  const y = (held: number) => floor - (held / ceiling) * (floor - 14);

  // A step line, not a smooth one: the count changes at an instant and holds
  // until the next event. Interpolating would draw sessions that never existed.
  const points = holds
    .flatMap((sample, index) => {
      const previous = holds[index - 1];
      const step = previous ? [`${x(sample.at)},${y(previous.held)}`] : [];
      return [...step, `${x(sample.at)},${y(sample.held)}`];
    })
    .join(' ');

  return (
    <Panel
      title="Sessions held"
      meta={holds.length > 0 ? `${holds.length} changes` : 'nothing recorded yet'}
    >
      {holds.length === 0 ? (
        <Empty>No allocations recorded yet. The line starts at the first one.</Empty>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            className="datum block overflow-visible"
            role="img"
            aria-label={`Concurrent premium sessions over time, peaking at ${peak?.held ?? 0} and returning to zero ${returnsToZero} times.`}
          >
            <line x1="26" y1={floor} x2={width} y2={floor} stroke="currentColor" strokeWidth="1" />
            <text x="18" y={floor + 4} textAnchor="end" fontSize="10" fill="currentColor">
              0
            </text>
            <line
              x1="26"
              y1={y(ceiling)}
              x2={width}
              y2={y(ceiling)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <text
              x="18"
              y={y(ceiling) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {ceiling}
            </text>

            <polyline fill="none" stroke="var(--primary)" strokeWidth="1.25" points={points} />

            {holds
              .filter((sample) => sample.held === 0)
              .map((sample) => (
                <rect
                  key={sample.at}
                  x={x(sample.at) - 2}
                  y={floor - 2}
                  width="4"
                  height="4"
                  fill="currentColor"
                />
              ))}
          </svg>

          <div className="datum flex flex-wrap justify-between gap-3 border-t pt-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Glyph kind="filled" />
              {returnsToZero} returns to zero
            </span>
            <span>
              peak {peak?.held ?? 0}
              {peak ? ` · ${clock(new Date(peak.at).toISOString())}` : ''}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Rules ───────────────────────────────────────────────────────────

/**
 * Which branches of `decide()` have ever fired.
 *
 * All eight are listed including the ones at zero. A rule that has never
 * matched is the most interesting row here — it is the difference between a
 * policy that is exhaustive and one that merely looks it.
 */
function Rules({ rules }: { rules: RuleCount[] }) {
  const most = Math.max(1, ...rules.map((rule) => rule.count));

  return (
    <Panel title="Rules fired" meta="8 rules · first match wins">
      <div className="flex flex-col">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_2.5rem] items-center gap-3 border-t py-1.5"
          >
            <Link
              to="/policy"
              className={cn(
                'datum truncate text-[11px] hover:text-primary',
                rule.count === 0 && 'text-muted-foreground',
              )}
              title={rule.id}
            >
              {rule.id}
            </Link>

            <span className="flex h-1.5 items-center">
              {rule.count > 0 ? (
                <span
                  className="block h-1.5 bg-primary"
                  style={{ width: `${(rule.count / most) * 100}%` }}
                />
              ) : null}
            </span>

            <span
              className={cn(
                'datum text-right text-xs',
                rule.count === 0 && 'text-muted-foreground',
              )}
            >
              {rule.disabled ? (
                <span className="inline-flex items-center gap-1.5">
                  <Glyph kind="slash" />
                  off
                </span>
              ) : (
                rule.count
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="border-t pt-2.5 text-xs text-muted-foreground">
        A rule at zero has never matched; the one marked off is disabled in configuration.
        Both are worth showing — an unexercised branch is not the same as an absent one.
      </p>
    </Panel>
  );
}

// ── Latency ─────────────────────────────────────────────────────────

/**
 * Decision time against the interlock's patience.
 *
 * The claim is not that this is fast. It is that the whole distribution sits
 * left of the line the crane stops caring at, and that a run to the right of it
 * still lifts — so the chart's job is to show the gap, not a mean.
 */
function Latency({ seconds }: { seconds: number[] }) {
  const slowest = Math.max(GATE_SECONDS, ...seconds);
  const overBudget = seconds.filter((value) => value >= GATE_SECONDS).length;

  return (
    <Panel
      title="Decision latency"
      meta={seconds.length > 0 ? `${seconds.length} decisions` : 'none yet'}
    >
      {seconds.length === 0 ? (
        <Empty>No completed decisions yet.</Empty>
      ) : (
        <>
          <div className="relative h-[76px] border-b">
            {seconds.map((value, index) => (
              <span
                key={`${value}-${index}`}
                className="absolute bottom-0 block w-[3px] bg-primary"
                style={{ left: `${(value / slowest) * 100}%`, height: 12 + (index % 5) * 11 }}
                title={`${value}s`}
              />
            ))}

            <span
              className="absolute top-0 bottom-0 block w-px border-l border-dashed"
              style={{ left: `${(GATE_SECONDS / slowest) * 100}%`, borderColor: 'currentColor' }}
            />
            <span
              className="eyebrow absolute top-0 whitespace-nowrap"
              style={{ left: `calc(${(GATE_SECONDS / slowest) * 100}% + 0.5rem)` }}
            >
              {GATE_SECONDS}s · interlock opens regardless
            </span>
          </div>

          <div className="datum flex flex-wrap justify-between gap-3 pt-2.5 text-xs text-muted-foreground">
            <span>
              fastest {seconds[0]}s · median {seconds[Math.floor(seconds.length / 2)]}s · slowest{' '}
              {seconds[seconds.length - 1]}s
            </span>
            <span className={overBudget > 0 ? 'text-foreground' : undefined}>
              {overBudget === 0
                ? 'all inside the gate'
                : `${overBudget} past the gate — those lifts proceeded undecided`}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ── Shared shell ────────────────────────────────────────────────────

/**
 * A region, ruled rather than boxed.
 *
 * Deliberately not a card. The design language separates regions with hairlines
 * and whitespace; a bordered, shadowed box would make four equal-weight objects
 * out of content that has a clear order of importance.
 */
function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-4 border-t pt-3">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {meta ? <Eyebrow>{meta}</Eyebrow> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-t py-4 text-xs text-muted-foreground">{children}</p>;
}
