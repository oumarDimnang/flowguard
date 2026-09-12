import { useCallback, useMemo, useState } from 'react';

import { LIVE_EVENTS, type ReasoningTraceEvent } from '../types';
import { useLiveEvent } from './use-live-event';

/**
 * The agent's reasoning for one operation, as it streams in.
 *
 * Push-only: there is nothing to fetch, because these events are never stored.
 * A page opened after the assessment finished sees none of them and reads the
 * CRITICALITY_ASSESSED record instead — which is why every consumer of this
 * hook must also be able to render from that record.
 *
 * Ordered by `seq` within a run rather than by arrival, and deduplicated on
 * (runId, seq), since a retried assessment activity starts its sequence again
 * from one under the same run.
 */
export function useReasoningTrace(operationId: string | undefined): readonly ReasoningTraceEvent[] {
  const [events, setEvents] = useState<readonly ReasoningTraceEvent[]>([]);

  const append = useCallback(
    (event: ReasoningTraceEvent) => {
      if (event.operationId !== operationId) return;

      setEvents((previous) => {
        const key = keyOf(event);
        if (previous.some((e) => keyOf(e) === key)) return previous;
        return [...previous, event].sort(byOrder);
      });
    },
    [operationId],
  );

  useLiveEvent(LIVE_EVENTS.REASONING_TRACE, append);

  // A different operation is a different stream. Filtering here, rather than
  // clearing state in an effect, means the page that dispatches its next job
  // from this one never renders the old operation's reasoning under the new
  // id for a frame.
  return useMemo(
    () => events.filter((event) => event.operationId === operationId),
    [events, operationId],
  );
}

function keyOf(event: ReasoningTraceEvent): string {
  return `${event.runId ?? ''}:${event.seq}`;
}

/**
 * Runs in the order they happened; within a run, by sequence.
 *
 * A retried activity is a second run of the same graph, and its events
 * belong after the first attempt's rather than interleaved with them.
 */
function byOrder(a: ReasoningTraceEvent, b: ReasoningTraceEvent): number {
  if (a.runId !== b.runId) return Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  return a.seq - b.seq;
}
