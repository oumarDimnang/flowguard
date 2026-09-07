import { useCallback, useMemo } from 'react';

import { api } from '../api/endpoints';
import {
  LIVE_EVENTS,
  holdsPremiumConnectivity,
  isOperationInFlight,
  type Operation,
} from '../types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

export interface ActiveOperationsState {
  operations: readonly Operation[];
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * Everything currently in flight, kept live.
 *
 * `GET /operations/active` returns only in-flight operations, so an operation
 * that reaches COMPLETED must be *removed* here rather than updated. That
 * removal is the point of the panel: the count returning to zero is the release
 * guarantee made visible, and an operation that lingered would quietly turn the
 * strongest claim in the product into a bug on screen.
 */
export function useActiveOperations(): ActiveOperationsState {
  const resource = useResource((signal) => api.operations.active(signal), []);
  const { setData } = resource;

  const merge = useCallback(
    (operation: Operation) =>
      setData((previous) => {
        const without = (previous ?? []).filter(
          (o) => o.operationId !== operation.operationId,
        );
        return isOperationInFlight(operation.status) ? [...without, operation] : without;
      }),
    [setData],
  );

  useLiveEvent(LIVE_EVENTS.OPERATION_STARTED, merge);
  useLiveEvent(LIVE_EVENTS.OPERATION_UPDATED, merge);

  return {
    operations: resource.data ?? EMPTY,
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
  };
}

export interface Holdings {
  /** Operations holding a QoD session or a slice attachment right now. */
  operations: readonly Operation[];
  count: number;
  /** Of those, the ones that also hold a network slice. */
  sliceCount: number;
}

/**
 * What the network is paying for at this instant.
 *
 * Derived rather than fetched — the active operations already carry
 * `qodSessionId` and `sliceId`, and a separate endpoint would be a second
 * source of truth for the number the whole business case rests on.
 */
export function useHoldings(operations: readonly Operation[]): Holdings {
  return useMemo(() => {
    const holding = operations.filter(holdsPremiumConnectivity);
    return {
      operations: holding,
      count: holding.length,
      sliceCount: holding.filter((o) => o.sliceId !== undefined).length,
    };
  }, [operations]);
}
