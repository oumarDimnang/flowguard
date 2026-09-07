import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import type { DecisionGraph, GraphEdge, GraphNode } from './graph-model';
import { GraphInspector } from './graph-inspector';
import { starfield, useOrbit } from './use-orbit';

/**
 * Sphere fills, resolved from the theme rather than hardcoded.
 *
 * The light and dark scenes are not the same gradients inverted — in dark a
 * sphere is a lit object in a void, in light it is a solid object on paper —
 * so both live in graph.css and this only names them.
 */
/** The orbit ring around an agent-chosen node. */
const RING = 'color-mix(in oklch, var(--agent) 35%, transparent)';

const FILL = {
  agent: 'var(--sphere-agent)',
  /** Dimmer and less saturated — atmospheric falloff for the far plane. */
  agentFar: 'var(--sphere-agent-far)',
  machine: 'var(--sphere-machine)',
} as const;

export interface DecisionGraphProps {
  graph: DecisionGraph;
}

/**
 * One workflow, as a volume.
 *
 * Three depths carrying nesting rather than decoration: the deterministic rail
 * at z 0, the reasoning it delegated to at −300, and the evidence that
 * reasoning fetched at −520.
 *
 * Every sphere is a real focusable button rather than a canvas hit-test, which
 * is what makes the scene keyboard-navigable and its labels selectable.
 */
