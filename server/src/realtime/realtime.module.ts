import { Global, Module } from '@nestjs/common';

import { SocketIoRealtimeGateway } from './adapters/socket-io.gateway';
import { RealtimePublisherPort } from './ports/realtime-publisher.port';

/**
 * Global so that events, operations, decision-log and webhooks can all push to
 * the dashboard without each importing a transport module.
 *
 * The gateway is registered twice on purpose: once as itself, so Nest discovers
 * the @WebSocketGateway decorator and actually starts the server, and once
 * bound to the port so consumers inject the abstraction (S1).
 */
@Global()
@Module({
  providers: [
    SocketIoRealtimeGateway,
    { provide: RealtimePublisherPort, useExisting: SocketIoRealtimeGateway },
  ],
  exports: [RealtimePublisherPort],
})
export class RealtimeModule {}
