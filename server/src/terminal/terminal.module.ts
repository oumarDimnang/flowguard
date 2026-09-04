import { Module } from '@nestjs/common';

import { DecisionLogModule } from '../decision-log/decision-log.module';
import { EventsModule } from '../events/events.module';
import { TerminalController } from './terminal.controller';
import { TerminalService } from './terminal.service';

/**
 * The dependency direction is one-way and deliberate: terminal -> decision-log,
 * never the reverse. The TOS reads decisions to know when the hoist interlock
 * may open; nothing in the decision path knows a terminal exists.
 *
 * RealtimePublisherPort is not imported — RealtimeModule is @Global.
 */
@Module({
  imports: [EventsModule, DecisionLogModule],
  controllers: [TerminalController],
  providers: [TerminalService],
  exports: [TerminalService],
})
export class TerminalModule {}
