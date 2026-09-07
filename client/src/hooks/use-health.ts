import { useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { HealthReport } from '../types';

const POLL_INTERVAL_MS = 10_000;

export interface HealthState {
  report: HealthReport | undefined;
  /** False when the server itself is unreachable — distinct from `degraded`. */
  reachable: boolean;
}

/**
 * Server health, polled.
 *
 * Three states matter and they are easy to collapse by accident:
 *
 *   ok         — 200, everything up
 *   degraded   — 503, but the body is still a full HealthReport naming what
 *                failed. Mongo or Temporal is down; the server is fine.
 *   unreachable — no response at all. The server is gone.
 *
 * The middle case is why this does not use `useResource`: a 503 raises an
 * ApiError, and the useful payload is inside it. Treating that as a failure
 * would throw away the one piece of information worth having.
 */
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ report: undefined, reachable: true });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      try {
        const report = await api.health.check(controller.signal);
        if (!cancelled) setState({ report, reachable: true });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;

        if (err instanceof ApiError && isHealthReport(err.body)) {
          setState({ report: err.body, reachable: true });
          return;
        }

        setState({ report: undefined, reachable: false });
      }
    };

    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return state;
}

function isHealthReport(body: unknown): body is HealthReport {
  return typeof body === 'object' && body !== null && 'checks' in body && 'status' in body;
}
