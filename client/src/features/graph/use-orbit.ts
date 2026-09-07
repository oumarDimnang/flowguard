import { useCallback, useEffect, useRef } from 'react';

const DEFAULT = { rx: 14, ry: -24 };
const CLAMP = { rx: 30, ry: 60 };

/**
 * How far the camera may travel from the origin, in scene pixels.
 *
 * `forward` is the one that is not a taste decision. The viewport's
 * `perspective` is 1200px, which is also where the camera plane sits: anything
 * that reaches z = 1200 is *at* the eye and renders as an infinite smear, and
 * past it the projection inverts. Nodes already sit as far forward as +150
 * (the near star layer) and a 30° pitch can swing another ~300px toward the
 * viewer, so the ceiling has to leave room for both.
 */
const RANGE = { x: 1600, y: 1200, back: 2800, forward: 480 };

/** Scene pixels per second, and the multiplier while shift is held. */
const MOVE = { speed: 760, boost: 2.4, ease: 0.18 };

/**
 * Which key pushes which way.
 *
 * The signs are inverted because the camera does not move — the world does. To
 * step right, everything slides left.
 */
const MOVE_KEYS: Record<string, { axis: 'x' | 'y' | 'z'; sign: number }> = {
  w: { axis: 'z', sign: 1 },
  s: { axis: 'z', sign: -1 },
  a: { axis: 'x', sign: 1 },
  d: { axis: 'x', sign: -1 },
  r: { axis: 'y', sign: 1 },
  f: { axis: 'y', sign: -1 },
};

/** How long after the last interaction the scene starts drifting again. */
const IDLE_MS = 6_000;

export interface OrbitHandles {
  viewport: React.RefObject<HTMLDivElement | null>;
  scene: React.RefObject<HTMLDivElement | null>;
  readout: React.RefObject<HTMLSpanElement | null>;
  reset: () => void;
}

/**
 * A camera: drag to look, WASD to move, scroll to dolly, and an idle drift.
 *
 * Look and move are independent on purpose — you can hold a drag and walk at
 * the same time, which is the only way to inspect a node from a chosen angle
 * *and* a chosen distance.
 *
 * Every frame writes six custom properties on the scene and nothing else.
 * Three rules keep it smooth, and breaking any one of them is what makes a
 * hand-built 3D scene judder:
 *
 *   1. Angles and position live in refs, never in React state. State would
 *      re-render the whole node tree sixty times a second while dragging.
 *   2. Nothing reads layout during a drag — no getBoundingClientRect, no
 *      offsetWidth. A read forces synchronous style resolution mid-gesture.
 *   3. All writes happen in one requestAnimationFrame, easing toward a target
 *      rather than snapping to it.
 *
 * Pointer capture matters too: without it the drag dies the moment the cursor
 * leaves the viewport, which feels like the scene sticking.
 */
