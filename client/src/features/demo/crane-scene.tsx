import { tonnes } from '@/lib/format';
import type { ContainerAttributes, FacilityJob } from '@/types';
import type { Flow } from './beats';
import { ROWS, SCENE, rowCentre, slotOf, stacksFor, type Pose } from './crane-pose';
import { DEVICE_COUNT, type SceneState } from './scene-state';
import { stamp } from './timeline';

export interface CraneSceneProps {
  state: SceneState;
  job: FacilityJob<ContainerAttributes>;
  /** The crane's lifecycle state, for the accessible description. */
  craneState: string;
  flows: readonly Flow[];
  /** Milliseconds into the beat. Paces the message pulses. */
  beatMs: number;
}

/** Other devices on the cell, placed around the mast and the truck lane. */
const DEVICES: readonly (readonly [number, number])[] = [
  [846, 456],
  [866, 463],
  [884, 450],
  [952, 460],
  [968, 449],
  [986, 461],
  [830, 440],
].slice(0, DEVICE_COUNT) as [number, number][];

/**
 * The crane, drawn.
 *
 * A blueprint cross-section: the systems wired along the top, the vessel and
 * the quay below, the crane spanning both. Everything that moves is a function
 * of the scene state, which is a function of the playback clock — this
 * component keeps no state of its own.
 */
export function CraneScene({ state, job, craneState, flows, beatMs }: CraneSceneProps) {
  const { pose } = state;
  const { container, truck } = SCENE;
  const box = job.attributes;
  const slot = slotOf(job.from);

  const description =
    state.source === 'illustration'
      ? state.halted
        ? 'Illustration: the crane has emergency-stopped with its load hanging over the walkway.'
        : 'Illustration: a crane carrying a load toward the walkway on a congested cell.'
      : `${job.assetId}, ${craneState.toLowerCase()}, ` +
        (state.link === 'protected' ? 'on a protected network slice.' : 'on standard connectivity.');

  const caption: [string, string] = [
    box.containerId,
    state.empty
      ? `${tonnes(box.grossWeightKg)} · empty`
      : [tonnes(box.grossWeightKg), box.imdgClass ? `IMDG ${box.imdgClass}` : undefined]
          .filter(Boolean)
          .join(' · '),
  ];

  return (
    <svg
      viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={description}
    >
      <defs>
        <pattern id="ds-walkway" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0" className="ds-ink" />
        </pattern>
        <pattern id="ds-quay" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 14 L14 0" className="ds-hair" />
        </pattern>
      </defs>

      <Systems absent={state.source === 'illustration'} flows={flows} beatMs={beatMs} />

      <Ground />
      <Vessel
        stacks={stacksFor(state.lifted)}
        targetRow={pose.carrying || state.landed ? undefined : slot.row}
        empty={state.empty}
      />
      <Walkway />
      <Truck />
      <Cell state={state} />
      <CraneLink state={state} />
      <Crane pose={pose} gantry={state.source !== 'illustration' && craneState === 'GANTRY'} />

      {state.landed ? (
        <Box x={truck.x} top={truck.bedY - container.h} empty={state.empty} imdg={box.imdgClass} />
      ) : null}

      <Hanging pose={pose} empty={state.empty} imdg={box.imdgClass} caption={caption} />

      <Annotations state={state} />
    </svg>
  );
}

// ── The systems above the quay ───────────────────────────────────────

const WIRE_Y = 30;
const TERMINAL_END = 172;
const FLOWGUARD = { left: 398, right: 606 };
const NOKIA_LEFT = 776;
const NOKIA_DROP = { x: SCENE.mast.x, from: 62, to: SCENE.mast.top - 4 };

/** How long a message takes to cross a link, in playback milliseconds. */
const PULSE_MS = 1_300;

/**
 * Who talks to whom, drawn as wiring above the drawing.
 *
 * The terminal system issues the job to FlowGuard; FlowGuard reads and writes
 * the network through Nokia's CAMARA APIs; Nokia programs the cell. Messages
 * crossing a link are pulses paced by the playback clock, so they stop when
 * the story does.
 */