export function DecisionGraph({ graph }: DecisionGraphProps) {
  const { viewport, scene, readout, reset } = useOrbit();
  const stars = useMemo(() => starfield(), []);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(-1);

  // Movement is invisible until someone knows it exists. The scene reads as
  // look-only — you can orbit it from the first drag — so the one-line prompt
  // stays up until the viewport is actually engaged, then never returns.
  const [engaged, setEngaged] = useState(false);

  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  const replaying = replayIndex >= 0;
  const walked = useMemo(
    () => (replaying ? graph.path.slice(0, replayIndex + 1) : graph.path),
    [graph.path, replayIndex, replaying],
  );

  const litEdges = useMemo(() => {
    const set = new Set<string>();
    for (let i = 1; i < walked.length; i += 1) set.add(`${walked[i - 1]}>${walked[i]}`);
    return set;
  }, [walked]);

  // Replay walks the traversed path, lighting each node in turn.
  useEffect(() => {
    if (!replaying) return;

    const timer = setTimeout(() => {
      setReplayIndex((index) => (index + 1 >= graph.path.length ? -1 : index + 1));
    }, 620);

    return () => clearTimeout(timer);
  }, [replaying, replayIndex, graph.path.length]);

  const focusNode = useCallback((id: string) => {
    viewport.current?.querySelector<HTMLElement>(`[data-node="${id}"]`)?.focus({
      preventScroll: true,
    });
  }, [viewport]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (!event.key.startsWith('Arrow')) return;

      // Move along the traversed path — the ordering the graph already has,
      // rather than a second navigation map that could drift from it.
      const order = graph.path.filter((id, index) => graph.path.indexOf(id) === index);
      const at = selected ? order.indexOf(selected) : -1;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = order[Math.max(0, Math.min(order.length - 1, at + step))];

      if (next) {
        event.preventDefault();
        setSelected(next);
        focusNode(next);
      }
    },
    [graph.path, selected, focusNode],
  );

  const active = replaying ? walked[walked.length - 1] : selected;

  return (
    <div className="graph-scene flex min-h-0 flex-1 flex-col">
      <Legend
        replaying={replaying}
        onReplay={() => setReplayIndex(replaying ? -1 : 0)}
        onReset={reset}
        readout={readout}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
        <div
          ref={viewport}
          className="graph-viewport h-[640px]"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={() => setEngaged(true)}
          onFocus={() => setEngaged(true)}
          role="application"
          aria-label="Decision graph. Drag to look around, W A S D to move, R and F to rise and fall, arrow keys to step between nodes."
        >
          <div ref={scene} className="graph-world">
            {stars.map((layer) => (
              <div
                key={layer.z}
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: -1400,
                  top: -1000,
                  width: 2800,
                  height: 2000,
                  transform: `translate3d(0,0,${layer.z}px)`,
                  backgroundImage: layer.background,
                }}
              />
            ))}

            {graph.edges.map((edge) => (
              <Edge
                key={`${edge.from}>${edge.to}`}
                edge={edge}
                from={byId.get(edge.from)}
                to={byId.get(edge.to)}
                lit={litEdges.has(`${edge.from}>${edge.to}`)}
              />
            ))}

            {graph.nodes.map((node) => (
              <Sphere
                key={node.id}
                node={node}
                active={active === node.id}
                hovered={hovered === node.id}
                dimmed={replaying && !walked.includes(node.id) && node.status === 'reached'}
                onSelect={() => setSelected((current) => (current === node.id ? null : node.id))}
                onHover={setHovered}
              />
            ))}
          </div>

          {engaged ? null : (
            <p
              className="datum pointer-events-none absolute bottom-3 left-4 text-[11px] tracking-[0.06em]"
              style={{ color: 'var(--ink-dim)' }}
            >
              click the scene, then <Keycap>W</Keycap>
              <Keycap>A</Keycap>
              <Keycap>S</Keycap>
              <Keycap>D</Keycap> to move through it
            </p>
          )}

          {/* Outside the transformed subtree on purpose — a gradient over the
              world would flatten it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 45%, transparent 45%, var(--vignette) 100%)',
            }}
          />
        </div>

        <GraphInspector node={active ? byId.get(active) : undefined} />
      </div>
    </div>
  );
}

function Sphere({
  node,
  active,
  hovered,
  dimmed,
  onSelect,
  onHover,
}: {
  node: GraphNode;
  active: boolean;
  hovered: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const style = sphereStyle(node, active || hovered, dimmed);
  const emphasised = active || hovered;

  return (
    <div
      className="graph-node"
      style={{ transform: `translate3d(${node.x}px,${node.y}px,${node.z}px)` }}
    >
      <div className="graph-facing">
        {node.kind !== 'deterministic' && node.status === 'reached' ? (
          <span
            aria-hidden="true"
            className="graph-animated pointer-events-none absolute rounded-full"
            // The gap at the top is what makes the rotation legible — a
            // complete ring spinning looks static. Each side is named
            // individually rather than `border` plus a `borderTopColor`
            // override: React warns on a style object that mixes a shorthand
            // with one of its own longhands, because the order it applies them
            // in is not guaranteed. `borderColor` would have the same problem.
            style={{
              left: -(style.size + 22) / 2,
              top: -(style.size + 22) / 2,
              width: style.size + 22,
              height: style.size + 22,
              borderWidth: 1,
              borderStyle: 'solid',
              borderTopColor: 'transparent',
              borderRightColor: RING,
              borderBottomColor: RING,
              borderLeftColor: RING,
              animation: 'graph-orbit 14s linear infinite',
            }}
          />
        ) : null}

        <button
          type="button"
          data-node={node.id}
          aria-label={`${node.name} — ${node.who}`}
          aria-pressed={active}
          onClick={onSelect}
          onMouseEnter={() => onHover(node.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(node.id)}
          onBlur={() => onHover(null)}
          className={cn('graph-sphere', style.animated && 'graph-animated')}
          style={{
            left: -style.size / 2,
            top: -style.size / 2,
            width: style.size,
            height: style.size,
            background: style.background,
            border: style.border,
            boxShadow: style.shadow,
            filter: style.filter,
            outline: active ? '1px solid var(--ink)' : 'none',
            animation: style.animation,
          }}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute flex w-[200px] flex-col"
          style={{
            left: style.size / 2 + 10,
            top: -8,
            // Counter-scales the world's fit, so label text is the same size on
            // screen at every viewport width.
            transform: 'scale(var(--ik, 1))',
            transformOrigin: '0 50%',
          }}
        >
          <span
            className="datum text-[11px] font-medium whitespace-nowrap"
            style={{ color: labelColour(node, emphasised) }}
          >
            {node.name}
          </span>
          <span
            className="datum text-[10px] whitespace-nowrap"
            style={{ color: 'var(--ink-dim)' }}
          >
            {node.detail}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Deterministic spheres are small, cool and perfectly still — machined beacons
 * on a rail. Agent spheres are larger, warm and breathing. Untaken options are
 * unlit rings. Three classes of object, so the distinction survives being
 * glanced at.
 */
function sphereStyle(node: GraphNode, emphasised: boolean, dimmed: boolean) {
  const far = node.z <= -520;
  const lit = node.status === 'reached';

  const base = {
    animated: false,
    animation: 'none',
    border: '0',
    // Depth-of-field on the sphere itself. On a wrapper it would flatten the
    // entire scene — see graph.css.
    filter: emphasised
      ? 'brightness(1.3)'
      : dimmed
        ? 'brightness(0.55)'
        : far && lit
          ? 'blur(0.5px) saturate(0.85)'
          : 'none',
  };

  if (node.kind === 'deterministic') {
    return {
      ...base,
      size: 18,
      background: FILL.machine,
      shadow: `0 0 ${emphasised ? 14 : 6}px ${emphasised ? 3 : 1}px var(--glow-machine), var(--sphere-inset)`,
    };
  }

  if (node.kind === 'write') {
    return {
      ...base,
      size: 72,
      background: 'transparent',
      border: `1px solid ${emphasised ? 'var(--ink)' : 'var(--ink-dim)'}`,
      shadow: 'var(--socket-inset)',
    };
  }

  if (!lit) {
    return {
      ...base,
      size: node.kind === 'agent' ? 30 : 24,
      background: 'transparent',
      border: `1px solid ${emphasised ? 'var(--ink-dim)' : 'var(--edge)'}`,
      shadow: 'none',
    };
  }

  const agent = node.kind === 'agent';

  return {
    ...base,
    animated: true,
    animation: `graph-breathe ${agent ? '4.4s' : '5.2s'} ease-in-out infinite`,
    size: agent ? 34 : 26,
    background: agent ? FILL.agent : FILL.agentFar,
    shadow: `0 0 ${emphasised ? (agent ? 56 : 40) : agent ? 40 : 28}px ${
      emphasised ? (agent ? 14 : 10) : agent ? 10 : 7
    }px var(--glow-agent)`,
  };
}

function labelColour(node: GraphNode, emphasised: boolean): string {
  if (emphasised || node.kind === 'write') return 'var(--ink)';
  if (node.status !== 'reached') return 'var(--ink-dim)';
  return node.kind === 'deterministic' ? 'var(--machine)' : 'var(--agent)';
}

/**
 * An edge: a 1px bar rotated to point from one node to another in 3D.
 *
 * Two rotations, and both are needed. An earlier version used only the first,
 * with a `translateZ` afterwards to reach the far plane — which silently broke
 * every edge that crossed depths. `translateZ` moves the whole bar to the
 * target's depth rather than sloping it, and the bar was cut to the *2D*
 * distance, so a cross-plane edge started at the wrong place and ended
 * pointing at nothing.
 *
 *   length     the true 3D distance
 *   rotateZ    azimuth in the XY plane
 *   rotateY    elevation out of it
 *
 * The order matters: rotateZ establishes the plane the bar lies in, then
 * rotateY tilts it within that plane, so the negated elevation is correct
 * rather than a sign error that happens to look right head-on.
 */
function Edge({
  edge,
  from,
  to,
  lit,
}: {
  edge: GraphEdge;
  from: GraphNode | undefined;
  to: GraphNode | undefined;
  lit: boolean;
}) {
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;

  const azimuth = (Math.atan2(dy, dx) * 180) / Math.PI;
  const elevation = (Math.asin(dz / length) * 180) / Math.PI;

  const colour =
    edge.tone === 'off'
      ? 'color-mix(in oklch, var(--edge) 70%, transparent)'
      : lit
        ? edge.tone === 'rail'
          ? 'color-mix(in oklch, var(--machine) 75%, transparent)'
          : 'color-mix(in oklch, var(--agent) 75%, transparent)'
        : 'var(--edge)';

  return (
    <div
      aria-hidden="true"
      // Edges are decorative, and a rotated zero-height div still has a hit
      // area — without this they sit on top of the spheres and swallow clicks.
      className="pointer-events-none absolute"
      style={{
        left: 0,
        top: 0,
        height: 0,
        width: length,
        transformOrigin: '0 0',
        transform: `translate3d(${from.x}px,${from.y}px,${from.z}px) rotateZ(${azimuth}deg) rotateY(${-elevation}deg)`,
        borderTop: `1px ${edge.tone === 'off' ? 'dashed' : 'solid'} ${colour}`,
      }}
    >
      {/* A travelling pulse on the path actually taken — the data flowing,
          which doubles as an always-on hint that replay exists. */}
      {lit && edge.tone !== 'off' ? (
        <span
          className="graph-animated absolute rounded-full"
          style={{
            top: -2,
            width: 4,
            height: 4,
            marginLeft: -2,
            background: edge.tone === 'rail' ? 'var(--machine)' : 'var(--agent)',
            boxShadow: `0 0 6px 1px ${edge.tone === 'rail' ? 'var(--machine)' : 'var(--agent)'}`,
            animation: `graph-travel ${(length / 90).toFixed(1)}s linear infinite`,
          }}
        />
      ) : null}
    </div>
  );
}

function Legend({
  replaying,
  onReplay,
  onReset,
  readout,
}: {
  replaying: boolean;
  onReplay: () => void;
  onReset: () => void;
  readout: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div
      className="datum flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t py-2.5 text-[11px]"
      style={{ borderColor: 'var(--edge)', color: 'var(--ink-dim)' }}
    >
      <div className="flex flex-wrap items-center gap-x-5">
        <Key fill={FILL.agent} size={10} glow>
          agent-decided
        </Key>
        <Key fill={FILL.machine} size={8}>
          deterministic
        </Key>
        <Key size={8} outline>
          untaken · unlit
        </Key>
      </div>

      <div className="flex flex-wrap items-center gap-x-5">
        <span>
          drag to look · <b className="font-normal" style={{ color: 'var(--ink)' }}>wasd</b> to move ·{' '}
          <b className="font-normal" style={{ color: 'var(--ink)' }}>r/f</b> to rise · shift to
          sprint · scroll to dolly · arrows to step
        </span>
        <span ref={readout} className="w-[8ch]" />
        <GraphButton onClick={onReplay}>{replaying ? 'stop' : 'replay path'}</GraphButton>
        <GraphButton onClick={onReset}>reset view</GraphButton>
      </div>
    </div>
  );
}

function Key({
  fill,
  size,
  glow,
  outline,
  children,
}: {
  fill?: string;
  size: number;
  glow?: boolean;
  outline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <i
        aria-hidden="true"
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          background: outline ? 'transparent' : fill,
          border: outline ? '1px solid var(--edge)' : undefined,
          boxSizing: 'border-box',
          boxShadow: glow ? '0 0 8px 2px var(--glow-agent)' : undefined,
        }}
      />
      {children}
    </span>
  );
}

/** A keycap, so the prompt reads as something to press rather than to read. */
function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="mx-px inline-block rounded-[3px] border px-1 py-px text-[10px] not-italic"
      style={{ borderColor: 'var(--edge)', color: 'var(--ink)' }}
    >
      {children}
    </kbd>
  );
}

function GraphButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm border px-2.5 py-1"
      style={{ borderColor: 'var(--edge)', color: 'var(--ink)' }}
    >
      {children}
    </button>
  );
}
