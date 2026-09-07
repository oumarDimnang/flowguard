import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { onLiveEvent, onSocketStatus } from '../api/socket';
import type { LiveEventName, LiveEventPayload } from '../types';

/**
 * Subscribe to one push event for the lifetime of the component.
 *
 * The handler is held in a ref, so an inline arrow at the call site does not
 * cause a resubscribe on every render. That matters beyond tidiness: a
 * resubscribe has a gap between `off` and `on`, and an event delivered in that
 * gap is gone — during a live demo that reads as the dashboard freezing.
 */
export function useLiveEvent<E extends LiveEventName>(
  event: E,
  handler: (payload: LiveEventPayload<E>) => void,
): void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => onLiveEvent(event, (payload) => handlerRef.current(payload)), [event]);
}

/**
 * Whether the shared socket is currently connected.
 *
 * Worth surfacing somewhere permanent: if this goes false the dashboard still
 * renders, but it has quietly stopped being live, and that is indistinguishable
 * from "nothing is happening".
 */
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => onSocketStatus(setConnected), []);
  return connected;
}
