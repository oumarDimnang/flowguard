import { useState } from 'react';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Section, Skeleton, Slot, Status } from '@/components/primitives';
import { logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isJobInFlight, type FacilityDescriptor, type FacilityJob } from '@/types';
import { JobRow } from './job-row';

export interface JobQueueProps {
  descriptor: FacilityDescriptor | undefined;
  jobs: readonly FacilityJob[];
  loading: boolean;
  /** Grid template for this industry's columns. */
  gridClassName: string;
  /** Right-aligned column indices, for the header row. */
  rightAlignedColumns?: readonly number[];
  /** Renders one industry's identity cells for a job. */
  renderCells: (job: FacilityJob) => React.ReactNode;
  onDispatch: (jobId: string) => Promise<unknown>;
  onAbort: (jobId: string) => Promise<unknown>;
}

/**
 * The work queue, shared by every industry.
 *
 * Column labels come from the facility descriptor and the cells from the
 * industry's panel, so the failure handling, the role gate, the loading
 * placeholders and the counts are written once. Only what a row *says* is
 * per-industry; how the queue behaves is not.
 */
export function JobQueue({
  descriptor,
  jobs,
  loading,
  gridClassName,
  rightAlignedColumns = [],
  renderCells,
  onDispatch,
  onAbort,
}: JobQueueProps) {
  const { can } = useAuth();
  const canDispatch = can('OPERATOR');

  const [pending, setPending] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, ActionFailure>>({});

  const act = async (jobId: string, run: (id: string) => Promise<unknown>) => {
    setPending(jobId);
    setFailures((prev) => omit(prev, jobId));

    try {
      await run(jobId);
    } catch (err) {
      setFailures((prev) => ({ ...prev, [jobId]: describe(err) }));
    } finally {
      setPending(null);
    }
  };

  const running = jobs.filter(isJobInFlight).length;
  const held = jobs.filter((j) => j.gateState !== undefined && j.state === j.gateState).length;
  const columns = descriptor?.columns ?? [];

  return (
    <Section
      title="Work queue"
      meta={
        <>
          <Slot>{jobs.length}</Slot> jobs · <Slot>{running}</Slot> running · <Slot>{held}</Slot>{' '}
          held at gate
        </>
      }
    >
      <div className={cn(gridClassName, 'eyebrow pb-2')}>
        {columns.map((column, index) => (
          <span key={column} className={rightAlignedColumns.includes(index) ? 'text-right' : undefined}>
            {column}
          </span>
        ))}
      </div>

      {/*
       * A viewer sees the queue and every decision made about it, but no
       * controls. Hidden rather than disabled: a disabled button invites
       * "why can't I?", an absent one does not — and one quiet line answers it.
       */}
      {!canDispatch ? (
        <p className="border-t py-2 text-xs text-muted-foreground">
          Read-only account. Dispatching requires operator access.
        </p>
      ) : null}

      {loading && jobs.length === 0 ? (
        <QueueSkeleton gridClassName={gridClassName} columns={columns.length} />
      ) : null}

      {jobs.map((job) => (
        <JobRow
          key={job.id}
          job={job}
          gridClassName={gridClassName}
          readOnly={!canDispatch}
          pending={pending === job.id}
          onDispatch={(id) => void act(id, onDispatch)}
          onAbort={(id) => void act(id, onAbort)}
          error={
            failures[job.id] ? (
              <InlineFailure
                failure={failures[job.id]}
                onDismiss={() => setFailures((prev) => omit(prev, job.id))}
              />
            ) : undefined
          }
        >
          {renderCells(job)}
        </JobRow>
      ))}

      <div className="border-t" />
    </Section>
  );
}

/** Placeholder rows the same height as populated ones, so nothing shifts. */
function QueueSkeleton({ gridClassName, columns }: { gridClassName: string; columns: number }) {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className={cn(gridClassName, 'items-center border-t py-4')} style={{ height: 22 }}>
          {Array.from({ length: columns }, (_, cell) => (
            <Skeleton key={cell} width={cell === columns - 1 ? '100%' : '70%'} />
          ))}
        </div>
      ))}
      <div className="border-t" />
    </>
  );
}

interface ActionFailure {
  code: string;
  message: string;
  at: string;
}

/**
 * The failure lands on the row that caused it, not in a floating toast.
 *
 * A toast is gone before anyone can read it and gives no clue which row it
 * referred to.
 */
function InlineFailure({ failure, onDismiss }: { failure: ActionFailure; onDismiss: () => void }) {
  return (
    <div className="log-row log-row-actionable border-t border-t-destructive pt-2.5">
      <span className="datum text-xs text-muted-foreground">{logTime(failure.at)}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Status kind="filled" className="font-semibold text-destructive">
          {failure.code}
        </Status>
        <span>{failure.message}</span>
      </div>
      <button type="button" className="btn-bare border-b text-xs text-muted-foreground" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function describe(err: unknown): ActionFailure {
  const at = new Date().toISOString();

  if (err instanceof ApiError) {
    const label =
      err.status === 409
        ? 'CONFLICT'
        : err.status === 404
          ? 'NOT FOUND'
          : err.status === 403
            ? 'FORBIDDEN'
            : 'ERROR';

    return {
      code: `${err.status} ${label}`,
      message: err.message.replace(/^\d+\s\S+\s—\s/, ''),
      at,
    };
  }

  return { code: 'REQUEST FAILED', message: (err as Error).message, at };
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
