import 'reflect-metadata';
import type { RequestHandler } from 'express';
import type { Namespace, Socket } from 'socket.io';
import { describe, expect, it, vi } from 'vitest';

import { LIVE_EVENTS } from '../realtime.events';
import { SocketIoRealtimeGateway } from './socket-io.gateway';

type Middleware = (socket: Socket, next: (error?: Error) => void) => void;

// The real gateway installs its middleware into this fake transport. No HTTP
// server, session store, database, or WebSocket connection is opened.
function harness(organizationId?: string, sessionError?: Error) {
  const middleware: Middleware[] = [];
  const roomEmit = vi.fn();
  const namespace = {
    use: vi.fn((handler: Middleware) => middleware.push(handler)),
    to: vi.fn(() => ({ emit: roomEmit })),
    emit: vi.fn(),
    adapter: { rooms: new Map<string, Set<string>>() },
    sockets: new Map(),
  };
  const sessionMiddleware: RequestHandler = (request, _response, next) => {
    if (sessionError) return next(sessionError);
    // Mimic an already-authenticated session, without credentials or cookies.
    if (organizationId) {
      Object.assign(request, { session: { user: { organizationId } } });
    }
    next();
  };
  const gateway = new SocketIoRealtimeGateway(sessionMiddleware);
  // Nest normally assigns the namespace through @WebSocketServer.
  Object.assign(gateway, { server: namespace });
  gateway.afterInit(namespace as unknown as Namespace);

  const socket = {
    request: {},
    handshake: { auth: { organizationId: 'org-attacker-choice' } },
    join: vi.fn(),
  };
  async function connect() {
    for (const handler of middleware) {
      await new Promise<void>((resolve, reject) => {
        handler(socket as unknown as Socket, (error) => error ? reject(error) : resolve());
      });
    }
  }
  return { gateway, namespace, roomEmit, socket, connect };
}

describe('SocketIoRealtimeGateway organization isolation', () => {
  it('rejects anonymous sockets even when the handshake names an organization', async () => {
    const { connect, socket } = harness();

    await expect(connect()).rejects.toThrow('unauthorized');
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('stops before joining a room when session loading fails', async () => {
    const failure = new Error('Simulated session store failure');
    const { connect, socket } = harness(undefined, failure);

    await expect(connect()).rejects.toBe(failure);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins only the session organization, ignoring the client-selected organization', async () => {
    const { connect, socket } = harness('org-a');

    await connect();

    expect(socket.join).toHaveBeenCalledExactlyOnceWith('org:org-a');
  });

  it.each(Object.values(LIVE_EVENTS))('scopes %s to its organization without broadcasting', (event) => {
    const { gateway, namespace, roomEmit } = harness();
    const payloadA = { operationId: 'same-operation-id', marker: 'organization A' };
    const payloadB = { operationId: 'same-operation-id', marker: 'organization B' };

    gateway.publish('org-a', event, payloadA);
    gateway.publish('org-b', event, payloadB);

    expect(namespace.to.mock.calls).toEqual([['org:org-a'], ['org:org-b']]);
    expect(roomEmit.mock.calls).toEqual([[event, payloadA], [event, payloadB]]);
    expect(namespace.emit).not.toHaveBeenCalled();
  });

  it('counts connected clients only in the requested organization room', () => {
    const { gateway, namespace } = harness();
    namespace.adapter.rooms.set('org:org-a', new Set(['a-1']));
    namespace.adapter.rooms.set('org:org-b', new Set(['b-1', 'b-2']));

    expect(gateway.connectedClients('org-a')).toBe(1);
    expect(gateway.connectedClients('org-b')).toBe(2);
    expect(gateway.connectedClients('org-missing')).toBe(0);
  });
});