function Systems({ absent, flows, beatMs }: { absent: boolean; flows: readonly Flow[]; beatMs: number }) {
  const active = new Set(flows);
  const phase = (offset = 0) => (((beatMs / PULSE_MS + offset) % 1) + 1) % 1;

  const jobLine = active.has('job') || active.has('complete');
  const readLine = active.has('read') || active.has('status');
  const writeLine = active.has('write');

  const left: [number, number] = [TERMINAL_END, WIRE_Y];
  const fgIn: [number, number] = [FLOWGUARD.left, WIRE_Y];
  const fgOut: [number, number] = [FLOWGUARD.right, WIRE_Y];
  const nokiaIn: [number, number] = [NOKIA_LEFT, WIRE_Y];
  const dropTop: [number, number] = [NOKIA_DROP.x, NOKIA_DROP.from];
  const dropFoot: [number, number] = [NOKIA_DROP.x, NOKIA_DROP.to];

  return (
    <g>
      <Node x={20} label="TERMINAL SYSTEM" detail="issues job instructions" />

      <g opacity={absent ? 0.5 : 1}>
        <Node
          x={FLOWGUARD.left + 12}
          label="FLOWGUARD"
          detail={absent ? 'not in this picture' : 'workflow · agent · rules'}
          accent={!absent}
          struck={absent}
        />
      </g>

      <Node x={NOKIA_LEFT + 8} label="NOKIA NETWORK AS CODE" detail="CAMARA APIs · mock provider" />

      <Wire from={left} to={fgIn} className={jobLine ? 'ds-ink' : 'ds-hair'} dashed={absent} />
      <Wire
        from={fgOut}
        to={nokiaIn}
        className={writeLine ? 'ds-accent' : readLine ? 'ds-ink' : 'ds-hair'}
        dashed={absent}
      />
      <Wire from={dropTop} to={dropFoot} className={writeLine ? 'ds-accent' : 'ds-hair'} />

      {jobLine ? <Pulse from={left} to={fgIn} p={phase()} /> : null}
      {active.has('read') ? (
        <>
          <Pulse from={fgOut} to={nokiaIn} p={phase()} />
          <Pulse from={nokiaIn} to={fgOut} p={phase(0.5)} />
        </>
      ) : null}
      {active.has('status') ? <Pulse from={nokiaIn} to={fgOut} p={phase()} accent /> : null}
      {writeLine ? (
        <>
          <Pulse from={fgOut} to={nokiaIn} p={phase()} accent />
          <Pulse from={dropTop} to={dropFoot} p={phase(0.5)} accent />
        </>
      ) : null}
    </g>
  );
}

function Node({
  x,
  label,
  detail,
  accent,
  struck,
}: {
  x: number;
  label: string;
  detail: string;
  accent?: boolean;
  struck?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={WIRE_Y - 5}
        width={9}
        height={9}
        className={accent ? 'ds-accent' : 'ds-ink'}
        fill={struck ? 'none' : accent ? 'var(--primary)' : 'var(--foreground)'}
      />
      {struck ? <path d={`M${x} ${WIRE_Y + 4} L${x + 9} ${WIRE_Y - 5}`} className="ds-ink" /> : null}
      <text x={x + 16} y={WIRE_Y + 4} fontSize={15} className={accent ? 'ds-accent-text' : undefined}>
        {label}
      </text>
      <text x={x + 16} y={WIRE_Y + 23} fontSize={12.5} className="ds-muted">
        {detail}
      </text>
    </g>
  );
}

function Wire({
  from,
  to,
  className,
  dashed,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  className: string;
  dashed?: boolean;
}) {
  return (
    <line
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      className={className}
      strokeDasharray={dashed ? '2 4' : undefined}
    />
  );
}

function Pulse({
  from,
  to,
  p,
  accent,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  p: number;
  accent?: boolean;
}) {
  // Fades at both ends so a message never pops into existence mid-wire.
  const opacity = Math.min(1, p * 6, (1 - p) * 6);

  return (
    <circle
      cx={from[0] + (to[0] - from[0]) * p}
      cy={from[1] + (to[1] - from[1]) * p}
      r={4.5}
      fill={accent ? 'var(--primary)' : 'var(--foreground)'}
      stroke="none"
      opacity={opacity}
    />
  );
}