export function useOrbit(): OrbitHandles {
  const viewport = useRef<HTMLDivElement | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
  const readout = useRef<HTMLSpanElement | null>(null);

  const current = useRef({ ...DEFAULT });
  const target = useRef({ ...DEFAULT });
  const base = useRef({ ...DEFAULT });
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const lastInteraction = useRef(0);

  const position = useRef({ x: 0, y: 0, z: 0 });
  const destination = useRef({ x: 0, y: 0, z: 0 });
  const held = useRef(new Set<string>());

  const reset = useCallback(() => {
    target.current = { ...DEFAULT };
    base.current = { ...DEFAULT };
    destination.current = { x: 0, y: 0, z: 0 };
    held.current.clear();
    lastInteraction.current = performance.now();
  }, []);

  useEffect(() => {
    const vp = viewport.current;
    const sc = scene.current;
    if (!vp || !sc) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Fit the world to the viewport.
    //
    // Node positions are absolute pixels, so a narrow viewport would clip the
    // rail. `--k` scales the world; `--ik` is its inverse, applied to labels so
    // text stays a constant size on screen rather than shrinking with the scene.
    const fit = () => {
      const k = Math.max(0.62, Math.min(1.1, (vp.clientWidth - 100) / 1080));
      sc.style.setProperty('--k', k.toFixed(3));
      sc.style.setProperty('--ik', (1 / k).toFixed(3));
    };

    const observer = new ResizeObserver(fit);
    observer.observe(vp);
    fit();

    const onPointerDown = (event: PointerEvent) => {
      // Let the spheres handle their own clicks. They live inside the viewport,
      // so keyboard events still reach the movement listeners by bubbling.
      if ((event.target as HTMLElement).closest('button')) return;

      // Dragging is how anyone discovers the scene is interactive, so it is
      // also where the keyboard should become live — otherwise WASD does
      // nothing until you happen to tab into the viewport.
      vp.focus({ preventScroll: true });

      vp.setPointerCapture(event.pointerId);
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        rx: target.current.rx,
        ry: target.current.ry,
      };
      lastInteraction.current = performance.now();
      vp.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      const from = drag.current;
      if (!from) return;

      target.current.rx = clamp(from.rx + (event.clientY - from.y) * 0.25, CLAMP.rx);
      target.current.ry = clamp(from.ry + (event.clientX - from.x) * 0.25, CLAMP.ry);
      lastInteraction.current = performance.now();
    };

    const onPointerUp = () => {
      drag.current = null;
      vp.style.cursor = 'grab';
      lastInteraction.current = performance.now();
    };

    // Scroll is the same dolly W and S drive, rather than a separate change to
    // `perspective`. Two controls that both read as "zoom" but move different
    // things is how a scene stops being legible.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      destination.current.z = clamp3(
        destination.current.z - event.deltaY * 0.6,
        -RANGE.back,
        RANGE.forward,
      );
      lastInteraction.current = performance.now();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (key !== 'shift' && !(key in MOVE_KEYS)) return;

      event.preventDefault();
      held.current.add(key);
      lastInteraction.current = performance.now();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      held.current.delete(event.key.toLowerCase());
    };

    // Without this, alt-tabbing mid-stride leaves a key "held" forever and the
    // scene drifts away on its own with nothing touching it.
    const releaseAll = () => held.current.clear();

    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('keydown', onKeyDown);
    vp.addEventListener('keyup', onKeyUp);
    vp.addEventListener('blur', releaseAll);
    window.addEventListener('blur', releaseAll);

    let frame = 0;
    let previous = performance.now();

    const loop = (time: number) => {
      // Seconds, capped: a backgrounded tab resumes with a huge delta and would
      // otherwise teleport the camera across the scene in one frame.
      const delta = Math.min(0.05, Math.max(0, (time - previous) / 1000));
      previous = time;

      const moving = held.current.size > 0 && hasDirection(held.current);
      if (moving) {
        const step = MOVE.speed * (held.current.has('shift') ? MOVE.boost : 1) * delta;

        for (const key of held.current) {
          const push = MOVE_KEYS[key];
          if (push) destination.current[push.axis] += push.sign * step;
        }

        destination.current.x = clamp(destination.current.x, RANGE.x);
        destination.current.y = clamp(destination.current.y, RANGE.y);
        destination.current.z = clamp3(destination.current.z, -RANGE.back, RANGE.forward);
        lastInteraction.current = time;
      }

      const idle = !drag.current && !moving && time - lastInteraction.current > IDLE_MS && !reduced;

      if (idle) {
        // A degree or two of drift, so the scene never looks frozen.
        target.current.ry = base.current.ry + Math.sin(time / 7000) * 1.6;
        target.current.rx = base.current.rx + Math.sin(time / 9000) * 0.8;
      } else if (!drag.current) {
        base.current = { ...target.current };
      }

      current.current.rx += (target.current.rx - current.current.rx) * 0.12;
      current.current.ry += (target.current.ry - current.current.ry) * 0.12;

      position.current.x += (destination.current.x - position.current.x) * MOVE.ease;
      position.current.y += (destination.current.y - position.current.y) * MOVE.ease;
      position.current.z += (destination.current.z - position.current.z) * MOVE.ease;

      sc.style.setProperty('--rx', `${current.current.rx.toFixed(2)}deg`);
      sc.style.setProperty('--ry', `${current.current.ry.toFixed(2)}deg`);
      sc.style.setProperty('--tx', `${position.current.x.toFixed(1)}px`);
      sc.style.setProperty('--ty', `${position.current.y.toFixed(1)}px`);
      sc.style.setProperty('--tz', `${position.current.z.toFixed(1)}px`);

      if (readout.current) {
        readout.current.textContent = moving
          ? 'moving'
          : drag.current
            ? 'looking'
            : idle
              ? 'drifting'
              : 'held';
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('keydown', onKeyDown);
      vp.removeEventListener('keyup', onKeyUp);
      vp.removeEventListener('blur', releaseAll);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);

  return { viewport, scene, readout, reset };
}

/** Shift alone is a modifier, not a direction — holding it must not count as motion. */
function hasDirection(keys: ReadonlySet<string>): boolean {
  for (const key of keys) if (key in MOVE_KEYS) return true;
  return false;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function clamp3(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * A deterministic starfield.
 *
 * Three layers at different depths so they slide past each other as the scene
 * turns — the single strongest depth cue in the whole visualisation, because
 * the stars move differently from the graph.
 *
 * Seeded rather than random: the scene has to look identical every time it is
 * shown, and a field that reshuffles on every mount would undermine that.
 */
export function starfield(): { z: number; background: string }[] {
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  return [
    { z: -900, count: 90, alpha: 0.55, size: 1.2 },
    { z: -500, count: 70, alpha: 0.4, size: 1 },
    { z: 150, count: 45, alpha: 0.28, size: 0.9 },
  ].map(({ z, count, alpha, size }) => {
    const dots: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // `--star` is ink in light and starlight in dark, so the same parallax
      // layers read as dust motes on paper or as a starfield in a void.
      dots.push(
        `radial-gradient(circle at ${(next() * 100).toFixed(1)}% ${(next() * 100).toFixed(1)}%, color-mix(in oklch, var(--star) ${(alpha * 100).toFixed(0)}%, transparent) ${size}px, transparent ${size + 0.6}px)`,
      );
    }
    return { z, background: dots.join(',') };
  });
}
