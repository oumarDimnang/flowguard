import { POLICY_RULES } from '@/features/policy/rules';
import { confidence, tonnes } from '@/lib/format';
import { DecisionStep } from '@/types';
import { spoken, stamp, stepOf, type MoveTimeline } from './timeline';

/**
 * The demo's script.
 *
 * Ten beats. The first is an illustration of the problem and says so; the
 * other nine replay two recorded moves. Each replayed beat covers a window of
 * recorded time, and every number its narration quotes is read from the
 * recording rather than typed in — regenerate the recording and the sentences
 * follow it.
 */

export type BeatId =
  | 'problem'
  | 'job'
  | 'network'
  | 'reasoning'
  | 'rule'
  | 'protect'
  | 'lift'
  | 'landing'
  | 'release'
  | 'contrast';

/**
 * Messages moving between the systems drawn along the top of the scene.
 *
 *   job       terminal system → FlowGuard, the job instruction
 *   read      FlowGuard ⇄ Nokia, a read-only CAMARA call
 *   write     FlowGuard → Nokia → the cell, an allocation or a release
 *   status    Nokia → FlowGuard, the QoD session changing state
 *   complete  terminal system → FlowGuard, the move is done
 */
export type Flow = 'job' | 'read' | 'write' | 'status' | 'complete';

export type BeatSource = 'illustration' | 'critical' | 'routine';

export interface Beat {
  id: BeatId;
  /** One word, for the step strip. */
  label: string;
  title: string;
  body: string;
  /** Printed above the title when the beat is not a replay. */
  tag?: string;
  /** Playback length. */
  ms: number;
  source: BeatSource;
  /** Recorded seconds the beat plays through. Absent for the illustration. */
  window?: readonly [number, number];
  /**
   * Fraction of the beat spent holding on the window's last instant — reading
   * time for whatever just landed. The clock stops rather than crawling.
   */
  dwell?: number;
  flows: readonly Flow[];
}

/** The twistlock's patience. facility-system.base.ts, GATE_TIMEOUT_MS. */
export const GATE_SECONDS = 30;

/** What an IMDG class means, for the one this recording carries. */
const IMDG_CLASSES: Record<string, string> = {
  '3': 'flammable liquids',
};

