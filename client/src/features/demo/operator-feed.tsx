import { SCENE, rowCentre, stacksFor } from './crane-pose';
import type { SceneState } from './scene-state';

export interface OperatorFeedProps {
  state: SceneState;
  containerId: string;
  imdg?: string;
  /** Top-right of the frame: the recorded clock, or the illustration's own. */
  clock: string;
  /** Seconds, for the stutter of a failing feed. */
  seconds: number;
}

const W = 240;
const H = 135;
const CX = W / 2;
const CY = H / 2;
/** Feed pixels per scene unit. The camera looks straight down from the trolley. */
const S = 2.2;

/** Deterministic noise, so a broken feed breaks the same way on every replay. */
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43_758.5453;
  return x - Math.floor(x);
};

const BLOCK_COLS = 12;
const BLOCK_ROWS = 7;

/**
 * What the operator sees: the trolley camera, looking down past the spreader.
 *
 * Illustrated, and labelled as such. FlowGuard never measures the video — it
 * has no way to — so this panel shows the consequence the product is built
 * around rather than anything in the recording: a feed that holds when the
 * crane is protected, and one that breaks up and freezes when it is not.
 */
export function OperatorFeed({ state, containerId, imdg, clock, seconds }: OperatorFeedProps) {
  const { pose, link, degrade } = state;
  const toFeed = (x: number) => CX + (x - pose.trolleyX) * S;

  // A failing feed tears sideways a few times a second.
  const tear = degrade > 0.3 && link !== 'lost' ? (noise(Math.floor(seconds * 8)) - 0.5) * 18 * degrade : 0;

  const frameClass =
    link === 'protected' ? 'ds-accent' : link === 'standard' ? 'ds-hair' : 'ds-danger';

  const { container } = SCENE;
  const boxW = container.w * S;

  // The spreader reads larger near the camera and smaller as it lowers away.
  const drop = (pose.spreaderY - SCENE.spreaderUp) / (SCENE.truck.bedY - SCENE.spreaderUp);
  const scale = 1.18 - 0.22 * Math.min(1, Math.max(0, drop));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-auto" role="img" aria-label={feedLabel(state)}>
      <defs>
        <clipPath id="ds-feed-clip">
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        <pattern id="ds-feed-walkway" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect x={0} y={0} width={5} height={10} fill="var(--foreground)" opacity={0.28} />
        </pattern>
        <pattern id="ds-feed-roof" width="6" height="6" patternUnits="userSpaceOnUse">
          <line x1={0} y1={0.5} x2={6} y2={0.5} className="ds-hair" />
        </pattern>
      </defs>

      <g clipPath="url(#ds-feed-clip)">
        {/* The ground below, scrolling as the trolley travels. */}
        <g transform={`translate(${tear} 0)`}>
          <rect x={toFeed(0)} y={0} width={SCENE.quayEdge * S} height={H} fill="var(--ds-water)" />
          <rect x={toFeed(24)} y={0} width={370 * S} height={H} fill="var(--background)" />
          <rect x={toFeed(SCENE.quayEdge)} y={0} width={(SCENE.width - SCENE.quayEdge) * S} height={H} fill="var(--ds-quay)" />
          <line x1={toFeed(SCENE.quayEdge)} y1={0} x2={toFeed(SCENE.quayEdge)} y2={H} className="ds-ink" />

          {stacksFor(state.lifted).map(({ row, height }) => {
            const left = toFeed(rowCentre(row) - container.w / 2);
            return height > 0 ? (
              <g key={row}>
                <rect x={left} y={-2} width={boxW} height={H + 4} fill="var(--ds-box)" className="ds-hair" />
                <rect x={left} y={-2} width={boxW} height={H + 4} fill="url(#ds-feed-roof)" />
              </g>
            ) : (
              <rect key={row} x={left} y={-2} width={boxW} height={H + 4} className="ds-hair" strokeDasharray="3 3" />
            );
          })}

          <rect
            x={toFeed(SCENE.walkway.from)}
            y={0}
            width={(SCENE.walkway.to - SCENE.walkway.from) * S}
            height={H}
            fill="url(#ds-feed-walkway)"
          />
          {[
            [SCENE.walkway.from + 30, 38],
            [SCENE.walkway.from + 66, 96],
          ].map(([x, y]) => (
            <g key={x}>
              <ellipse cx={toFeed(x)} cy={y} rx={7} ry={4} fill="var(--foreground)" opacity={0.35} />
              <circle cx={toFeed(x)} cy={y} r={3.4} fill="var(--foreground)" />
            </g>
          ))}

          <rect
            x={toFeed(SCENE.truck.x - 32)}
            y={14}
            width={64 * S}
            height={H - 28}
            className="ds-ink"
            fill="none"
          />
          <line x1={toFeed(SCENE.truck.x - 32)} y1={CY} x2={toFeed(SCENE.truck.x + 32)} y2={CY} className="ds-hair" />
          {state.landed ? (
            <rect
              x={toFeed(SCENE.truck.x) - boxW / 2}
              y={12}
              width={boxW}
              height={H - 24}
              fill={state.empty ? 'var(--background)' : 'var(--ds-box-strong)'}
              className="ds-ink"
            />
          ) : null}
        </g>

        {/* What hangs below the camera. */}
        <g transform={`translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})`}>
          {pose.carrying ? (
            <g>
              <rect
                x={CX - boxW / 2}
                y={12}
                width={boxW}
                height={H - 24}
                fill={state.empty ? 'var(--background)' : 'var(--ds-box-strong)'}
                className="ds-ink"
                strokeDasharray={state.empty ? '3 2' : undefined}
              />
              <rect x={CX - boxW / 2} y={12} width={boxW} height={H - 24} fill="url(#ds-feed-roof)" />
              <text x={CX} y={CY + 4} fontSize={10.5} textAnchor="middle">
                {containerId}
              </text>
              {imdg && !state.empty ? (
                <rect
                  x={-5}
                  y={-5}
                  width={10}
                  height={10}
                  className="ds-danger"
                  fill="var(--background)"
                  transform={`translate(${CX + boxW / 2 - 12} 24) rotate(45)`}
                />
              ) : null}
            </g>
          ) : null}

          {/* The spreader frame and its four twistlocks. */}
          <rect x={CX - boxW / 2 - 4} y={8} width={boxW + 8} height={H - 16} className="ds-ink" strokeWidth={1.5} />
          {[
            [CX - boxW / 2 - 6, 6],
            [CX + boxW / 2, 6],
            [CX - boxW / 2 - 6, H - 12],
            [CX + boxW / 2, H - 12],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={6}
              height={6}
              fill={pose.locked ? 'var(--foreground)' : 'var(--background)'}
              className="ds-ink"
            />
          ))}
        </g>

        {/* Crosshair */}
        <g className="ds-ink" opacity={0.6}>
          <line x1={CX - 14} y1={CY} x2={CX - 5} y2={CY} />
          <line x1={CX + 5} y1={CY} x2={CX + 14} y2={CY} />
          <line x1={CX} y1={CY - 14} x2={CX} y2={CY - 5} />
          <line x1={CX} y1={CY + 5} x2={CX} y2={CY + 14} />
        </g>

        {/* A breaking feed: blocks where the picture should be. */}
        {degrade > 0
          ? Array.from({ length: BLOCK_COLS * BLOCK_ROWS }, (_, i) => {
              if (noise(i) >= degrade) return null;
              const col = i % BLOCK_COLS;
              const row = Math.floor(i / BLOCK_COLS);
              return (
                <rect
                  key={i}
                  x={(col * W) / BLOCK_COLS}
                  y={(row * H) / BLOCK_ROWS}
                  width={W / BLOCK_COLS + 0.5}
                  height={H / BLOCK_ROWS + 0.5}
                  fill="var(--foreground)"
                  stroke="none"
                  opacity={0.18 + 0.5 * noise(i + 97)}
                />
              );
            })
          : null}

        {link === 'lost' ? (
          <g>
            <rect x={0} y={CY - 15} width={W} height={30} fill="var(--background)" opacity={0.92} />
            <text x={CX} y={CY + 5} fontSize={13} textAnchor="middle" className="ds-danger-text">
              NO SIGNAL · E-STOP
            </text>
          </g>
        ) : null}

        {/* HUD */}
        <rect x={0} y={0} width={W} height={15} fill="var(--background)" opacity={0.85} />
        <text x={6} y={11} fontSize={9}>
          CAM 2 · TROLLEY
        </text>
        <text x={W - 6} y={11} fontSize={9} textAnchor="end" className={link === 'lost' ? 'ds-danger-text' : 'ds-muted'}>
          {clock}
        </text>

        <rect x={0} y={H - 15} width={W} height={15} fill="var(--background)" opacity={0.85} />
        <FeedStatus link={link} />
      </g>

      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} className={frameClass} strokeWidth={link === 'standard' ? 1 : 2} />
    </svg>
  );
}

