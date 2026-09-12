import { useCallback, useEffect, useRef, useState } from 'react';

export interface Playback {
  /** Milliseconds into the whole demo. */
  position: number;
  playing: boolean;
  /** Reached the end and stopped there. */
  finished: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
}

/**
 * The demo's clock.
 *
 * One number, advanced by requestAnimationFrame while playing. Everything on
 * the page — the crane, the trail, the narration — is a pure function of it,
 * so seeking, stepping and pausing are all the same operation and nothing can
 * drift out of step with anything else.
 *
 * A frame gap is capped at 100 ms. The browser stops painting a hidden tab, and
 * without the cap the first frame back would jump the story forward by however
 * long the viewer was away.
 */
export function usePlayback(
  total: number,
  { autoplay, initial = 0 }: { autoplay: boolean; initial?: number },
): Playback {
  const [position, setPosition] = useState(initial);
  const [playing, setPlaying] = useState(autoplay);
  const positionRef = useRef(initial);

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const next = Math.min(total, positionRef.current + Math.min(100, now - last));
      last = now;
      positionRef.current = next;
      setPosition(next);

      if (next >= total) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.min(total, Math.max(0, ms));
      positionRef.current = clamped;
      setPosition(clamped);
    },
    [total],
  );

  const play = useCallback(() => {
    // Play from the end means play again, not a no-op that looks broken.
    if (positionRef.current >= total) seek(0);
    setPlaying(true);
  }, [seek, total]);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  return { position, playing, finished: position >= total, play, pause, toggle, seek };
}

/** True when the viewer has asked their system for less motion. Read once. */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  return reduced;
}