// ── Ground, water, vessel ────────────────────────────────────────────

function Ground() {
  const { quayEdge, quayY, waterY, width, height } = SCENE;

  return (
    <g>
      <rect x={0} y={waterY} width={quayEdge} height={height - waterY} fill="var(--ds-water)" />
      {[waterY + 18, waterY + 40, waterY + 64].map((y, i) => (
        <path
          key={y}
          d={`M${18 + i * 26} ${y} q 12 -4 24 0 t 24 0 M${190 + i * 34} ${y + 7} q 12 -4 24 0 t 24 0`}
          className="ds-hair"
        />
      ))}

      <rect x={quayEdge} y={quayY} width={width - quayEdge} height={height - quayY} fill="var(--ds-quay)" />
      <rect x={quayEdge} y={quayY} width={width - quayEdge} height={height - quayY} fill="url(#ds-quay)" />
      <path d={`M${quayEdge} ${height} L${quayEdge} ${quayY} L${width} ${quayY}`} className="ds-ink" strokeWidth={1.5} />
    </g>
  );
}

function Vessel({
  stacks,
  targetRow,
  empty,
}: {
  stacks: { row: string; height: number }[];
  /** The row whose top box is the one being moved, while it is still aboard. */
  targetRow?: string;
  empty: boolean;
}) {
  const { deckY, waterY, container } = SCENE;

  return (
    <g>
      <path
        d={`M24 ${deckY} L394 ${deckY} L388 468 L374 522 L46 522 L30 468 Z`}
        fill="var(--background)"
        className="ds-ink"
        strokeWidth={1.25}
      />
      {/* Below the waterline the hull is seen through the water. */}
      <rect x={24} y={waterY} width={372} height={40} fill="var(--ds-water)" opacity={0.75} />
      <line x1={24} y1={deckY + 6} x2={394} y2={deckY + 6} className="ds-hair" />

      {stacks.map(({ row, height }) =>
        Array.from({ length: height }, (_, tier) => {
          const isTarget = row === targetRow && tier === height - 1;
          return (
            <Box
              key={`${row}-${tier}`}
              x={rowCentre(row)}
              top={deckY - (tier + 1) * container.h}
              quiet={!isTarget}
              empty={isTarget && empty}
            />
          );
        }),
      )}

      {ROWS.map((row) => (
        <text
          key={row}
          x={rowCentre(row)}
          y={deckY + 20}
          fontSize={11}
          textAnchor="middle"
          className={row === targetRow ? undefined : 'ds-muted'}
        >
          {row}
        </text>
      ))}
      <text x={209} y={waterY - 7} fontSize={13} textAnchor="middle" className="ds-muted">
        MV GULF TRADER · BAY 22
      </text>
    </g>
  );
}

/** A container seen end-on: doors, locking bars, and the IMDG placard if it has one. */
function Box({
  x,
  top,
  quiet,
  empty,
  imdg,
}: {
  x: number;
  top: number;
  quiet?: boolean;
  empty?: boolean;
  imdg?: string;
}) {
  const { w, h } = SCENE.container;
  const left = x - w / 2;

  return (
    <g>
      <rect
        x={left + 0.5}
        y={top + 0.5}
        width={w - 1}
        height={h - 1}
        fill={empty ? 'var(--background)' : quiet ? 'var(--ds-box)' : 'var(--ds-box-strong)'}
        className={quiet ? 'ds-hair' : 'ds-ink'}
        strokeDasharray={empty ? '3 2' : undefined}
      />
      {quiet ? null : (
        <>
          <line x1={x} y1={top + 3} x2={x} y2={top + h - 3} className="ds-ink" />
          <line x1={left + 9} y1={top + 4} x2={left + 9} y2={top + h - 4} className="ds-hair" />
          <line x1={left + w - 9} y1={top + 4} x2={left + w - 9} y2={top + h - 4} className="ds-hair" />
        </>
      )}
      {imdg && !empty ? (
        <rect
          x={-3.5}
          y={-3.5}
          width={7}
          height={7}
          className="ds-danger"
          fill="var(--background)"
          transform={`translate(${left + w - 7} ${top + 8}) rotate(45)`}
        />
      ) : null}
    </g>
  );
}