function FeedStatus({ link }: { link: SceneState['link'] }) {
  const y = H - 4;
  const glyph = (fill: string, className: string) => (
    <rect x={6} y={y - 7} width={7} height={7} fill={fill} className={className} />
  );

  switch (link) {
    case 'protected':
      return (
        <g>
          {glyph('var(--primary)', 'ds-accent')}
          <text x={18} y={y} fontSize={9} className="ds-accent-text">
            PROTECTED · SLICE + QoD
          </text>
        </g>
      );
    case 'degrading':
      return (
        <g>
          {glyph('var(--destructive)', 'ds-danger')}
          <text x={18} y={y} fontSize={9} className="ds-danger-text">
            DEGRADING · CELL CONGESTED
          </text>
        </g>
      );
    case 'lost':
      return (
        <g>
          {glyph('none', 'ds-danger')}
          <path d={`M6 ${y} L13 ${y - 7}`} className="ds-danger" />
          <text x={18} y={y} fontSize={9} className="ds-danger-text">
            LINK LOST
          </text>
        </g>
      );
    default:
      return (
        <g>
          {glyph('none', 'ds-dim')}
          <text x={18} y={y} fontSize={9} className="ds-muted">
            STANDARD CONNECTIVITY
          </text>
        </g>
      );
  }
}

function feedLabel(state: SceneState): string {
  switch (state.link) {
    case 'protected':
      return 'Operator camera feed, illustrated: clear, on a protected slice.';
    case 'degrading':
      return 'Operator camera feed, illustrated: breaking up as the cell congests.';
    case 'lost':
      return 'Operator camera feed, illustrated: frozen, no signal.';
    default:
      return 'Operator camera feed, illustrated: standard connectivity.';
  }
}
