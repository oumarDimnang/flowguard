import { cn } from '@/lib/utils';

export interface PageProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * The page measure.
 *
 * Used by the masthead and by every page body, so their left edges align to
 * the pixel. In a layout built from rules rather than boxes that alignment is
 * the only thing making it read as deliberate.
 */
export function Page({ children, className }: PageProps) {
  return <div className={cn('page', className)}>{children}</div>;
}

export interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
  /** For the decision graph, which runs on its own dark palette. */
  style?: React.CSSProperties;
}

/** Names a region without spending a heading on it. */
export function Eyebrow({ children, className, style }: EyebrowProps) {
  return (
    <div className={cn('eyebrow', className)} style={style}>
      {children}
    </div>
  );
}

export interface SectionProps {
  title: React.ReactNode;
  /** Right-aligned counts or status, set quietly in mono. */
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Hairline above the section. Default on — regions are separated by rules. */
  ruled?: boolean;
}

/** A titled region: heading left, meta right, hairline above. */
export function Section({ title, meta, children, className, ruled = true }: SectionProps) {
  return (
    <section className={cn(ruled && 'border-t pt-6', className)}>
      <header className="flex items-baseline justify-between pb-4">
        <h2>{title}</h2>
        {meta ? <span className="datum text-xs text-muted-foreground">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

export interface LogRowProps {
  /** Rendered into the margin column. Never inline with the prose. */
  time?: React.ReactNode;
  children: React.ReactNode;
  /** Optional right-hand control or figure. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * The log grid — timestamp in a fixed margin column, content beside it.
 *
 * Every timestamped line in the app uses this, which is what keeps times
 * aligned down the page across regions that otherwise share no layout.
 */
export function LogRow({ time, children, trailing, className }: LogRowProps) {
  return (
    <div className={cn('log-row', trailing !== undefined && 'log-row-actionable', className)}>
      <span className="datum text-xs text-muted-foreground">{time ?? '—'}</span>
      <div className="min-w-0">{children}</div>
      {trailing !== undefined ? trailing : null}
    </div>
  );
}

export interface SkeletonProps {
  /** CSS width — match the real content so nothing shifts when data lands. */
  width: string;
  className?: string;
}

/** A placeholder bar. No shimmer, no spinner — see components.css. */
export function Skeleton({ width, className }: SkeletonProps) {
  return <span className={cn('skeleton', className)} style={{ width }} />;
}