// ── Quay furniture ───────────────────────────────────────────────────

function Walkway() {
  const { walkway, quayY } = SCENE;
  const mid = (walkway.from + walkway.to) / 2;

  return (
    <g>
      <rect
        x={walkway.from}
        y={quayY}
        width={walkway.to - walkway.from}
        height={9}
        fill="url(#ds-walkway)"
        opacity={0.55}
      />
      <Person x={mid - 20} />
      <Person x={mid + 16} />
      <line x1={mid} y1={quayY + 13} x2={mid} y2={quayY + 23} className="ds-ink" />
      <text x={mid} y={quayY + 38} fontSize={13} textAnchor="middle">
        ACTIVE WALKWAY
      </text>
    </g>
  );
}

function Person({ x }: { x: number }) {
  const y = SCENE.quayY;
  return (
    <g className="ds-ink" strokeWidth={1.25}>
      <circle cx={x} cy={y - 21} r={3.2} fill="var(--foreground)" stroke="none" />
      <line x1={x} y1={y - 17} x2={x} y2={y - 8} />
      <line x1={x} y1={y - 8} x2={x - 4} y2={y} />
      <line x1={x} y1={y - 8} x2={x + 4} y2={y} />
      <line x1={x - 5} y1={y - 14} x2={x + 5} y2={y - 14} />
    </g>
  );
}

function Truck() {
  const { truck, quayY } = SCENE;
  const bed = truck.bedY;

  return (
    <g>
      <rect x={truck.x - 32} y={bed} width={64} height={5} fill="var(--foreground)" stroke="none" />
      <circle cx={truck.x - 22} cy={bed + 13} r={5.5} className="ds-ink" fill="var(--background)" />
      <circle cx={truck.x + 22} cy={bed + 13} r={5.5} className="ds-ink" fill="var(--background)" />
      <rect x={truck.x + 36} y={bed - 16} width={26} height={26} className="ds-ink" fill="var(--background)" />
      <rect x={truck.x + 48} y={bed - 12} width={10} height={9} className="ds-hair" />
      <circle cx={truck.x + 50} cy={bed + 14} r={5.5} className="ds-ink" fill="var(--background)" />
      <line x1={truck.x} y1={quayY + 13} x2={truck.x} y2={quayY + 23} className="ds-ink" />
      <text x={truck.x} y={quayY + 38} fontSize={13} textAnchor="middle">
        TRUCK → YARD
      </text>
    </g>
  );
}

// ── The cell ─────────────────────────────────────────────────────────

