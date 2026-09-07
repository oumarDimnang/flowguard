import { useCallback } from 'react';

import { api } from '../api/endpoints';
import { LIVE_EVENTS, type FacilityDescriptor, type FacilityJob } from '../types';
import { useLiveEvent } from './use-live-event';
import { EMPTY, useResource } from './use-resource';

export interface FacilityState {
  descriptor: FacilityDescriptor | undefined;
  jobs: readonly FacilityJob[];
  loading: boolean;
  error: Error | undefined;

  /** Issue the job instruction. The rest of the sequence arrives on the socket. */
  dispatch: (jobId: string) => Promise<FacilityJob>;
  abort: (jobId: string) => Promise<FacilityJob>;
  /** Restore the plan. Releases anything still in flight. */
  reset: () => Promise<FacilityJob[]>;
}

/**
 * The stand-in TOS: berth plan, work queue, and the controls that drive it.
 *
 * Moves are merged from push events rather than refetched, because the server
 * publishes the full FacilityJob on every transition. A move changes state
 * seven times in about twenty seconds, and seven refetches per move is a lot of
 * traffic for data already in hand.
 */
export function useFacility(): FacilityState {
  const descriptor = useResource((signal) => api.facility.describe(signal), []);
  const queue = useResource((signal) => api.facility.jobs(signal), []);

  const { setData } = queue;

  const upsert = useCallback(
    (job: FacilityJob) =>
      setData((previous) => {
        const jobs = previous ?? [];
        const index = jobs.findIndex((j) => j.id === job.id);
        if (index === -1) return [...jobs, job];

        const next = [...jobs];
        next[index] = job;
        return next;
      }),
    [setData],
  );

  useLiveEvent(LIVE_EVENTS.FACILITY_JOB_UPDATED, upsert);
  useLiveEvent(LIVE_EVENTS.FACILITY_PLAN_RESET, (jobs) => setData(() => jobs));

  const dispatch = useCallback(
    async (jobId: string) => {
      const updated = await api.facility.dispatch(jobId);
      // The socket has almost certainly delivered this same GANTRY transition
      // already, so this is usually a no-op. It matters when the socket is
      // down: the button still visibly does something.
      upsert(updated);
      return updated;
    },
    [upsert],
  );

  const abort = useCallback(
    async (jobId: string) => {
      const updated = await api.facility.abort(jobId);
      upsert(updated);
      return updated;
    },
    [upsert],
  );

  const reset = useCallback(async () => {
    const restored = await api.facility.reset();
    setData(() => restored);
    return restored;
  }, [setData]);

  return {
    descriptor: descriptor.data,
    jobs: queue.data ?? EMPTY,
    loading: descriptor.loading || queue.loading,
    error: descriptor.error ?? queue.error,
    dispatch,
    abort,
    reset,
  };
}
