import { Eyebrow } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { DecisionStep } from '@/types';
import type { BeatSource } from './beats';
import { ILLUSTRATION_STOP } from './crane-pose';
import { premiumHeldBy, spoken, stepOf, type MoveTimeline } from './timeline';

export interface RunTimelineProps {
  source: BeatSource;
  timeline: MoveTimeline;
  /** Recorded seconds; for the illustration, seconds into the beat. */
  seconds: number;
}

/**
 * The crane and the agent on one time axis.
 *
 * The drawing shows what happened; this shows *when*, and it is where the
 * product's latency argument is actually visible: the assessment runs while
 * the crane is still positioning, the decision lands at the twistlock, and
 * premium connectivity is held for the part of the move with a load in the
 * air — nothing either side of it. Drawn up to the playhead only, so it fills
 * in as the story is told rather than giving the ending away.
 */
export function RunTimeline({ source, timeline, seconds }: RunTimelineProps) {
  if (source === 'illustration') return <IllustratedRun timeline={timeline} seconds={seconds} />;

  const span = Math.ceil(timeline.end + 0.6);
  const left = (s: number) => `${(Math.min(span, Math.max(0, s)) / span) * 100}%`;
  const upTo = (from: number, to: number) =>
    `${(Math.max(0, Math.min(to, seconds, span) - from) / span) * 100}%`;

  const congestion = stepOf(timeline, DecisionStep.CONGESTION_CHECKED);
  const assessed = stepOf(timeline, DecisionStep.CRITICALITY_ASSESSED);
  const decided = stepOf(timeline, DecisionStep.DECIDED);
  const reached = timeline.steps.filter((s) => s.at <= seconds);
  const current = timeline.phases.findLastIndex((phase) => phase.from <= seconds);

  const assessing = congestion && assessed && seconds >= congestion.at;
  const premium = timeline.premium;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>Run · seconds since the job was issued</Eyebrow>
        <span className="datum truncate text-[11px] text-muted-foreground">
          {timeline.move.operation.operationId}
        </span>
      </div>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-stretch gap-x-2 gap-y-2">
        <span className="eyebrow self-center">{timeline.move.job.assetId}</span>
        <Lane seconds={seconds} left={left}>
          {timeline.phases.map((phase, index) =>
            phase.from > seconds || phase.from >= span ? null : (
              <div
                key={phase.state}
                className={cn(
                  'absolute top-0 h-full overflow-hidden border-t-2 border-l',
                  index === current ? 'border-t-primary text-primary' : 'border-t-foreground',
                )}
                style={{ left: left(phase.from), width: upTo(phase.from, phase.to) }}
                title={`${phase.state} · ${spoken(Math.min(phase.to, timeline.end) - phase.from)}`}
              >
                <span className="datum block truncate pt-1 pl-1 text-[10px] tracking-[0.06em]">
                  {phase.state}
                </span>
              </div>
            ),
          )}
        </Lane>

        <span className="eyebrow self-center">flowguard</span>
        <Lane seconds={seconds} left={left}>
          {assessing ? (
            <div
              className="absolute top-0 h-full overflow-hidden border-l"
              style={{
                left: left(congestion.at),
                width: upTo(congestion.at, assessed.at),
                background:
                  'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 6px)',
              }}
            >
              <span className="datum block truncate pt-1 pl-1 text-[10px] text-muted-foreground">
                {seconds < assessed.at
                  ? 'assessing…'
                  : `assessment ${spoken(assessed.at - congestion.at)}`}
              </span>
            </div>
          ) : null}

          {premium && seconds >= premium.from ? (
            <div
              className="absolute top-0 h-full overflow-hidden border-t-2 border-t-primary bg-primary/12"
              style={{ left: left(premium.from), width: upTo(premium.from, premium.to) }}
            >
              <span className="datum block truncate pt-1 pl-1 text-[10px] text-primary">
                premium held {spoken(premiumHeldBy(timeline, seconds))}
              </span>
            </div>
          ) : null}

          {!premium && decided && seconds >= decided.at ? (
            <span
              className="datum absolute top-0 truncate pt-1 pl-2 text-[10px] text-muted-foreground"
              style={{ left: left(decided.at) }}
            >
              {decided.record.action === 'NONE' ? 'nothing allocated · nothing held' : ''}
            </span>
          ) : null}

          {reached.map((s, index) => (
            <i
              key={`${s.record.step}-${s.at}`}
              aria-hidden="true"
              className={cn(
                'absolute -top-[4px] block size-[7px] -translate-x-1/2',
                index === reached.length - 1 ? 'bg-primary' : 'bg-foreground',
              )}
              style={{ left: left(s.at) }}
            />
          ))}
        </Lane>

        <span />
        <div className="relative h-3.5">
          {Array.from({ length: Math.floor(span / 5) + 1 }, (_, i) => i * 5).map((s) => (
            <span
              key={s}
              className="datum absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground first:translate-x-0"
              style={{ left: left(s) }}
            >
              {s === 0 ? '0 s' : s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Lane({
  seconds,
  left,
  children,
}: {
  seconds: number;
  left: (s: number) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-6 border-t">
      {children}
      <i
        aria-hidden="true"
        className="absolute -top-1 bottom-0 block w-px bg-primary"
        style={{ left: left(seconds) }}
      />
    </div>
  );
}

/**
 * The problem, on the same axes. No numbers: nothing here was recorded.
 */
function IllustratedRun({ timeline, seconds }: { timeline: MoveTimeline; seconds: number }) {
  // The recorded move's proportions, so the illustration has a real shape —
  // but no times, because nothing in it was recorded.
  const shape = timeline.phases.filter((phase) => Number.isFinite(phase.to));
  const total = shape.reduce((sum, phase) => sum + (phase.to - phase.from), 0);
  const widths = shape.map((phase) => ((phase.to - phase.from) / total) * 100);
  const starts = widths.map((_, index) => widths.slice(0, index).reduce((a, b) => a + b, 0));

  const hoisting = Math.max(0, shape.findIndex((phase) => phase.state === 'HOISTING'));
  const share = Math.min(1, seconds / ILLUSTRATION_STOP) * 0.45;
  const stopAt = starts[hoisting] + widths[hoisting] * share;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>Run · illustration</Eyebrow>
        <span className="datum text-[11px] text-muted-foreground">not a recording</span>
      </div>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-stretch gap-x-2 gap-y-2">
        <span className="eyebrow self-center">crane</span>
        <div className="relative h-6 border-t">
          {shape.slice(0, hoisting + 1).map((phase, index) => (
            <div
              key={phase.state}
              className={cn(
                'absolute top-0 h-full overflow-hidden border-t-2 border-l',
                index === hoisting ? 'border-t-destructive text-destructive' : 'border-t-foreground',
              )}
              style={{
                left: `${starts[index]}%`,
                width: `${index === hoisting ? widths[index] * share : widths[index]}%`,
              }}
            >
              <span className="datum block truncate pt-1 pl-1 text-[10px] tracking-[0.06em]">
                {phase.state}
              </span>
            </div>
          ))}
          {seconds >= ILLUSTRATION_STOP ? (
            <span
              className="datum absolute top-0 pt-1 pl-2 text-[10px] font-medium text-destructive"
              style={{ left: `${stopAt}%` }}
            >
              E-STOP
            </span>
          ) : null}
        </div>

        <span className="eyebrow self-center">flowguard</span>
        <div className="relative h-6 border-t">
          <span className="datum block truncate pt-1 text-[10px] text-muted-foreground">
            absent — nothing decides whether this lift matters
          </span>
        </div>
      </div>
    </div>
  );
}