function Cell({ state }: { state: SceneState }) {
  const { mast, quayY } = SCENE;
  const cx = mast.x;
  const cy = mast.antennaY;
  const half = (at: number) => 3 + (5 * (at - mast.top)) / (quayY - mast.top);

  return (
    <g>
      {/* Every other device on the cell, each taking its share of the air. */}
      {DEVICES.slice(0, state.devices).map(([x, y], i) => (
        <g key={`${x}-${y}`} className="ds-flicker" style={{ animationDelay: `${(i * 0.37) % 1.7}s` }}>
          <line x1={x} y1={y} x2={cx - 2} y2={cy + 6} className="ds-hair ds-flow" />
          <rect x={x - 3} y={y - 3} width={6} height={6} fill="var(--muted-foreground)" stroke="none" />
        </g>
      ))}

      {/* Mast: two legs tapering to the head, braced across */}
      <path
        d={`M${cx - 8} ${quayY} L${cx - 3} ${mast.top} L${cx + 3} ${mast.top} L${cx + 8} ${quayY}`}
        className="ds-ink"
      />
      {[296, 336, 376, 416, 456].map((y) => (
        <line key={y} x1={cx - half(y)} y1={y} x2={cx + half(y - 34)} y2={y - 34} className="ds-hair" />
      ))}
      <rect x={cx - 12} y={mast.top + 2} width={5} height={18} className="ds-ink" fill="var(--background)" />
      <rect x={cx + 7} y={mast.top + 2} width={5} height={18} className="ds-ink" fill="var(--background)" />

      {/* Load on the cell */}
      {[0, 0.8, 1.6].map((delay) => (
        <circle
          key={delay}
          cx={cx}
          cy={cy}
          r={48}
          className="ds-ring ds-dim"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      <text x={cx - 22} y={mast.top + 74} fontSize={13} textAnchor="end">
        5G CELL
      </text>
      <text
        x={cx - 22}
        y={mast.top + 92}
        fontSize={13}
        textAnchor="end"
        className={state.congestion ? undefined : 'ds-muted'}
      >
        {state.congestion ? `CONGESTION ${state.congestion.level.toUpperCase()}` : 'shared · busy'}
      </text>
      {state.congestion ? (
        <text x={cx - 22} y={mast.top + 108} fontSize={11} textAnchor="end" className="ds-muted">
          read at t+{stamp(state.congestion.at)} s
        </text>
      ) : null}
    </g>
  );
}

/** The crane's own link to the cell — the thing the whole product exists to protect. */
function CraneLink({ state }: { state: SceneState }) {
  const { modem, mast } = SCENE;
  const end = { x: mast.x - 9, y: mast.antennaY - 2 };
  const mid = { x: (modem.x + end.x) / 2, y: (modem.y + end.y) / 2 };
  const angle = (Math.atan2(end.y - modem.y, end.x - modem.x) * 180) / Math.PI;

  if (state.link === 'protected') {
    return (
      <g>
        <line x1={modem.x} y1={modem.y} x2={end.x} y2={end.y} className="ds-accent" strokeWidth={2.5} />
        <text
          x={mid.x}
          y={mid.y - 9}
          fontSize={12}
          textAnchor="middle"
          className="ds-accent-text"
          transform={`rotate(${angle} ${mid.x} ${mid.y - 9})`}
        >
          {state.sliceId ? `SLICE ${state.sliceId}` : 'SLICE'}
        </text>
      </g>
    );
  }

  if (state.link === 'lost') {
    return (
      <g>
        <line x1={modem.x} y1={modem.y} x2={mid.x - 10} y2={mid.y - 6} className="ds-danger" strokeDasharray="3 5" />
        <line x1={mid.x + 10} y1={mid.y + 6} x2={end.x} y2={end.y} className="ds-danger" strokeDasharray="3 5" />
        <path d={`M${mid.x - 6} ${mid.y - 6} l12 12 M${mid.x + 6} ${mid.y - 6} l-12 12`} className="ds-danger" strokeWidth={2} />
      </g>
    );
  }

  return (
    <line
      x1={modem.x}
      y1={modem.y}
      x2={end.x}
      y2={end.y}
      className={state.link === 'degrading' ? 'ds-danger ds-flow' : 'ds-dim ds-flow'}
      strokeWidth={1.25}
    />
  );
}

// ── The crane ────────────────────────────────────────────────────────

function Crane({ pose, gantry }: { pose: Pose; gantry: boolean }) {
  const { legs, boom, apex, modem, quayY } = SCENE;

  return (
    <g>
      {legs.map((x) => (
        <g key={x}>
          <rect
            x={x - 4}
            y={boom.bottom}
            width={8}
            height={quayY - boom.bottom - 9}
            className="ds-ink"
            fill="var(--background)"
          />
          <rect x={x - 16} y={quayY - 9} width={32} height={6} className="ds-ink" fill="var(--background)" />
          <circle cx={x - 9} cy={quayY - 2} r={2.5} fill="var(--foreground)" stroke="none" />
          <circle cx={x + 9} cy={quayY - 2} r={2.5} fill="var(--foreground)" stroke="none" />
        </g>
      ))}

      <rect
        x={boom.from}
        y={boom.top}
        width={boom.to - boom.from}
        height={boom.bottom - boom.top}
        className="ds-ink"
        fill="var(--background)"
      />
      {Array.from({ length: Math.floor((boom.to - boom.from) / 20) }, (_, i) => {
        const x = boom.from + i * 20;
        return <line key={x} x1={x} y1={boom.bottom} x2={x + 10} y2={boom.top} className="ds-hair" />;
      })}

      <path
        d={`M${legs[0]} ${boom.top} L${apex.x} ${apex.y} L${legs[1]} ${boom.top}`}
        className="ds-ink"
        strokeWidth={1.5}
      />
      <line x1={apex.x} y1={apex.y} x2={boom.from + 6} y2={boom.top} className="ds-ink" />
      <line x1={apex.x} y1={apex.y} x2={boom.to - 6} y2={boom.top} className="ds-ink" />

      {/* Machinery house, and the modem everything else here is about */}
      <rect x={660} y={boom.top - 22} width={80} height={22} className="ds-ink" fill="var(--background)" />
      <text x={700} y={boom.top - 7} fontSize={12} textAnchor="middle">
        CRANE-A
      </text>
      <line x1={modem.x} y1={boom.top - 22} x2={modem.x} y2={modem.y + 3} className="ds-ink" />
      <circle cx={modem.x} cy={modem.y} r={3.5} fill="var(--foreground)" stroke="none" />

      {gantry ? (
        <text x={(legs[0] + legs[1]) / 2} y={quayY - 16} fontSize={12} textAnchor="middle" className="ds-muted">
          gantry travel → bay 22
        </text>
      ) : null}

      <rect x={pose.trolleyX - 22} y={boom.bottom} width={44} height={12} className="ds-ink" fill="var(--background)" />
      <circle cx={pose.trolleyX - 13} cy={boom.bottom} r={2.2} fill="var(--foreground)" stroke="none" />
      <circle cx={pose.trolleyX + 13} cy={boom.bottom} r={2.2} fill="var(--foreground)" stroke="none" />
    </g>
  );
}

/** Ropes, spreader and whatever it carries — swinging together if the crane stops. */
function Hanging({
  pose,
  empty,
  imdg,
  caption,
}: {
  pose: Pose;
  empty: boolean;
  imdg?: string;
  caption: readonly [string, string];
}) {
  const pivotY = SCENE.boom.bottom + 12;
  const x = pose.trolleyX;
  const y = pose.spreaderY;

  return (
    <g transform={`rotate(${pose.sway} ${x} ${pivotY})`}>
      <line x1={x - 12} y1={pivotY} x2={x - 12} y2={y - 6} className="ds-ink" />
      <line x1={x + 12} y1={pivotY} x2={x + 12} y2={y - 6} className="ds-ink" />
      <rect x={x - 23} y={y - 6} width={46} height={6} className="ds-ink" fill="var(--background)" />
      {[x - 21, x + 17].map((lx) => (
        <rect
          key={lx}
          x={lx}
          y={y - 4}
          width={4}
          height={4}
          fill={pose.locked ? 'var(--foreground)' : 'var(--background)'}
          className="ds-ink"
        />
      ))}

      {pose.carrying ? (
        <>
          <Box x={x} top={y} empty={empty} imdg={imdg} />
          <text x={x + 30} y={y + 11} fontSize={12.5}>
            {caption[0]}
          </text>
          <text x={x + 30} y={y + 25} fontSize={11} className="ds-muted">
            {caption[1]}
          </text>
        </>
      ) : null}
    </g>
  );
}

// ── Callouts that belong to a moment ─────────────────────────────────

function Annotations({ state }: { state: SceneState }) {
  const { pose } = state;
  const x = pose.trolleyX + 30;

  if (state.halted) {
    return (
      <g>
        <text x={x} y={SCENE.boom.bottom + 40} fontSize={14} className="ds-danger-text">
          E-STOP · LINK LOST
        </text>
        <text x={x} y={SCENE.boom.bottom + 56} fontSize={11.5} className="ds-muted">
          load held over the walkway
        </text>
      </g>
    );
  }

  if (state.holding) {
    return (
      <g>
        <text x={x} y={pose.spreaderY - 34} fontSize={12.5}>
          TWISTLOCKS LOCKED
        </text>
        <text x={x} y={pose.spreaderY - 20} fontSize={11} className="ds-muted">
          hoist waits for a decision
        </text>
      </g>
    );
  }

  if (state.authorised) {
    return (
      <text x={x} y={pose.spreaderY - 24} fontSize={12.5} className="ds-accent-text">
        HOIST AUTHORISED
      </text>
    );
  }

  if (state.qos) {
    return (
      <text x={SCENE.modem.x + 12} y={SCENE.modem.y - 8} fontSize={12} className="ds-accent-text">
        QoD {state.qos}
      </text>
    );
  }

  return null;
}
