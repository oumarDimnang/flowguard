import type { LiveEventName } from '../realtime.events';

/**
 * Outbound push to connected dashboards (S1).
 *
 * Abstract class rather than interface so it can serve as a Nest DI token.
 * Services depend on this; only the adapter knows Socket.IO exists, which keeps
 * service unit tests free of a WebSocket server.
 *
 * **The organization is the first argument, and it is required.** This used to
 * be a broadcast to every connected client, which with more than one tenant
 * means org A watching org B work in real time — a live data leak rather than a
 * query someone forgot to filter. Putting the tenant in the signature turns
 * "did I scope this?" into a compile error at every publish site.
 */
export abstract class RealtimePublisherPort {
  abstract publish<T>(organizationId: string, event: LiveEventName, payload: T): void;

  /** Connected dashboards for one organization — used by /health. */
  abstract connectedClients(organizationId: string): number;

  /** Total across all organizations. Operational metric, not tenant data. */
  abstract totalConnectedClients(): number;
}
