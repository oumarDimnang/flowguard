import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DecisionLogModule } from './decision-log/decision-log.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { OperationsModule } from './operations/operations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SimulatorModule } from './simulator/simulator.module';
import { TemporalModule } from './temporal/temporal.module';
import { WebhooksModule } from './webhooks/webhooks.module';

/**
 * Composition root.
 *
 * Infrastructure first (config, database, orchestration, transport), then the
 * feature modules. ConfigModule must come first: everything below it reads
 * validated configuration, and a bad environment should fail here rather than
 * halfway through wiring.
 */
@Module({
  imports: [
    // ── Infrastructure ────────────────────────────────────────────────
    ConfigModule,
    DatabaseModule,
    TemporalModule, // @Global — provides WorkflowOrchestratorPort
    RealtimeModule, // @Global — provides RealtimePublisherPort

    // ── Features ──────────────────────────────────────────────────────
    OperationsModule,
    DecisionLogModule,
    EventsModule,
    WebhooksModule,
    MetricsModule,
    SimulatorModule,
    HealthModule,
  ],
})
export class AppModule {}
