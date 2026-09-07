import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Request, RequestHandler, Response } from 'express';
import type { Namespace, Socket } from 'socket.io';

import { LIVE_NAMESPACE, type LiveEventName } from '../realtime.events';
import { RealtimePublisherPort } from '../ports/realtime-publisher.port';
import { SESSION_MIDDLEWARE } from '../realtime.tokens';

/**
 * Socket.IO fan-out to the operations dashboard.
 *
 * Push-only by design: the dashboard never sends commands over the socket, it
 * uses REST for that. Keeping the socket unidirectional means there is no
 * authorisation surface here to get wrong beyond the handshake.
 *
 * **Every socket is authenticated and joined to exactly one room**, named for
 * its organization. Emits target that room, never the namespace — a namespace
 * emit reaches every tenant, which is the one mistake this file cannot make.
 */
@WebSocketGateway({
  namespace: LIVE_NAMESPACE,
  // Credentials must be allowed for the session cookie to arrive at all; a
  // wildcard origin with credentials is rejected by browsers, so the client
  // origin is set from configuration in main.ts.
  cors: { origin: true, credentials: true },
})
export class SocketIoRealtimeGateway
  extends RealtimePublisherPort
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SocketIoRealtimeGateway.name);

  @WebSocketServer()
  private server!: Namespace;

  /**
   * The *same* middleware instance Express uses.
   *
   * Two instances would each hold their own store handle, and the socket would
   * authenticate against session state the HTTP side never wrote.
   */
  constructor(
    @Inject(SESSION_MIDDLEWARE) private readonly sessionMiddleware: RequestHandler,
  ) {
    super();
  }

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.sessionMiddleware(
        socket.request as Request,
        {} as Response,
        next as (err?: unknown) => void,
      );
    });

    // Reject anonymous sockets outright rather than connecting them to a room
    // they can never be given.
    server.use((socket, next) => {
      const user = (socket.request as Request).session?.user;
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }
      void socket.join(room(user.organizationId));
      next();
    });
  }

  handleConnection(client: Socket): void {
    const user = (client.request as Request).session?.user;
    this.logger.log(`Dashboard connected: ${client.id} (org ${user?.organizationId ?? 'none'})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Dashboard disconnected: ${client.id}`);
  }

  publish<T>(organizationId: string, event: LiveEventName, payload: T): void {
    // The server is undefined until the gateway has initialised. Emitting
    // before that would throw and take down whatever HTTP request triggered it,
    // so a dropped frame is preferable to a failed decision write.
    if (!this.server) {
      this.logger.warn(`Dropped '${event}' — gateway not initialised`);
      return;
    }

    this.server.to(room(organizationId)).emit(event, payload);
  }

  connectedClients(organizationId: string): number {
    return this.server?.adapter?.rooms?.get(room(organizationId))?.size ?? 0;
  }

  totalConnectedClients(): number {
    return this.server?.sockets?.size ?? 0;
  }
}

/** One room per tenant. Prefixed so it can never collide with a socket id. */
function room(organizationId: string): string {
  return `org:${organizationId}`;
}
