import { Link } from 'react-router';

import { Status } from '@/components/primitives';
import { cn } from '@/lib/utils';
import {
  GateAuthorisation,
  JOB_ABORTED,
  JOB_QUEUED,
  isJobHeld,
  isJobInFlight,
  isLoadCommitted,
  type FacilityJob,
} from '@/types';
import { GateHold } from './gate-hold';
import { JobSequence } from './job-sequence';

export interface JobRowProps {
  job: FacilityJob;
  /** The identity cells, supplied by the industry's panel. */
  children: React.ReactNode;
  gridClassName: string;
  onDispatch: (jobId: string) => void;
  onAbort: (jobId: string) => void;
  onSuspend: (jobId: string) => void;
  onResume: (jobId: string) => void;
  pending?: boolean;
  readOnly?: boolean;
  error?: React.ReactNode;
}

/**
 * The chrome around one job: progress, gate, controls, outcome.
 *
 * Shared across industries because all of it is driven by the job's own
 * lifecycle. What differs is only the identity cells, which each panel passes
 * in as children — a container id and a tonnage, or a registration and a
 * payload.
 *
 * Three densities, chosen by state rather than by a prop, because the right
 * amount of detail is a function of whether anything is still happening:
 *
 *   queued    identity line only — no progress exists yet
 *   running   the full sequence strip, plus the gate panel while it holds
 *   finished  identity line and a one-line outcome
 */
export function JobRow({
  job,
  children,
  gridClassName,
  onDispatch,
  onAbort,
  onSuspend,
  onResume,
  pending,
  readOnly,
  error,
}: JobRowProps) {
  const queued = job.state === JOB_QUEUED;
  const running = isJobInFlight(job);
  const holding = job.gateState !== undefined && job.state === job.gateState;
  const finished = !queued && !running;

  return (
    <article className={cn('flex flex-col gap-3 border-t', finished ? 'py-3' : 'py-4 pb-5')}>
      <div className={cn(gridClassName, 'datum items-baseline text-[15px]')}>
        {children}

        <span className="flex items-baseline justify-end gap-3 text-right">
          {/* Straight to the live page while the job is under way — for every
              role, since watching a decision happen is exactly what a viewer
              account is for. */}
          {running && job.operationId ? (
            <Link
              to={`/operations/${job.operationId}/live`}
              className="font-sans text-xs text-primary hover:underline"
              title="Watch this job's decision as it happens"
            >
              live ↗
            </Link>
          ) : null}
          <JobAction
            job={job}
            queued={queued}
            running={running}
            pending={pending}
            readOnly={readOnly}
            onDispatch={onDispatch}
            onAbort={onAbort}
            onSuspend={onSuspend}
            onResume={onResume}
          />
        </span>
      </div>

      <div className="datum text-xs text-muted-foreground">
        {job.from} <span aria-hidden="true">→</span> {job.to}
      </div>

      {queued ? (
        <Status kind="hollow" className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
          {JOB_QUEUED} · not dispatched
        </Status>
      ) : null}

      {running ? <JobSequence job={job} /> : null}
      {holding ? <GateHold job={job} /> : null}
      {finished ? <FinishedSummary job={job} /> : null}

      {error}
    </article>
  );
}

function JobAction({
  job,
  queued,
  running,
  pending,
  readOnly,
  onDispatch,
  onAbort,
  onSuspend,
  onResume,
}: {
  job: FacilityJob;
  queued: boolean;
  running: boolean;
  pending?: boolean;
  readOnly?: boolean;
  onDispatch: (jobId: string) => void;
  onAbort: (jobId: string) => void;
  onSuspend: (jobId: string) => void;
  onResume: (jobId: string) => void;
}) {
  // A finished job keeps its link to the trail for every role — reading the
  // evidence is exactly what a viewer account is for.
  if (readOnly && (queued || running)) {
    return <span className="font-sans text-xs text-muted-foreground">{job.state.toLowerCase()}</span>;
  }

  if (queued) {
    return (
      <button type="button" className="btn-line" disabled={pending} onClick={() => onDispatch(job.id)}>
        {pending ? '…' : 'Dispatch'}
      </button>
    );
  }

  // Held: the load is in the air and connectivity is being held for it. The
  // only sane next action is to report it safe, so that is the only one
  // offered — and it is the affirmative button, not the danger one.
  if (isJobHeld(job)) {
    return (
      <button
        type="button"
        className="btn-line"
        disabled={pending}
        onClick={() => onResume(job.id)}
      >
        {pending ? '…' : 'Load safe'}
      </button>
    );
  }

  if (running) {
    // Two different things, deliberately worded as two different things.
    // Before the load is committed, aborting cancels the job and connectivity
    // goes back. After it, there is a load hanging: "Stop" reports that, holds
    // the feed, and waits for someone to say it is down.
    const committed = isLoadCommitted(job);

    return (
      <button
        type="button"
        className={cn('btn-line', !committed && 'btn-line-danger')}
        disabled={pending}
        onClick={() => (committed ? onSuspend(job.id) : onAbort(job.id))}
        title={
          committed
            ? 'Report the operation halted. Connectivity is held until the load is reported safe.'
            : 'Cancel the job. Nothing is committed, so connectivity goes back immediately.'
        }
      >
        {committed ? 'Stop' : 'Abort'}
      </button>
    );
  }

  return job.operationId ? (
    <Link
      to={`/operations/${job.operationId}`}
      className="font-sans text-xs text-muted-foreground hover:text-primary"
    >
      trail ↗
    </Link>
  ) : (
    <span className="font-sans text-xs text-muted-foreground">{job.state.toLowerCase()}</span>
  );
}

/**
 * A completed job, in one line.
 *
 * Carries the two facts worth keeping: that it finished, and how its gate was
 * opened. A timeout is stated plainly rather than styled as an error — it is
 * the safety property working, and a reader who only ever sees the happy path
 * has not been shown the most important thing about this system.
 */
function FinishedSummary({ job }: { job: FacilityJob }) {
  const aborted = job.state === JOB_ABORTED;
  const byDecision = job.gateAuthorisedBy === GateAuthorisation.DECISION;

  return (
    <div className="datum flex flex-wrap items-baseline gap-x-4 text-[11px] tracking-[0.06em]">
      <Status kind={aborted ? 'slash' : 'filled'}>
        <span className={aborted ? 'text-muted-foreground' : undefined}>{job.state}</span>
      </Status>

      {job.gateAuthorisedBy ? (
        <Status kind={byDecision ? 'filled' : 'slash'}>
          <span className={byDecision ? 'text-muted-foreground' : undefined}>
            GATE {byDecision ? 'OPENED — decision' : 'OPENED — timeout · unprotected'}
          </span>
        </Status>
      ) : null}
    </div>
  );
}
