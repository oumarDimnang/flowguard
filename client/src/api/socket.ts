import { io, type Socket } from 'socket.io-client';

import { LIVE_NAMESPACE, type LiveEventName, type LiveEventPayload } from '../types';
import { API_URL } from './client';

/**
 * The live push channel.
 *
 * Socket.IO rather than a raw WebSocket: the server's gateway is
 * @nestjs/platform-socket.io, and a plain `new WebSocket(...)` will not
 * complete the Engine.IO handshake.
 *
 * One shared connection for the whole app. Every panel listens to the same six
 * events, and opening a socket per component would show up in the server's
 * connected-client count — which is rendered on the health strip, so it would
 * be visibly wrong.
 */

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(`${API_URL}/${LIVE_NAMESPACE}`, {
    // Skip the HTTP long-poll upgrade dance. Both ends speak WebSocket and the
    // extra round trip is visible when a dispatch is meant to feel immediate.
    transports: ['websocket'],
    // Sends the session cookie with the handshake. The server rejects any
    // socket it cannot identify, because a connection with no organization has
    // no room to join.
    withCredentials: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4_000,
  });

  return socket;
}

/**
 * Subscribe to one push event.
 *
 * Returns an unsubscribe function, so a React effect can return it directly.
 * The connection itself is never closed here — it is shared, and a component
 * unmounting must not disconnect the panels still listening.
 */
export function onLiveEvent<E extends LiveEventName>(
  event: E,
  handler: (payload: LiveEventPayload<E>) => void,
): () => void {
  const active = getSocket();

  // socket.io types `on` around a reserved-event union; a namespaced event name
  // falls into its untyped branch, which wants an any-args listener. The
  // payload type is enforced by LiveEventPayloads at the call site, and this
  // cast is the boundary where that guarantee ends — the server's publish sites
  // are the other half of it.
  const listener = handler as SocketListener;

  // Widened to `string` deliberately. socket.io resolves its listener type
  // through a conditional on the event name, and while `E` is still generic
  // that conditional stays deferred and matches nothing.
  const name: string = event;

  active.on(name, listener);
  return () => {
    active.off(name, listener);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SocketListener = (...args: any[]) => void;

/** Subscribe to connection state. Returns an unsubscribe function. */
export function onSocketStatus(handler: (connected: boolean) => void): () => void {
  const active = getSocket();

  const onConnect = () => handler(true);
  const onDisconnect = () => handler(false);

  active.on('connect', onConnect);
  active.on('disconnect', onDisconnect);

  // Report the current state immediately rather than leaving the caller to
  // guess until the next transition.
  handler(active.connected);

  return () => {
    active.off('connect', onConnect);
    active.off('disconnect', onDisconnect);
  };
}

/** Tear the shared connection down. For tests and hot-reload teardown only. */
export function closeSocket(): void {
  socket?.close();
  socket = null;
}
