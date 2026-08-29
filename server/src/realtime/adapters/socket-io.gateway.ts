import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import { LIVE_NAMESPACE, type LiveEventName } from '../realtime.events';
import { RealtimePublisherPort } from '../ports/realtime-publisher.port';

/**
 * Socket.IO fan-out to the operations dashboard.
 *
 * Push-only by design: the dashboard never sends commands over the socket, it
 * uses REST for that. Keeping the socket unidirectional means there is no
 * authorisation surface here to get wrong.
 *
 * CORS is intentionally permissive on the socket namespace because the
 * dashboard is served from a different origin in development (Vite on :5173).
 * Tighten this before any public deployment.
 */
@WebSocketGateway({
  namespace: LIVE_NAMESPACE,
  cors: { origin: true, credentials: true },
})
export class SocketIoRealtimeGateway
  extends RealtimePublisherPort
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SocketIoRealtimeGateway.name);

  @WebSocketServer()
  private server!: Namespace;

  handleConnection(client: Socket): void {
    this.logger.log(`Dashboard connected: ${client.id} (${this.connectedClients()} total)`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Dashboard disconnected: ${client.id} (${this.connectedClients()} total)`);
  }

  publish<T>(event: LiveEventName, payload: T): void {
    // The server is undefined until the gateway has initialised. Emitting
    // before that would throw and take down whatever HTTP request triggered it,
    // so a dropped frame is preferable to a failed decision write.
    if (!this.server) {
      this.logger.warn(`Dropped '${event}' — gateway not initialised`);
      return;
    }
    this.server.emit(event, payload);
  }

  connectedClients(): number {
    return this.server?.sockets?.size ?? 0;
  }
}
