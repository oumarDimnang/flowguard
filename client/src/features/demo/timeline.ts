import { DecisionStep, type DecisionRecord } from '@/types';
import type { RecordedMove } from './recording';

/**
 * A recorded move, laid out on one clock.
 *
 * Every time on the demo page is seconds since the business event was accepted
 * — the operation's `startedAt`. The crane's state changes and the agent's
 * records were stamped by different processes on the same machine, so putting
 * them on one axis is what shows the thing worth showing: the assessment runs
 * while the crane is still positioning, and the decision lands before the load
 * leaves the ground.
 */
export interface MoveTimeline {
  move: RecordedMove;
  /** Epoch milliseconds of t = 0. */
  origin: number;
  /** The crane's lifecycle, each state from its own transition to the next. */
  phases: readonly Phase[];
  /** The decision trail, in the order it happened. */
  steps: readonly TimedRecord[];
  /** Twistlock locked → hoist authorised. Where the job waited, if it did. */
  gate?: { from: number; to: number };
  /** Allocated → released. How long premium connectivity was actually held. */
  premium?: { from: number; to: number };
  /** The later of the job finishing and the last record landing. */
  end: number;
}

export interface Phase {
  state: string;
  from: number;
  /** Infinity for the terminal state. */
  to: number;
}

export interface TimedRecord {
  at: number;
  record: DecisionRecord;
}

export function timelineOf(move: RecordedMove): MoveTimeline {
  const origin = Date.parse(move.operation.startedAt);
  const seconds = (iso: string) => (Date.parse(iso) - origin) / 1000;

  const phases = move.transitions.map((change, index) => ({
    state: change.state,
    from: seconds(change.at),
    to:
      index + 1 < move.transitions.length
        ? seconds(move.transitions[index + 1].at)
        : Number.POSITIVE_INFINITY,
  }));

  const steps = move.records
    .map((record) => ({ at: seconds(record.occurredAt), record }))
    .sort((a, b) => a.at - b.at);

  const gatePhase = phases.find((phase) => phase.state === move.job.gateState);
  const allocated = steps.find((s) => s.record.step === DecisionStep.ALLOCATED);
  const released = steps.find((s) => s.record.step === DecisionStep.RELEASED);

  const jobEnd = move.job.completedAt ? seconds(move.job.completedAt) : 0;
  const lastRecord = steps.length > 0 ? steps[steps.length - 1].at : 0;

  return {
    move,
    origin,
    phases,
    steps,
    gate: gatePhase ? { from: gatePhase.from, to: gatePhase.to } : undefined,
    premium: allocated && released ? { from: allocated.at, to: released.at } : undefined,
    end: Math.max(jobEnd, lastRecord),
  };
}

/** The first record of a step, if the trail has one. */
export function stepOf(timeline: MoveTimeline, step: DecisionStep): TimedRecord | undefined {
  return timeline.steps.find((s) => s.record.step === step);
}

/** Records that had happened by `t`. */
export function stepsBy(timeline: MoveTimeline, t: number): readonly TimedRecord[] {
  return timeline.steps.filter((s) => s.at <= t);
}

export interface PhaseAt {
  /** 'QUEUED' before the job was dispatched. */
  state: string;
  index: number;
  /** 0..1 through the phase. 1 for the terminal state. */
  progress: number;
}

export function phaseAt(timeline: MoveTimeline, t: number): PhaseAt {
  const index = timeline.phases.findLastIndex((phase) => phase.from <= t);
  if (index < 0) return { state: 'QUEUED', index: -1, progress: 0 };

  const phase = timeline.phases[index];
  const span = phase.to - phase.from;
  const progress = Number.isFinite(span) && span > 0 ? Math.min(1, (t - phase.from) / span) : 1;

  return { state: phase.state, index, progress };
}

/** Premium seconds held by `t`: zero before allocation, fixed after release. */
export function premiumHeldBy(timeline: MoveTimeline, t: number): number {
  if (!timeline.premium) return 0;
  const { from, to } = timeline.premium;
  return Math.max(0, Math.min(t, to) - from);
}

/** `12.76` — the log clock. Two decimals, because two of the gaps that matter are 0.14 s wide. */
export function stamp(seconds: number): string {
  return seconds.toFixed(2);
}

/** `12.3 s` — for prose, where a second decimal is noise. */
export function spoken(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}
