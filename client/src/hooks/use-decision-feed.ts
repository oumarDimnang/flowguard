import { useCallback } from 'react';

import { api } from '@/api/endpoints';
import { LIVE_EVENTS, type DecisionRecord } from '@/types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

/** How many recent decisions the feed holds. Beyond this, Operations history. */
const FEED_LIMIT = 40;

export interface DecisionFeed {
  /** Newest first. */
  records: readonly DecisionRecord[];
  loading: boolean;
  error: Error | undefined;
}

/**
 * The live decision log across every operation.
 *
 * Newest first, which is the opposite of the per-operation trail — this is a
 * feed being watched as it happens, not a sequence being read from the start.
 *
 * Deduped on `idempotencyKey` like the trail, because a retried Temporal
 * activity emits the same step twice and a doubled line in the feed is exactly
 * the kind of thing someone notices from the back of the room.
 */
export function useDecisionFeed(): DecisionFeed {
  const resource = useResource(
    (signal) => api.decisionLog.list({ limit: FEED_LIMIT }, signal).then((page) => page.items),
    [],
  );

  const { setData } = resource;

  const prepend = useCallback(
    (record: DecisionRecord) =>
      setData((previous) => {
        const records = previous ?? [];
        if (records.some((r) => r.idempotencyKey === record.idempotencyKey)) return records;
        return [record, ...records].slice(0, FEED_LIMIT);
      }),
    [setData],
  );

  useLiveEvent(LIVE_EVENTS.DECISION_RECORDED, prepend);

  return {
    records: resource.data ?? EMPTY,
    loading: resource.loading,
    error: resource.error,
  };
}
