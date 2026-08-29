import { Module } from '@nestjs/common';

import { OperationsModule } from '../operations/operations.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * WorkflowOrchestratorPort is not imported here — TemporalModule is @Global,
 * so the port is already in scope.
 */
@Module({
  imports: [OperationsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
