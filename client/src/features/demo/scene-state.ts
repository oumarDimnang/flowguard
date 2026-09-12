import { DecisionStep, type QosStatus } from '@/types';
import type { BeatSource } from './beats';
import {
  ILLUSTRATION_DEGRADE,
  ILLUSTRATION_STOP,
  illustrationPose,
  poseAt,
  type Pose,
} from './crane-pose';
import { phaseAt, stepsBy, type MoveTimeline } from './timeline';

export type LinkState = 'standard' | 'protected' | 'degrading' | 'lost';

/**
 * The scene at one instant.
 *
 * Derived once per frame and handed to both the crane drawing and the operator
 * feed, so the two can never disagree about whether the crane is protected.
 */
export interface SceneState {
  source: BeatSource;
  pose: Pose;
  link: LinkState;
  /** 0..1, how far the operator's feed has broken up. */
  degrade: number;
  /** Set once FlowGuard has actually read the cell. */
  congestion?: { level: string; at: number };
  /** How many other devices are on the cell. */
  devices: number;
  qos?: QosStatus;
  sliceId?: string;
  /** At the twistlock, waiting for the decision. */
  holding: boolean;
  /** The instant the hoist was authorised, held briefly so it can be read. */
  authorised: boolean;
  /** Emergency-stopped. Only ever in the illustration. */
  halted: boolean;
  /** Vessel locations whose box is no longer on board. */
  lifted: string[];
  empty: boolean;
  /** The move finished and its box is on the truck. */
  landed: boolean;
}

/** Other devices on the cell: trucks, handhelds, the yard's own cameras. */
export const DEVICE_COUNT = 7;

/**
 * Nothing in the job says "empty". A gross weight no heavier than a box's own
 * tare does — a 20-foot box weighs about 2.3 t with nothing in it.
 */
const EMPTY_BELOW_KG = 4_000;

export interface SceneInput {
  source: BeatSource;
  /** Recorded seconds in a replay; seconds into the beat for the illustration. */
  seconds: number;
  /** The move being replayed. The illustration borrows the critical move's box. */
  timeline: MoveTimeline;
  /** The move before this one, whose box is already off the vessel. */
  earlier?: MoveTimeline;
}

export function deriveSceneState({ source, seconds, timeline, earlier }: SceneInput): SceneState {
  const job = timeline.move.job;
  const earlierLifted = earlier ? [earlier.move.job.from] : [];
  const empty = job.attributes.grossWeightKg < EMPTY_BELOW_KG;

  if (source === 'illustration') {
    const halted = seconds >= ILLUSTRATION_STOP;
    const degrade = Math.min(
      1,
      Math.max(0, (seconds - ILLUSTRATION_DEGRADE) / (ILLUSTRATION_STOP - ILLUSTRATION_DEGRADE)),
    );

    return {
      source,
      pose: illustrationPose(seconds),
      link: seconds < ILLUSTRATION_DEGRADE ? 'standard' : halted ? 'lost' : 'degrading',
      degrade,
      // The cell filling up as the shift changes over.
      devices: Math.min(DEVICE_COUNT, 2 + Math.floor(seconds * 1.6)),
      holding: false,
      authorised: false,
      halted,
      lifted: [...earlierLifted, job.from],
      empty,
      landed: false,
    };
  }

  const reached = stepsBy(timeline, seconds);
  const has = (step: DecisionStep) => reached.some((s) => s.record.step === step);

  const congestion = reached.find((s) => s.record.step === DecisionStep.CONGESTION_CHECKED);
  const qos = [...reached].reverse().find((s) => s.record.qosStatus)?.record.qosStatus;
  const sliceId = reached.find((s) => s.record.sliceId)?.record.sliceId;

  const pose = poseAt(timeline, seconds);
  const { state } = phaseAt(timeline, seconds);
  const landed = state === 'RELEASED';
  const gate = timeline.gate;
  const protectedNow = has(DecisionStep.ALLOCATED) && !has(DecisionStep.RELEASED);

  return {
    source,
    pose,
    link: protectedNow ? 'protected' : 'standard',
    degrade: 0,
    congestion: congestion
      ? { level: congestion.record.congestion ?? '—', at: congestion.at }
      : undefined,
    devices: DEVICE_COUNT,
    qos: protectedNow ? qos : undefined,
    sliceId: protectedNow ? sliceId : undefined,
    holding: state === job.gateState,
    authorised: gate !== undefined && seconds >= gate.to && seconds < gate.to + 0.6,
    halted: false,
    lifted: [
      ...(source === 'critical' ? earlierLifted : []),
      ...(pose.carrying || landed ? [job.from] : []),
    ],
    empty,
    landed,
  };
}
