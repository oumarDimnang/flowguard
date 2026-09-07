import { useEffect, useRef, useState } from 'react';

import { Eyebrow, Status } from '@/components/primitives';
import { GateAuthorisation, type FacilityJob } from '@/types';

/**
 * How long the interlock waits for a decision before lifting anyway.
 *
 * Mirrors GATE_TIMEOUT_MS in server/src/facility/facility-system.base.ts.
 * Nothing links the two at compile time — this is a cross-boundary constant in
 * the same family as the Temporal signal names, and it is only used to render a
 * progress bar. The server owns the real deadline; if they drift, the bar is
 * wrong but the crane still lifts on time.
 */
const GATE_TIMEOUT_MS = 30_000;

/**
 * The gate, made visible.
 *
 * The hero moment of the demo, whatever the industry: forty tonnes paused short
 * of leaving the ground, or an aircraft held on the pad, waiting for an answer. Both outcomes are printed
 * before either happens, because the second one is the point — FlowGuard is
 * advisory to the interlock, never a precondition of it, and work that
 * proceeds unprotected is a correct outcome rather than a failure.
 */
export function GateHold({ job }: { job: FacilityJob }) {
  const elapsed = useElapsedInHold(job);
  const remaining = Math.max(0, GATE_TIMEOUT_MS - elapsed);
  const progress = Math.min(100, (elapsed / GATE_TIMEOUT_MS) * 100);

  return (
    <div className="grid grid-cols-1 items-start gap-4 pt-1 md:grid-cols-[240px_minmax(0,1fr)] md:gap-x-8">
      <div className="flex flex-col gap-0.5">
        <Eyebrow>Decision window remaining</Eyebrow>

        <div className="datum w-[7ch] text-[44px] leading-none font-medium text-primary">
          {(remaining / 1000).toFixed(1)}
          <span className="text-xl text-muted-foreground"> s</span>
        </div>

        <div className="relative mt-2 h-0.5 w-full bg-border">
          <div className="absolute top-0 left-0 h-0.5 bg-primary" style={{ width: `${progress}%` }} />
        </div>

        <div className="datum flex justify-between text-[11px] text-muted-foreground">
          <span>elapsed {(elapsed / 1000).toFixed(1)}</span>
          <span>deadline {(GATE_TIMEOUT_MS / 1000).toFixed(0)}.0</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 text-[13px]">
        <p className="flex flex-wrap gap-x-2">
          <span className="font-medium">{job.gateState} hold.</span>
          <span className="text-muted-foreground">
            Preconditions confirmed. The job is paused awaiting a decision for{' '}
            <span className="datum text-foreground">{job.operationId}</span>.
          </span>
        </p>

        <Eyebrow className="pt-1">Resolves to one of</Eyebrow>

        <div className="flex flex-col gap-2">
          <Outcome
            kind="filled"
            title={`GATE OPENED — ${GateAuthorisation.DECISION.toLowerCase()}`}
            detail="a decision arrived in time; protected or best-effort as decided"
          />
          <Outcome
            kind="slash"
            title={`GATE OPENED — ${GateAuthorisation.TIMEOUT.toLowerCase()} · proceeding unprotected`}
            detail="no decision before the deadline; the job proceeds anyway. FlowGuard never blocks a facility."
          />
        </div>
      </div>
    </div>
  );
}

function Outcome({
  kind,
  title,
  detail,
}: {
  kind: 'filled' | 'slash';
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <Status kind={kind} className="font-medium">
        {title}
      </Status>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}

/**
 * Milliseconds this job has been sitting at its gate.
 *
 * Timed locally from the transition rather than from a server timestamp: the
 * job payload carries `gateAuthorisedAt` only once the hold *ends*, so while
 * it is still holding there is nothing on the wire to count from.
 */
function useElapsedInHold(job: FacilityJob): number {
  const enteredAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const holding = job.gateState !== undefined && job.state === job.gateState;

  useEffect(() => {
    if (!holding) {
      enteredAt.current = null;
      setElapsed(0);
      return;
    }

    enteredAt.current ??= Date.now();

    const tick = () => setElapsed(Date.now() - (enteredAt.current ?? Date.now()));
    tick();

    // 100ms is enough for a tenth-of-a-second readout and cheap enough not to
    // matter; the value sits in a fixed-width slot so it cannot cause reflow.
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [holding]);

  return elapsed;
}
