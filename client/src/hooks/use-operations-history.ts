import { useCallback, useMemo, useState } from 'react';

import { api } from '@/api/endpoints';
import {
  Criticality,
  LIVE_EVENTS,
  NetworkAction,
  isOperationInFlight,
  type Operation,
} from '@/types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

const PAGE_SIZE = 100;

/**
 * Which operations to show.
 *
 * `notAtRisk` is the one worth having: a HIGH-criticality operation on an
 * uncongested network, correctly left alone. It reads as a miss to anyone
 * skimming, and it is the system working exactly as designed — so it gets its
 * own filter rather than being buried among the others.
 */
export const HISTORY_FILTERS = {
  all: 'all',
  protected: 'protected',
  leftAlone: 'left alone',
  notAtRisk: 'critical, network healthy',
} as const;

export type HistoryFilter = keyof typeof HISTORY_FILTERS;

export interface OperationsHistory {
  operations: readonly Operation[];
  /** Row counts per filter, computed over the whole set rather than the page. */
  counts: Record<HistoryFilter, number>;
  total: number;
  loading: boolean;
  /** Whether a history response has arrived, including an empty result. */
  hasData: boolean;
  error: Error | undefined;
  reload: () => void;
}

export function useOperationsHistory(filter: HistoryFilter): OperationsHistory {
  const resource = useResource(
    (signal) => api.operations.list({ limit: PAGE_SIZE }, signal),
    [],
  );

  const { setData } = resource;

  // A finished operation is exactly what this page exists to keep reachable,
  // so updates are merged rather than dropped the way the active list drops
  // them.
  const merge = useCallback(
    (operation: Operation) =>
      setData((previous) => {
        if (!previous) return previous;
        const index = previous.items.findIndex((o) => o.operationId === operation.operationId);

        const items =
          index === -1
            ? [operation, ...previous.items]
            : previous.items.map((o, i) => (i === index ? operation : o));

        return { ...previous, items, total: index === -1 ? previous.total + 1 : previous.total };
      }),
    [setData],
  );

  useLiveEvent(LIVE_EVENTS.OPERATION_STARTED, merge);
  useLiveEvent(LIVE_EVENTS.OPERATION_UPDATED, merge);

  const all = resource.data?.items ?? EMPTY;

  const counts = useMemo(
    () => ({
      all: all.length,
      protected: all.filter(isProtected).length,
      leftAlone: all.filter(isLeftAlone).length,
      notAtRisk: all.filter(isCriticalButHealthy).length,
    }),
    [all],
  );

  const operations = useMemo(() => {
    switch (filter) {
      case 'protected':
        return all.filter(isProtected);
      case 'leftAlone':
        return all.filter(isLeftAlone);
      case 'notAtRisk':
        return all.filter(isCriticalButHealthy);
      default:
        return all;
    }
  }, [all, filter]);

  return {
    operations,
    counts,
    total: resource.data?.total ?? 0,
    loading: resource.loading,
    hasData: resource.data !== undefined,
    error: resource.error,
    reload: resource.reload,
  };
}

/** Granted QoD, with or without a slice. */
export function isProtected(operation: Operation): boolean {
  return (
    operation.action === NetworkAction.QOD || operation.action === NetworkAction.QOD_AND_SLICE
  );
}

/** Decided, and decided to do nothing. */
export function isLeftAlone(operation: Operation): boolean {
  return operation.action === NetworkAction.NONE;
}

/**
 * Business-critical, but the network was already fine.
 *
 * Correct restraint, and the row most likely to be misread as a failure.
 */
export function isCriticalButHealthy(operation: Operation): boolean {
  return (
    operation.criticality === Criticality.HIGH &&
    operation.action === NetworkAction.NONE &&
    operation.congestion === 'Low'
  );
}

/** True when the operation held connectivity and has since given it back. */
export function wasReleased(operation: Operation): boolean {
  return operation.qodSessionId !== undefined && !isOperationInFlight(operation.status);
}

/** Local selection state for the filter bar. */
export function useHistoryFilter(): [HistoryFilter, (next: HistoryFilter) => void] {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  return [filter, setFilter];
}
