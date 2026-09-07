import { useCallback } from 'react';

import { api } from '../api/endpoints';
import { LIVE_EVENTS, type DecisionRecord, type Operation } from '../types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

export interface OperationTrail {
  operation: Operation | undefined;
  /** The full trail, oldest first. */
  records: readonly DecisionRecord[];
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * One operation and its decision trail, appended live.
 *
 * Records arrive two ways: the initial GET, and `decision.recorded` as the
 * workflow proceeds. Both go through the same dedupe, because a retried
 * Temporal activity can emit the same step twice — and a duplicated step in the
 * trace panel undermines the exact thing the panel exists to prove.
 */
export function useOperationTrail(operationId: string | undefined): OperationTrail {
  const operation = useResource(
    (signal) =>
      operationId ? api.operations.get(operationId, signal) : Promise.resolve(undefined),
    [operationId],
  );

  const trail = useResource(
    (signal) =>
      operationId
        ? api.decisionLog.byOperation(operationId, signal).then(sortByOccurrence)
        : Promise.resolve<DecisionRecord[]>([]),
    [operationId],
  );

  const { setData } = trail;

  const append = useCallback(
    (record: DecisionRecord) => {
      if (record.operationId !== operationId) return;

      setData((previous) => {
        const records = previous ?? [];
        if (records.some((r) => r.idempotencyKey === record.idempotencyKey)) return records;
        return sortByOccurrence([...records, record]);
      });
    },
    [operationId, setData],
  );

  useLiveEvent(LIVE_EVENTS.DECISION_RECORDED, append);

  const reload = useCallback(() => {
    operation.reload();
    trail.reload();
  }, [operation, trail]);

  return {
    operation: operation.data,
    records: trail.data ?? EMPTY,
    loading: operation.loading || trail.loading,
    error: operation.error ?? trail.error,
    reload,
  };
}

/**
 * Ordered by when the activity observed the event, not when the server stored
 * it. Activities retry and can emit out of order; `occurredAt` is the honest
 * clock, and it is supplied by the worker rather than the server.
 */
function sortByOccurrence(records: DecisionRecord[]): DecisionRecord[] {
  return [...records].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
