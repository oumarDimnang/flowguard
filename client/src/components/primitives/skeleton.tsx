import { cn } from '@/lib/utils';

/**
 * Loading placeholders.
 *
 * One vocabulary for every page: a bar, rows of bars in whatever grid the real
 * rows use, a paragraph of bars, a block. Each bar carries a slow left-to-right
 * sheen (see `.skeleton` in components.css, which also switches it off under
 * prefers-reduced-motion) and sits inside a row whose height already matches
 * the populated row, so nothing shifts when data lands. To recolour a bar,
 * set `--skeleton-base` and `--skeleton-sheen` through `style` rather than a
 * background, which would paint over the sweep.
 *
 * `Loadable` is the gate. Every fetch in the app has the same three states —
 * nothing yet and still asking, nothing and finished asking, something — and
 * writing that ternary by hand on every page is how the states drift apart.
 */

export interface SkeletonProps {
  /** CSS width — match the real content so nothing shifts when data lands. */
  width: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A placeholder bar. */
export function Skeleton({ width, className, style }: SkeletonProps) {
  return <span className={cn('skeleton', className)} style={{ width, ...style }} />;
}

export interface LoadableProps {
  /** The fetch is in flight. */
  loading: boolean;
  /**
   * There is nothing to render yet. Defaults to true, for a single resource;
   * pass `rows.length === 0` for a list that may already hold pushed data —
   * a reload must never blank a table someone is reading.
   */
  empty?: boolean;
  /** What to draw while loading and empty. */
  skeleton: React.ReactNode;
  /** What to draw when finished and still empty. Omit to draw the children. */
  whenEmpty?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The loading gate.
 *
 * Skeleton while loading with nothing to show, the empty state once the answer
 * is "nothing", and the content otherwise. The skeleton is announced to
 * assistive technology as busy, with `display: contents` so the wrapper is
 * invisible to the grid or flex layout it sits in.
 */
export function Loadable({ loading, empty = true, skeleton, whenEmpty, children }: LoadableProps) {
  if (loading && empty) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading" className="contents">
        {skeleton}
      </div>
    );
  }
  if (!loading && empty && whenEmpty !== undefined) return <>{whenEmpty}</>;
  return <>{children}</>;
}

/** One cell of a placeholder row: a width, optionally pushed to the end of its column. */
export type SkeletonColumn = string | { width: string; end?: boolean };

export interface SkeletonRowsProps {
  /** How many rows. Match roughly what the real list usually holds. */
  rows?: number;
  /** One entry per cell, as the width the real cell usually fills. */
  columns: readonly SkeletonColumn[];
  /**
   * The row's own layout — the same grid class the populated rows use, so the
   * bars land in the real columns. Any flex layout works too: a stacked
   * `flex flex-col gap-2` draws multi-line entries.
   */
  layoutClassName?: string;
  /** Rule, padding and alignment. Defaults to the standard ruled table row. */
  rowClassName?: string;
  /** Pin the row height to the populated row's, when its content is taller than a bar. */
  height?: number;
  /** Closing hairline under the last row. On by default: lists end on a rule. */
  closing?: boolean;
  style?: React.CSSProperties;
}

/** Placeholder rows, in the real rows' grid. */
export function SkeletonRows({
  rows = 5,
  columns,
  layoutClassName = 'log-row',
  rowClassName = 'items-center border-t py-2.5',
  height,
  closing = true,
  style,
}: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={cn(layoutClassName, rowClassName)} style={{ height }}>
          {columns.map((column, cell) => {
            const { width, end } = typeof column === 'string' ? { width: column } : column;
            return (
              <Skeleton
                key={cell}
                width={width}
                className={end ? 'justify-self-end' : undefined}
                style={style}
              />
            );
          })}
        </div>
      ))}
      {closing ? <div className="border-t" /> : null}
    </>
  );
}

export interface SkeletonTextProps {
  /** Widths of the lines, top to bottom. Defaults to a short paragraph. */
  lines?: readonly string[];
  /** Rule above the block. On by default: regions start on a rule. */
  ruled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** A paragraph of placeholder lines. */
export function SkeletonText({
  lines = ['40%', '80%', '65%'],
  ruled = true,
  className,
  style,
}: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-3', ruled && 'border-t pt-4', className)}>
      {lines.map((width, line) => (
        <Skeleton key={line} width={width} style={style} />
      ))}
    </div>
  );
}

export interface SkeletonBlockProps {
  /** Height in pixels — the space the real chart or scene will take. */
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

/** A placeholder region: a chart, a scene, anything that is not text. */
export function SkeletonBlock({ height, className, style }: SkeletonBlockProps) {
  return <div className={cn('skeleton w-full', className)} style={{ height, ...style }} />;
}
