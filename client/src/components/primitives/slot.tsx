import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

export interface SlotProps {
  /**
   * Character width to reserve — set it to the widest value this slot will
   * ever hold, not the current one.
   */
  ch?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * A fixed-width numeric slot.
 *
 * The slot reserves its space permanently, so a counter going 9 → 10 does not
 * shove everything after it sideways. In a dashboard where values update every
 * few hundred milliseconds this is the difference between a readout and a
 * flicker — and a number that visibly twitches reads as an unstable system,
 * which is the opposite of the claim this product makes.
 */
export function Slot({ ch = 1, children, className }: SlotProps) {
  return (
    <span className={cn('slot', className)} style={{ '--ch': `${ch}ch` } as CSSProperties}>
      {children}
    </span>
  );
}
