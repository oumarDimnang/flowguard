import { useMemo } from 'react';

import { useOperationsHistory } from '@/hooks/use-operations-history';
import { NetworkAction, type Operation } from '@/types';

export interface ContrastPair {
  /** The one left on standard connectivity. */
  restrained: Operation;
  /** The one that was protected. */
  protectedOp: Operation;
}

export interface ContrastResult {
  pair: ContrastPair | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  /** True when a pair exists but the two ran under different congestion. */
  congestionDiffers: boolean;
}

/**
 * Finds the strongest contrast pair the system has actually produced.
 *
 * The requirements, in order of how much they matter: the same device, so
 * nothing about the hardware or the cell can explain the difference; opposite
 * actions; and ideally identical congestion, which is what turns the pair from
 * an illustration into an argument.
 *
 * Nothing is fabricated. If no such pair has run yet the page says so and
 * offers to produce one, rather than showing a worked example that never
 * happened.
 */
export function useContrastPair(explicit?: { a?: string; b?: string }): ContrastResult {
  const history = useOperationsHistory('all');

  // Destructured so the memo's dependencies are the primitives it actually
  // reads. Listing `explicit?.a` while closing over `explicit` makes the
  // React Compiler bail out of optimising this hook entirely.
  const explicitA = explicit?.a;
  const explicitB = explicit?.b;

  const pair = useMemo(() => {
    const operations = history.operations;

    if (explicitA && explicitB) {
      const a = operations.find((o) => o.operationId === explicitA);
      const b = operations.find((o) => o.operationId === explicitB);
      if (a && b) return orient(a, b);
    }

    const byDevice = new Map<string, Operation[]>();
    for (const operation of operations) {
      if (!operation.action) continue;
      byDevice.set(operation.deviceId, [...(byDevice.get(operation.deviceId) ?? []), operation]);
    }

    let best: ContrastPair | undefined;

    for (const group of byDevice.values()) {
      const restrained = group.find((o) => o.action === NetworkAction.NONE);
      const protectedOp = group.find(
        (o) => o.action === NetworkAction.QOD || o.action === NetworkAction.QOD_AND_SLICE,
      );
      if (!restrained || !protectedOp) continue;

      const candidate = { restrained, protectedOp };

      // Matching congestion is the whole point, so a pair that has it always
      // wins over one that does not.
      if (restrained.congestion != null && restrained.congestion === protectedOp.congestion) return candidate;
      best ??= candidate;
    }

    return best;
  }, [history.operations, explicitA, explicitB]);

  return {
    pair,
    loading: history.loading,
    error: history.error,
    reload: history.reload,
    congestionDiffers:
      pair !== undefined
      && pair.restrained.congestion != null
      && pair.protectedOp.congestion != null
      && pair.restrained.congestion !== pair.protectedOp.congestion,
  };
}

function orient(a: Operation, b: Operation): ContrastPair {
  return a.action === NetworkAction.NONE
    ? { restrained: a, protectedOp: b }
    : { restrained: b, protectedOp: a };
}
