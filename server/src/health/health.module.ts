import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * WorkflowOrchestratorPort and RealtimePublisherPort come from @Global modules,
 * and the Mongoose connection from the global MongooseModule.forRootAsync — so
 * this module needs no imports of its own.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
