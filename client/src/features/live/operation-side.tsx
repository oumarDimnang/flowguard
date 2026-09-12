import { useState } from 'react';
import { Link } from 'react-router';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Eyebrow, Glyph, Status } from '@/components/primitives';
import { clock, duration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  DecisionStep,
  GateAuthorisation,
  JOB_ABORTED,
  JOB_QUEUED,
  isJobInFlight,
  isOperationInFlight,
  type DecisionRecord,
  type FacilityJob,
  type Operation,
} from '@/types';

export interface OperationSideProps {
  operationId: string | undefined;
  operation: Operation | undefined;
  records: readonly DecisionRecord[];
  now: number;
  jobs: readonly FacilityJob[];
  /** Issue the next job. Resolves with the job, which carries its new operation id. */
  onDispatch: (jobId: string) => Promise<FacilityJob>;
}

/**
 * The physical side of the screen: the operation, the job doing it, and the
 * queue behind it.
 *
 * The decision trail says what was decided and never what the crane was doing
 * meanwhile; this column is the other half of that sentence. And the queue is
 * here so the next dispatch happens from this page — the contrast case is two
 * jobs on the same cell, and it should not take a trip back to the Control
 * Room to run the second.
 *
 * The gate hold is deliberately not here: it is the hero moment and needs the
 * width, so the page renders it full-bleed above the graph while it lasts.
 */
export function OperationSide({
  operationId,
  operation,
  records,
  now,
  jobs,
  onDispatch,
}: OperationSideProps) {
  const job = jobs.find((candidate) => candidate.operationId === operationId);
  const queued = jobs.filter((candidate) => candidate.state === JOB_QUEUED);

  return (
    <div className="flex flex-col gap-6">
      <OperationFacts operation={operation} records={records} now={now} />
      <FacilityJobPanel job={job} />
      <UpNext jobs={queued} onDispatch={onDispatch} />
    </div>
  );
}

// ── The operation ────────────────────────────────────────────────────

function OperationFacts({
  operation,
  records,
  now,
}: {
  operation: Operation | undefined;
  records: readonly DecisionRecord[];
  now: number;
}) {
  if (!operation) {
    return (
      <dl className="flex flex-col gap-1 text-[13px]">
        <Eyebrow>Operation</Eyebrow>
        <dd className="m-0 text-muted-foreground">Loading…</dd>
      </dl>
    );
  }

  const inFlight = isOperationInFlight(operation.status);
  const decided = [...records].reverse().find((r) => r.step === DecisionStep.DECIDED);
  const until = operation.completedAt ?? new Date(now).toISOString();

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Operation</Eyebrow>

      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        <Term>status</Term>
        <Value>
          <Status kind={inFlight ? 'filled' : 'hollow'} className={cn(inFlight && 'text-primary')}>
            {operation.status}
          </Status>
        </Value>

        <Term>device</Term>
        <Value>{operation.deviceId}</Value>

        <Term>started</Term>
        <Value>{clock(operation.startedAt)}</Value>

        <Term>{inFlight ? 'elapsed' : 'duration'}</Term>
        <Value>{duration(operation.startedAt, until)}</Value>

        {decided ? (
          <>
            <Term>action</Term>
            <Value>{decided.action ?? '—'}</Value>
          </>
        ) : null}

        {operation.qodSessionId ? (
          <>
            <Term>QoD session</Term>
            <Value className="[overflow-wrap:anywhere]">
              {operation.qodSessionId}
              {operation.qosStatus ? (
                <span className="text-muted-foreground"> · {operation.qosStatus}</span>
              ) : null}
            </Value>
          </>
        ) : null}

        {operation.sliceId ? (
          <>
            <Term>slice</Term>
            <Value className="[overflow-wrap:anywhere]">{operation.sliceId} · attached</Value>
          </>
        ) : null}
      </dl>
    </div>
  );
}

// ── The job ──────────────────────────────────────────────────────────

