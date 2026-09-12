import markDark from '@/assets/flowguard-mark-dark.png';
import markLight from '@/assets/flowguard-mark-light.png';
import wordmarkDark from '@/assets/flowguard-wordmark-dark.png';
import wordmarkLight from '@/assets/flowguard-wordmark-light.png';
import { cn } from '@/lib/utils';

/**
 * The FlowGuard lockup and its mark, theme-aware.
 *
 * Two renderings of each, swapped by the `.dark` class on <html> rather than
 * by reading the theme in JavaScript, so the right one is there on the first
 * paint, before React has run. Both files are lifted off their
 * original backgrounds so they sit on the paper or the dark surface without
 * a rectangle around them — see scripts in the session notes if they ever
 * need regenerating from the source PNGs in assets/.
 */

interface BrandProps {
  /** Rendered height in pixels. Width follows the artwork's own ratio. */
  height?: number;
  className?: string;
}

/** The mark with the wordmark beside it. */
export function Wordmark({ height = 20, className }: BrandProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)} style={{ height }}>
      <img src={wordmarkLight} alt="FlowGuard" className="block h-full w-auto dark:hidden" />
      <img src={wordmarkDark} alt="" aria-hidden="true" className="hidden h-full w-auto dark:block" />
    </span>
  );
}

/** The square mark alone — for the collapsed rail and anywhere a word does not fit. */
export function Mark({ height = 24, className }: BrandProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)} style={{ height }}>
      <img src={markLight} alt="FlowGuard" className="block h-full w-auto dark:hidden" />
      <img src={markDark} alt="" aria-hidden="true" className="hidden h-full w-auto dark:block" />
    </span>
  );
}
