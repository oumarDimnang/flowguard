import { Link } from 'react-router';

import { Slot, Status } from '@/components/primitives';
import { logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DecisionStep, type DecisionRecord } from '@/types';
import { summarise } from './decision-summary';

export interface DecisionFeedProps {
  records: readonly DecisionRecord[];
  loading?: boolean;
  /** Marks the feed as no longer live without hiding what it already holds. */
  stale?: boolean;
  className?: string;
}

/**
 * The live decision log, newest first — a rail, not a full-width table.
 *
 * Entries stack rather than sitting in columns, which is what lets the feed
 * live beside the work queue instead of below it. Below it, forty entries add
 * roughly 1,600px to the page and push the thing you are actually watching off
 * the bottom of the screen.
 *
 * It scrolls internally and sticks to the viewport, so the tail stays visible
 * while you work down the queue. This is a tail, not an archive — history
 * belongs on Operations.
 *
 * Step names are not softened into prose. `CRITICALITY_ASSESSED` is what the
 * audit trail says, and matching it makes the two obviously the same thing
 * rather than two views someone has to reconcile.
 */
export function DecisionFeed({ records, loading, stale, className }: DecisionFeedProps) {
  return (
    <aside
      className={cn(
        'flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)]',
        className,
      )}
    >
      <header className="flex items-baseline justify-between border-t pt-4 pb-3">
        <h2>Decision feed</h2>
        <span className="datum text-xs text-muted-foreground">
          {stale ? (
            <Status kind="hollow">not live</Status>
          ) : (
            <>
              <Slot ch={2}>{records.length}</Slot> entries
            </>
          )}
        </span>
      </header>

      {records.length === 0 ? (
        <p className="border-t border-b py-3 text-muted-foreground">
          {loading ? (
            'loading…'
          ) : (
            <>
              No decisions yet. Dispatch a move and the first entry will be{' '}
              <span className="datum">DEVICE_CHECKED</span>.
            </>
          )}
        </p>
      ) : (
        <div className="scroll-area min-h-0 flex-1">
          {records.map((record) => (
            <FeedEntry key={record.idempotencyKey} record={record} stale={stale} />
          ))}
          <div className="border-t" />
        </div>
      )}
    </aside>
  );
}

function FeedEntry({ record, stale }: { record: DecisionRecord; stale?: boolean }) {
  return (
    <article className={cn('flex flex-col gap-0.5 border-t py-2', stale && 'text-muted-foreground')}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'datum truncate text-xs font-medium',
            // The two steps worth finding at a glance: the judgement, and the
            // release that closes the loop.
            record.step === DecisionStep.RELEASED && 'text-primary',
            record.step === DecisionStep.FAILED && 'text-destructive',
          )}
        >
          {record.step}
        </span>
        <span className="datum shrink-0 text-[11px] text-muted-foreground">
          {logTime(record.occurredAt)}
        </span>
      </div>

      <span className="text-[13px] text-muted-foreground">{summarise(record)}</span>

      <span className="flex items-baseline justify-between gap-2">
        <Link
          to={`/operations/${record.operationId}`}
          className="datum truncate text-[11px] text-muted-foreground hover:text-primary"
        >
          {record.operationId}
        </Link>
        <Link
          to={`/operations/${record.operationId}/graph`}
          className="datum shrink-0 text-[11px] text-muted-foreground hover:text-primary"
          title="View this workflow as a 3D decision graph"
        >
          3D ↗
        </Link>
      </span>
    </article>
  );
}
