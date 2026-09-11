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
  selectionError?: string;
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

  const { pair, selectionError } = selectPair(history.operations, explicit?.a, explicit?.b);

  return {
    pair,
    selectionError,
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

function selectPair(
  operations: readonly Operation[],
  explicitA?: string,
  explicitB?: string,
): { pair?: ContrastPair; selectionError?: string } {
  if (explicitA !== undefined || explicitB !== undefined) {
    if (!explicitA || !explicitB) {
      return { selectionError: 'This comparison link needs two operation IDs.' };
    }
    if (explicitA === explicitB) {
      return { selectionError: 'Select two different operations to compare.' };
    }
    const a = operations.find((o) => o.operationId === explicitA);
    const b = operations.find((o) => o.operationId === explicitB);
    if (!a || !b) {
      return { selectionError: 'One or both selected operations are not in the loaded history. They may be older than the latest 100 results or unavailable in this organization.' };
    }
    if (a.deviceId !== b.deviceId) {
      return { selectionError: 'A contrast must compare operations on the same device.' };
    }
    const candidate = orient(a, b);
    if (candidate.restrained.action !== NetworkAction.NONE
      || (candidate.protectedOp.action !== NetworkAction.QOD
        && candidate.protectedOp.action !== NetworkAction.QOD_AND_SLICE)) {
      return { selectionError: 'A contrast needs one NONE decision and one QOD or QOD_AND_SLICE decision.' };
    }
    return { pair: candidate };
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
    if (restrained.congestion != null && restrained.congestion === protectedOp.congestion) return { pair: candidate };
    best ??= candidate;
  }

  return { pair: best };
}

function orient(a: Operation, b: Operation): ContrastPair {
  return a.action === NetworkAction.NONE
    ? { restrained: a, protectedOp: b }
    : { restrained: b, protectedOp: a };
}
