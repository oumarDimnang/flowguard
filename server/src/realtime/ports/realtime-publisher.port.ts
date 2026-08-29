import type { LiveEventName } from '../realtime.events';

/**
 * Outbound push to connected dashboards (S1).
 *
 * Abstract class rather than interface so it can serve as a Nest DI token.
 * Services depend on this; only the adapter knows Socket.IO exists, which keeps
 * service unit tests free of a WebSocket server.
 */
export abstract class RealtimePublisherPort {
  abstract publish<T>(event: LiveEventName, payload: T): void;

  /** Number of currently connected dashboard clients — used by /health. */
  abstract connectedClients(): number;
}
