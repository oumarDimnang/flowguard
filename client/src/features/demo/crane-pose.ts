import { phaseAt, type MoveTimeline } from './timeline';

/**
 * Where everything in the crane scene is, in scene units (viewBox 1000 × 600).
 *
 * A cross-section across the quay, the way crane drawings are made: the vessel
 * on the water to the left, the crane's legs on the quay, the boom spanning
 * both, the truck lane under the backreach, the cell mast on the right.
 * Containers are seen end-on, in rows across the vessel's beam.
 */
export const SCENE = {
  width: 1000,
  height: 600,

  quayEdge: 400,
  quayY: 470,
  waterY: 488,

  legs: [450, 650] as const,
  boom: { from: 36, to: 820, top: 170, bottom: 180 },
  apex: { x: 540, y: 96 },
  modem: { x: 720, y: 126 },

  deckY: 430,
  container: { w: 40, h: 26 },
  rowPitch: 42,
  firstRowX: 36,

  walkway: { from: 500, to: 600 },
  truck: { x: 774, bedY: 444 },
  mast: { x: 930, top: 232, antennaY: 244 },

  /** Spreader bottom while travelling empty. */
  spreaderUp: 232,
  /** Carried container's top while crossing — clears the tallest stack. */
  clearTop: 262,
  /** Trolley parked between the legs. */
  parkX: 560,
} as const;

/**
 * Rows across the vessel's beam, seaward first, numbered the way a bay plan
 * numbers them for a ship moored port side to: odd rows starboard, even rows
 * port, rising away from the centreline. So row 06 sits nearer the quay than
 * row 04.
 */
export const ROWS = ['07', '05', '03', '01', '02', '04', '06', '08'] as const;

/** Containers per row on deck, before either recorded move lifted anything. */
const STACKS: Record<(typeof ROWS)[number], number> = {
  '07': 3,
  '05': 4,
  '03': 3,
  '01': 4,
  '02': 3,
  '04': 1,
  '06': 2,
  '08': 3,
};

/** Tier numbers on deck start at 82 and rise in twos. */
const tierIndex = (tier: string) => (Number.parseInt(tier, 10) - 82) / 2;

export function rowCentre(row: string): number {
  const index = ROWS.indexOf(row as (typeof ROWS)[number]);
  return SCENE.firstRowX + index * SCENE.rowPitch + SCENE.container.w / 2;
}

export function tierTop(tier: string): number {
  return SCENE.deckY - (tierIndex(tier) + 1) * SCENE.container.h;
}

/** `BAY 22 ROW 06 TIER 84` → where that box sits in the drawing. */
export function slotOf(location: string): { row: string; tier: string; x: number; top: number } {
  const row = /ROW (\d+)/.exec(location)?.[1] ?? '06';
  const tier = /TIER (\d+)/.exec(location)?.[1] ?? '84';
  return { row, tier, x: rowCentre(row), top: tierTop(tier) };
}

/**
 * The deck as it stood at a given moment.
 *
 * The routine move lifted row 04's only box, so by the time the critical move
 * runs that row is empty. Drawing it full during the replay of the later move
 * would be a small lie about a thing nobody would check, which is the kind
 * this page is careful not to tell.
 */
export function stacksFor(lifted: readonly string[]): { row: string; height: number }[] {
  return ROWS.map((row) => ({
    row,
    height: STACKS[row] - lifted.filter((location) => slotOf(location).row === row).length,
  }));
}

export interface Pose {
  trolleyX: number;
  /** The spreader's underside. The carried box hangs from here. */
  spreaderY: number;
  carrying: boolean;
  locked: boolean;
  /** 1 while the crane is still travelling to the bay, 0 once it is there. */
  bayShift: number;
  /** Degrees. Only a halted load swings. */
  sway: number;
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Share of HOISTING spent lifting clear before the trolley starts across. */
const LIFT_SHARE = 0.3;

/**
 * The crane at recorded time `t`.
 *
 * Driven by the recorded state changes and nothing else: which state the job
 * was in, and how far through it. The motion inside a state is drawn, the
 * boundaries between states are the recording's own.
 */
export function poseAt(timeline: MoveTimeline, t: number): Pose {
  const { state, progress } = phaseAt(timeline, t);
  const slot = slotOf(timeline.move.job.from);
  const { truck, container, spreaderUp, clearTop, parkX } = SCENE;
  const truckTop = truck.bedY - container.h;

  const at = (pose: Partial<Pose>): Pose => ({
    trolleyX: parkX,
    spreaderY: spreaderUp,
    carrying: false,
    locked: false,
    bayShift: 0,
    sway: 0,
    ...pose,
  });

  switch (state) {
    case 'QUEUED':
      return at({ bayShift: 1 });
    case 'GANTRY':
      return at({ bayShift: 1 - ease(progress) });
    case 'TROLLEY':
      return at({ trolleyX: lerp(parkX, slot.x, ease(progress)) });
    case 'SPREADER':
      return at({ trolleyX: slot.x, spreaderY: lerp(spreaderUp, slot.top, ease(progress)) });
    case 'TWISTLOCK':
      return at({ trolleyX: slot.x, spreaderY: slot.top, locked: true });
    case 'HOISTING': {
      if (progress < LIFT_SHARE) {
        const p = ease(progress / LIFT_SHARE);
        return at({ trolleyX: slot.x, spreaderY: lerp(slot.top, clearTop, p), carrying: true, locked: true });
      }
      const p = ease((progress - LIFT_SHARE) / (1 - LIFT_SHARE));
      return at({ trolleyX: lerp(slot.x, truck.x, p), spreaderY: clearTop, carrying: true, locked: true });
    }
    case 'LANDING':
      return at({
        trolleyX: truck.x,
        spreaderY: lerp(clearTop, truckTop, ease(progress)),
        carrying: true,
        locked: true,
      });
    default:
      // RELEASED: the box is down on the truck and the spreader has let go.
      return at({ trolleyX: truck.x, spreaderY: truckTop });
  }
}

/** The illustration's moment of stopping, in seconds into the beat. */
export const ILLUSTRATION_STOP = 4.2;
/** When the feed starts to go, before the stop. */
export const ILLUSTRATION_DEGRADE = 2.6;

/**
 * The problem, drawn rather than recorded.
 *
 * A load crossing the walkway; the feed degrades; the safety system halts the
 * crane over the people it was meant to pass above, and the load swings.
 */
export function illustrationPose(seconds: number): Pose {
  const start = slotOf('BAY 22 ROW 06 TIER 84').x + 20;
  const stopAt = (SCENE.walkway.from + SCENE.walkway.to) / 2 - 10;

  const moving = Math.min(seconds, ILLUSTRATION_STOP) / ILLUSTRATION_STOP;
  // Decelerating into the stop, the way an e-stop brakes a trolley.
  const trolleyX = lerp(start, stopAt, 1 - (1 - moving) ** 2);

  const since = seconds - ILLUSTRATION_STOP;
  const sway = since > 0 ? 4 * Math.exp(-since / 2.4) * Math.sin((2 * Math.PI * since) / 1.7) : 0;

  return {
    trolleyX,
    spreaderY: SCENE.clearTop,
    carrying: true,
    locked: true,
    bayShift: 0,
    sway,
  };
}
