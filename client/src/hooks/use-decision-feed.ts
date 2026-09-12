import { useCallback } from 'react';

import { api } from '@/api/endpoints';
import { LIVE_EVENTS, type DecisionRecord } from '@/types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

/** How many recent decisions the Control Room feed holds. Beyond this, History. */
const FEED_LIMIT = 40;

export interface DecisionFeed {
  /** Newest first. */
  records: readonly DecisionRecord[];
  loading: boolean;
  error: Error | undefined;
}

/**
 * The live decision log across every operation, newest first.
 *
 * `limit` is the window: 40 for the Control Room's feed, a few hundred for the
 * dashboard's aggregates. New records are prepended and the oldest fall off, so
 * the window stays the same size while it stays current.
 *
 * Deduped on `idempotencyKey` like the trail, because a retried Temporal
 * activity emits the same step twice.
 */
export function useDecisionFeed(limit = FEED_LIMIT): DecisionFeed {
  const resource = useResource(
    (signal) => api.decisionLog.list({ limit }, signal).then((page) => page.items),
    [limit],
  );

  const { setData } = resource;

  const prepend = useCallback(
    (record: DecisionRecord) =>
      setData((previous) => {
        const records = previous ?? [];
        if (records.some((r) => r.idempotencyKey === record.idempotencyKey)) return records;
        return [record, ...records].slice(0, limit);
      }),
    [limit, setData],
  );

  useLiveEvent(LIVE_EVENTS.DECISION_RECORDED, prepend);

  return {
    records: resource.data ?? EMPTY,
    loading: resource.loading,
    error: resource.error,
  };
}
