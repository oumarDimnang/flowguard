import { useEffect, useState } from 'react';

export interface HoldingsSample {
  at: number;
  count: number;
}

/** Keeps a long demo from accumulating an unbounded array. */
const MAX_SAMPLES = 200;

/**
 * Every change in the held-session count observed since this page loaded.
 *
 * Explicitly not fetched — the server keeps no time series, and drawing one
 * from data that does not exist would be exactly the kind of unbacked claim
 * this product argues against. What this records is the session's own
 * observation, which means an empty chart on a fresh page is correct rather
 * than broken.
 */
export function useHoldingsHistory(count: number, loading?: boolean): HoldingsSample[] {
  const [history, setHistory] = useState<HoldingsSample[]>([]);

  useEffect(() => {
    if (loading) return;

    setHistory((previous) => {
      if (previous.length > 0 && previous[previous.length - 1].count === count) return previous;
      return [...previous, { at: Date.now(), count }].slice(-MAX_SAMPLES);
    });
  }, [count, loading]);

  return history;
}
