import { useEffect, useLayoutEffect, useRef } from 'react';

import { api } from '../api/endpoints';
import { LIVE_EVENTS, type ImpactMetrics } from '../types';
import { useLiveEvent } from './use-live-event';
import { useResource, type Resource } from './use-resource';

/** A scenario run emits seven records in seconds; aggregate once they settle. */
const REFRESH_DEBOUNCE_MS = 800;

/**
 * Impact metrics, recomputed after decisions land.
 *
 * `GET /metrics` is a set of aggregate queries over the whole decision log, not
 * a counter read, so it is refreshed on a debounce rather than per event.
 */
export function useMetrics(): Resource<ImpactMetrics> {
  const resource = useResource((signal) => api.metrics.impact(signal), []);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Assigned in a layout effect rather than during render: writing to a ref
  // while rendering is a side effect, and under StrictMode's double render it
  // is not guaranteed to be the value that survives.
  const reload = useRef(resource.reload);
  useLayoutEffect(() => {
    reload.current = resource.reload;
  });

  useLiveEvent(LIVE_EVENTS.DECISION_RECORDED, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => reload.current(), REFRESH_DEBOUNCE_MS);
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  return resource;
}
