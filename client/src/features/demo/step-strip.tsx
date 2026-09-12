import { cn } from '@/lib/utils';
import type { Beat } from './beats';

export interface StepStripProps {
  beats: readonly Beat[];
  index: number;
  /** 0..1 through the current beat. */
  local: number;
  onSelect: (index: number) => void;
  className?: string;
}

/**
 * The story's steps, as a ruled progress strip.
 *
 * The same construction as a job's lifecycle strip on the Control Room — a
 * hairline with stations on it, filled once reached — so the demo reads as
 * part of the product rather than a slide deck laid over it. Each station is a
 * button; the current one fills its own rule as the step plays.
 */
export function StepStrip({ beats, index, local, onSelect, className }: StepStripProps) {
  return (
    <ol
      className={cn('grid', className)}
      style={{ gridTemplateColumns: `repeat(${beats.length}, minmax(0, 1fr))` }}
    >
      {beats.map((beat, i) => {
        const current = i === index;
        const reached = i <= index;

        return (
          <li key={beat.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={current ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${beat.title}`}
              title={`${i + 1} · ${beat.title}`}
              className={cn(
                'btn-bare datum relative block w-full border-t pt-2 pr-2 text-left text-[10.5px] tracking-[0.06em] uppercase',
                reached ? 'border-t-foreground' : 'text-muted-foreground',
                current && 'font-medium text-primary',
              )}
            >
              <i
                aria-hidden="true"
                className={cn(
                  'absolute -top-1 left-0 block size-2',
                  reached ? 'bg-current' : 'box-border border border-current bg-background',
                )}
              />
              {current ? (
                <i
                  aria-hidden="true"
                  className="absolute -top-px left-0 block h-0.5 bg-primary"
                  style={{ width: `${local * 100}%` }}
                />
              ) : null}
              <span className="block truncate">
                <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>{' '}
                {beat.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
