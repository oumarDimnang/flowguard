import { useEffect, useState } from 'react';

/**
 * The current time, re-rendered on an interval while `active`.
 *
 * For elapsed-time readouts on a live page. Stops ticking when the thing being
 * timed has finished, so a completed operation does not keep re-rendering
 * forever for no reader.
 */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    // The first tick lands one interval in; the initial state already holds
    // the mount time, so nothing is stale for longer than that.
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}
