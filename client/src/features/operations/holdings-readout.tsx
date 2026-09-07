import { useEffect, useRef, useState } from 'react';

import { Eyebrow, Slot } from '@/components/primitives';
import { logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Holdings } from '@/hooks/use-operations';
import { useHoldingsHistory, type HoldingsSample } from '@/hooks/use-holdings-history';

export interface HoldingsReadoutProps {
  holdings: Holdings;
  /** Renders the readout muted and labelled stale when the socket is down. */
  stale?: boolean;
  loading?: boolean;
}

/**
 * What the network is being paid for, right now.
 *
 * The single most important element in the product. The number rising is
 * unremarkable — every connectivity system can allocate. The number returning
 * to zero, unprompted, every time, is the entire business case, so the zero
 * state gets as much design attention as the held state and is never rendered
 * as an empty placeholder.
 */
export function HoldingsReadout({ holdings, stale, loading }: HoldingsReadoutProps) {
  const history = useHoldingsHistory(holdings.count, loading);
  const zeroedAt = useZeroedAt(holdings.count);
  const first = holdings.operations[0];

  return (
    <section className="flex flex-col gap-6 border-t py-6">
      <div className="flex flex-col gap-1">
        <Eyebrow>
          Premium sessions held now
          {stale ? <span className="ml-3">· stale</span> : null}
        </Eyebrow>

        <div className="flex items-baseline gap-5">
          <div
            className={cn(
              'datum mt-3 w-[1ch] text-right text-figure leading-none font-medium',
              (stale || loading) && 'text-muted-foreground',
              !stale && !loading && holdings.count > 0 && 'text-primary',
            )}
          >
            {loading ? '–' : holdings.count}
          </div>

          <div className="flex flex-col gap-0.5 pb-2.5">
            <div className="datum text-[15px]">
              <Slot>{loading ? '–' : holdings.count}</Slot> QoD{' '}
              <span className="text-muted-foreground">·</span>{' '}
              <Slot>{loading ? '–' : holdings.sliceCount}</Slot> slices
            </div>

            <p className="max-w-[40ch] pt-1 text-xs text-muted-foreground">
              Rises when a lift is protected. Returns to 0 the moment the lift lands — nothing
              is held longer than the operation that needed it.
            </p>

            <div className="text-xs text-muted-foreground">
              {loading ? (
                'waiting for first snapshot'
              ) : first ? (
                <>
                  held by <span className="datum text-foreground">{first.operationId}</span> since{' '}
                  <span className="datum">{logTime(first.updatedAt)}</span>
                </>
              ) : zeroedAt ? (
                <>
                  returned to 0 at <span className="datum">{logTime(zeroedAt)}</span> · every
                  session released
                </>
              ) : (
                'nothing held · nothing to release · ready'
              )}
            </div>
          </div>
        </div>

      </div>

      <HoldingsChart history={history} current={holdings.count} />
    </section>
  );
}

/**
 * A step chart of everything this browser has actually observed.
 *
 * Explicitly *not* fetched — the server keeps no time series, and drawing one
 * from data that does not exist would be the kind of claim this whole product
 * is arguing against. What it plots is the session's own record: every change
 * seen since the page loaded, and no more. An empty chart on a fresh page is
 * therefore correct rather than broken.
 */
function HoldingsChart({ history, current }: { history: HoldingsSample[]; current: number }) {
  if (history.length < 2) {
    // One line, not a reserved 96px void. Before the first allocation there is
    // genuinely nothing to plot, and holding chart-sized space open for it
    // pushes the work queue down for no information.
    return (
      <p className="border-t pt-2 text-xs text-muted-foreground">
        <span className="eyebrow mr-3">Held sessions · this session</span>
        nothing observed yet — the line starts at the first allocation
      </p>
    );
  }

  const width = 640;
  const height = 96;
  const baseline = 72;
  const unit = 36;

  const start = history[0].at;
  // Scaled to the last observation, not to now: reading the clock during
  // render is impure, and it would also stretch the x-axis on every repaint
  // while nothing new was actually observed.
  const end = history[history.length - 1].at;
  const span = Math.max(1, end - start);
  const x = (at: number) => ((at - start) / span) * width;
  const y = (count: number) => baseline - Math.min(count, 2) * unit;

  // Step, not slope: a session is held or it is not, and interpolating between
  // the two would draw a state the system never occupied.
  const points: string[] = [];
  history.forEach((sample, index) => {
    if (index > 0) points.push(`${x(sample.at)},${y(history[index - 1].count)}`);
    points.push(`${x(sample.at)},${y(sample.count)}`);
  });
  points.push(`${width},${y(current)}`);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="eyebrow flex justify-between">
        <span>Held sessions · this session</span>
        <span>
          {logTime(new Date(start).toISOString()).slice(0, 5)} — now
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="block overflow-visible">
        <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="var(--border)" strokeWidth="1" />
        <line
          x1="0"
          y1={baseline - unit}
          x2={width}
          y2={baseline - unit}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
        <text x="0" y={height - 6} fontSize="10" fill="var(--muted-foreground)" className="datum">
          0
        </text>
        <text x="0" y={baseline - unit - 5} fontSize="10" fill="var(--muted-foreground)" className="datum">
          1
        </text>
        <polyline
          fill="none"
          stroke={current > 0 ? 'var(--primary)' : 'var(--foreground)'}
          strokeWidth="1.25"
          points={points.join(' ')}
        />
      </svg>
    </div>
  );
}

/** When the count last fell back to zero — the moment worth pointing at. */
function useZeroedAt(count: number): string | undefined {
  const [at, setAt] = useState<string | undefined>(undefined);
  const previous = useRef(count);

  useEffect(() => {
    if (previous.current > 0 && count === 0) setAt(new Date().toISOString());
    previous.current = count;
  }, [count]);

  return at;
}