export function scriptFor(critical: MoveTimeline, routine: MoveTimeline): Beat[] {
  const job = critical.move.job;
  const container = job.attributes;
  const device = job.assetId;

  const at = (step: DecisionStep) => stepOf(critical, step)?.at ?? 0;
  const phaseFrom = (state: string) =>
    critical.phases.find((phase) => phase.state === state)?.from ?? 0;

  const congested = stepOf(critical, DecisionStep.CONGESTION_CHECKED)?.record.congestion ?? '—';
  const assessed = stepOf(critical, DecisionStep.CRITICALITY_ASSESSED)?.record;
  const decided = stepOf(critical, DecisionStep.DECIDED)?.record;
  const rule = POLICY_RULES.find((candidate) => candidate.id === decided?.rule);

  const hoist = phaseFrom('HOISTING');
  const landing = phaseFrom('LANDING');
  const allocated = at(DecisionStep.ALLOCATED);
  const qos = at(DecisionStep.QOS_STATUS_CHANGED);
  const released = at(DecisionStep.RELEASED);
  const gateWait = critical.gate ? critical.gate.to - critical.gate.from : 0;
  const premium = critical.premium ? critical.premium.to - critical.premium.from : 0;
  const stops = critical.move.transitions.filter((change) => change.state === 'HELD').length;

  const routineDecided = stepOf(routine, DecisionStep.DECIDED)?.record;
  const routineAssessed = stepOf(routine, DecisionStep.CRITICALITY_ASSESSED)?.record;

  const cargo = container.imdgClass
    ? `${IMDG_CLASSES[container.imdgClass] ?? 'dangerous goods'} (IMDG class ${container.imdgClass})`
    : 'cargo';

  return [
    {
      id: 'problem',
      label: 'Problem',
      tag: 'Illustration · without FlowGuard',
      title: 'Cranes stop when the network gets busy',
      body:
        'A remote-operated crane is driven over a live video uplink on a shared 5G cell. When ' +
        'the cell congests, the feed degrades — and the crane’s safety system stops it, even ' +
        'with a load in the air.',
      ms: 9_000,
      source: 'illustration',
      flows: [],
    },
    {
      id: 'job',
      label: 'Job',
      title: 'The terminal issues a job',
      body:
        `Move ${container.containerId}: ${tonnes(container.grossWeightKg)} of ${cargo}, on a ` +
        `path across an active walkway. FlowGuard receives it as a business event and starts a ` +
        'workflow for it.',
      ms: 6_500,
      source: 'critical',
      window: [0, 0],
      flows: ['job'],
    },
    {
      id: 'network',
      label: 'Network',
      title: 'FlowGuard reads the network',
      body:
        `Is ${device} on the network? Yes. How busy is its cell? ${congested}. Two read-only ` +
        'CAMARA calls, while the crane starts moving into position.',
      ms: 6_500,
      source: 'critical',
      window: [0, at(DecisionStep.CONGESTION_CHECKED) + 0.4],
      dwell: 0.4,
      flows: ['read'],
    },
    {
      id: 'reasoning',
      label: 'Reasoning',
      title: 'The agent judges what the work means',
      body:
        `It rates the lift ${assessed?.criticality ?? '—'} at ` +
        `${confidence(assessed?.criticalityConfidence)} confidence — and before committing, ` +
        `it chose on its own to check that ${device} really is at the berth. Meanwhile the ` +
        'crane keeps positioning.',
      ms: 13_000,
      source: 'critical',
      window: [at(DecisionStep.CONGESTION_CHECKED) + 0.4, at(DecisionStep.CRITICALITY_ASSESSED)],
      dwell: 0.22,
      flows: ['read'],
    },
    {
      id: 'rule',
      label: 'Rule',
      title: 'A rule decides, not the model',
      body:
        `${decided?.rule ?? 'A rule'} fired${rule ? `: ${rule.when}` : ''}. So FlowGuard asks ` +
        'for Quality on Demand and a network slice. The model cannot touch the network — every ' +
        'tool it has is read-only.',
      ms: 7_000,
      source: 'critical',
      window: [at(DecisionStep.CRITICALITY_ASSESSED), at(DecisionStep.DECIDED) + 0.02],
      dwell: 0.65,
      flows: [],
    },
    {
      id: 'protect',
      label: 'Protect',
      title: 'Protected before the load leaves the ground',
      body:
        `The session is requested and ${device} is attached to a slice at t+${stamp(allocated)} s. ` +
        `The hoist is authorised ${(hoist - allocated).toFixed(2)} s later. The twistlock waited ` +
        `${spoken(gateWait)} for the decision, of the ${GATE_SECONDS} s it allows.`,
      ms: 7_000,
      source: 'critical',
      window: [at(DecisionStep.DECIDED) + 0.02, hoist + 0.1],
      dwell: 0.4,
      flows: ['write'],
    },
    {
      id: 'lift',
      label: 'Lift',
      title: 'The load crosses the walkway',
      body:
        'The cell is still congested for every other device on it. The crane is on its own ' +
        'slice, so the operator’s feed is not competing with them for the air.',
      ms: 11_000,
      source: 'critical',
      window: [hoist + 0.1, landing],
      flows: [],
    },
    {
      id: 'landing',
      label: 'Landing',
      title: stops === 0 ? 'Landed. No stops.' : `Landed after ${stops} stop${stops === 1 ? '' : 's'}.`,
      body:
        `Set down for ${job.to}${stops === 0 ? ' without a single stop' : ''}. Quality on ` +
        'Demand confirmed AVAILABLE on the way down.',
      ms: 6_500,
      source: 'critical',
      window: [landing, qos + 0.3],
      dwell: 0.3,
      flows: ['status'],
    },
    {
      id: 'release',
      label: 'Release',
      title: 'Released the moment it was done',
      body:
        'The terminal reports the move complete, and FlowGuard deletes the session and detaches ' +
        `the slice. Premium connectivity was held for ${spoken(premium)} — not the whole shift.`,
      ms: 7_500,
      source: 'critical',
      window: [qos + 0.3, released + 0.25],
      dwell: 0.5,
      flows: ['complete', 'write'],
    },
    {
      id: 'contrast',
      label: 'Contrast',
      title: 'Same crane. Same congestion. Nothing spent.',
      body:
        `Just before, ${routine.move.job.assetId} moved an empty container through the same ` +
        `${congested}-congestion cell. Rated ${routineAssessed?.criticality ?? '—'}, rule ` +
        `${routineDecided?.rule ?? '—'}: nothing allocated. Criticality triggers action — ` +
        'congestion never does on its own.',
      ms: 10_000,
      source: 'routine',
      window: [0, routine.end + 0.2],
      dwell: 0.3,
      flows: ['job', 'read'],
    },
  ];
}

// ── Playback position → what is on screen ───────────────────────────

export interface Frame {
  index: number;
  beat: Beat;
  /** 0..1 through the beat. */
  local: number;
  /** Milliseconds into the beat. */
  localMs: number;
  /** Recorded seconds, for replayed beats. */
  t?: number;
  /**
   * Recorded seconds per second of playback, while the clock is moving.
   * Absent while holding for reading or for the illustration.
   */
  speed?: number;
}

/** Where each beat starts, in playback milliseconds. */
export function beatStarts(beats: readonly Beat[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const beat of beats) {
    starts.push(cursor);
    cursor += beat.ms;
  }
  return starts;
}

export function frameAt(beats: readonly Beat[], starts: readonly number[], position: number): Frame {
  let index = starts.findLastIndex((start) => start <= position);
  if (index < 0) index = 0;

  const beat = beats[index];
  const localMs = Math.min(beat.ms, Math.max(0, position - starts[index]));
  const local = beat.ms > 0 ? localMs / beat.ms : 1;

  if (!beat.window) return { index, beat, local, localMs };

  const [from, to] = beat.window;
  const travel = 1 - (beat.dwell ?? 0);
  const along = travel > 0 ? Math.min(1, local / travel) : 1;
  const t = from + (to - from) * along;

  const moving = along < 1 && to > from;
  const speed = moving ? (to - from) / ((beat.ms * travel) / 1000) : undefined;

  return { index, beat, local, localMs, t, speed };
}
