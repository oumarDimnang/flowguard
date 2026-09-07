import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SessionModule } from './auth/session.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DecisionLogModule } from './decision-log/decision-log.module';
import { EventsModule } from './events/events.module';
import { FacilityModule } from './facility/facility.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { OperationsModule } from './operations/operations.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SimulatorModule } from './simulator/simulator.module';
import { TemporalModule } from './temporal/temporal.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

/**
 * Composition root.
 *
 * Infrastructure first (config, database, sessions, orchestration, transport),
 * then the feature modules. ConfigModule must come first: everything below it
 * reads validated configuration, and a bad environment should fail here rather
 * than halfway through wiring.
 *
 * **Both auth guards are global.** Registering them route by route means the
 * failure mode is an endpoint somebody forgot to protect, and nothing about a
 * missing decorator looks wrong in review. Global inverts it: everything is
 * closed, and the three surfaces that genuinely cannot carry a session opt out
 * with @Public — which is greppable.
 */
@Module({
  imports: [
    // ── Infrastructure ────────────────────────────────────────────────
    ConfigModule,
    DatabaseModule,
    SessionModule, // @Global — the one session middleware, shared with Socket.IO
    TemporalModule, // @Global — provides WorkflowOrchestratorPort
    RealtimeModule, // @Global — provides RealtimePublisherPort

    // ── Tenancy ───────────────────────────────────────────────────────
    OrganizationsModule,
    UsersModule,
    AuthModule,

    // ── Features ──────────────────────────────────────────────────────
    OperationsModule,
    DecisionLogModule,
    EventsModule,
    WebhooksModule,
    MetricsModule,
    SimulatorModule,
    FacilityModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authentication before authorisation, so RolesGuard can
    // assume a user is present rather than re-checking.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
