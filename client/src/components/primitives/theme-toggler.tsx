import { MoonIcon } from '@phosphor-icons/react/Moon';
import { SunIcon } from '@phosphor-icons/react/Sun';
import { useRef } from 'react';
import { flushSync } from 'react-dom';

import { setTheme, useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export interface ThemeTogglerProps {
  /** Length of the reveal, in milliseconds. */
  duration?: number;
  /** Icon size, in pixels. */
  size?: number;
  className?: string;
}

/**
 * Light / dark, switched with a reveal.
 *
 * The new theme spreads out from the button as a growing circle until it
 * covers the screen — the effect of Magic UI's Animated Theme Toggler, built
 * here on the same browser feature, the View Transitions API. The browser
 * snapshots the page, the theme changes inside the callback, and the new
 * snapshot is uncovered through an expanding `clip-path` circle centred on the
 * button.
 *
 * Falls back to an instant switch where view transitions do not exist, and
 * for anyone who has asked their system for less motion.
 *
 * The icon shows where the toggle goes, not where the page is: a sun in dark
 * mode, a moon in light. A toggle keeps one accessible name and reports its
 * state; only the tooltip says which way it will go.
 */
export function ThemeToggler({ duration = 450, size = 16, className }: ThemeTogglerProps) {
  const { dark } = useTheme();
  const button = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !dark;
    const origin = button.current?.getBoundingClientRect();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof document.startViewTransition !== 'function' || !origin || reduced) {
      setTheme(next);
      return;
    }

    const x = origin.left + origin.width / 2;
    const y = origin.top + origin.height / 2;
    // Far enough to reach the corner of the viewport furthest from the button.
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => {
      // Commit the icon swap inside the callback, so it is in the new snapshot.
      flushSync(() => setTheme(next));
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      // A transition skipped by the browser (tab hidden, another one starting)
      // rejects `ready`. The theme has still changed; only the effect is lost.
      .catch(() => undefined);
  };

  return (
    <button
      ref={button}
      type="button"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'btn-bare flex size-7 items-center justify-center text-muted-foreground',
        className,
      )}
    >
      {dark ? (
        <SunIcon size={size} aria-hidden="true" />
      ) : (
        <MoonIcon size={size} aria-hidden="true" />
      )}
    </button>
  );
}