function FacilityJobPanel({ job }: { job: FacilityJob | undefined }) {
  if (!job) {
    return (
      <div className="flex flex-col gap-2">
        <Eyebrow>Facility</Eyebrow>
        <p className="text-[13px] text-muted-foreground">
          Not dispatched from the work queue — a scenario or an external system submitted this
          event, so there is no physical job to show beside it.
        </p>
      </div>
    );
  }

  const running = isJobInFlight(job);
  const finished = job.state !== JOB_QUEUED && !running;
  const aborted = job.state === JOB_ABORTED;
  const byDecision = job.gateAuthorisedBy === GateAuthorisation.DECISION;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Facility · {job.id}</Eyebrow>
        <span className="datum text-[11px] text-muted-foreground">{job.assetId}</span>
      </div>

      <p className="text-[13px] leading-snug text-muted-foreground">{job.summary}</p>

      <div className="datum text-xs text-muted-foreground">
        {job.from} <span aria-hidden="true">→</span> {job.to}
      </div>

      {running || finished ? <Stations job={job} /> : null}

      {finished ? (
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
      ) : null}

      <Link to="/control-room" className="link-rule self-start text-xs text-muted-foreground">
        controls in the Control Room ↗
      </Link>
    </div>
  );
}

/**
 * The job's physical sequence, stacked.
 *
 * The Control Room's strip lays the stations out in a row because it has the
 * width; this column does not, and eight station names in a 19rem row collide.
 * Same data, same three markers, read downwards.
 */
function Stations({ job }: { job: FacilityJob }) {
  const reachedIndex = job.lifecycle.indexOf(job.state);
  const aborted = job.state === JOB_ABORTED;

  return (
    <ol className="datum flex flex-col border-b text-[11px] tracking-[0.06em]">
      {job.lifecycle.map((step, index) => {
        const reached = reachedIndex >= index && !aborted;
        const current = job.state === step;
        const holding = current && step === job.gateState;

        return (
          <li
            key={step}
            className={cn(
              'status-line border-t py-1',
              !reached && 'text-muted-foreground',
              current && 'font-medium text-primary',
            )}
          >
            <Glyph
              kind={aborted && index > reachedIndex ? 'slash' : reached ? 'filled' : 'hollow'}
              className={current ? 'animate-pulse' : undefined}
            />
            {step}
            {holding ? <span className="text-muted-foreground"> · HOLD</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── The queue ────────────────────────────────────────────────────────

function UpNext({
  jobs,
  onDispatch,
}: {
  jobs: readonly FacilityJob[];
  onDispatch: (jobId: string) => Promise<FacilityJob>;
}) {
  const { can } = useAuth();
  const canDispatch = can('OPERATOR');

  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const dispatch = async (jobId: string) => {
    setPending(jobId);
    setFailure(null);
    try {
      await onDispatch(jobId);
    } catch (err) {
      setFailure(
        err instanceof ApiError ? err.message.replace(/^\d+\s\S+\s—\s/, '') : (err as Error).message,
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Up next</Eyebrow>
        <span className="datum text-[11px] text-muted-foreground">{jobs.length} queued</span>
      </div>

      {jobs.length === 0 ? (
        <p className="border-t border-b py-2.5 text-[13px] text-muted-foreground">
          Nothing left in the queue. Reset the plan from the Control Room to run it again.
        </p>
      ) : (
        <ol className="flex flex-col border-b">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-baseline justify-between gap-3 border-t py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="datum text-[13px] font-medium">
                  {job.id} <span className="font-normal text-muted-foreground">· {job.assetId}</span>
                </span>
                <span className="truncate text-[12px] text-muted-foreground" title={job.summary}>
                  {job.summary}
                </span>
              </div>

              {canDispatch ? (
                <button
                  type="button"
                  className="btn-line shrink-0"
                  disabled={pending !== null}
                  onClick={() => void dispatch(job.id)}
                >
                  {pending === job.id ? '…' : 'Dispatch'}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {failure ? (
        <p role="alert" className="text-[13px] text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────

function Term({ children }: { children: React.ReactNode }) {
  return <dt className="text-muted-foreground">{children}</dt>;
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={cn('datum m-0 min-w-0', className)}>{children}</dd>;
}
