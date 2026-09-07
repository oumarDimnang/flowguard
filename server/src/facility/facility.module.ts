import { Module } from '@nestjs/common';

import { DecisionLogModule } from '../decision-log/decision-log.module';
import { EventsModule } from '../events/events.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ContainerTerminalSystem } from './adapters/container-terminal/container-terminal.system';
import { DroneOperationsSystem } from './adapters/drone-operations/drone-operations.system';
import { FacilityController } from './facility.controller';
import { FacilityRegistry } from './facility.registry';

/**
 * The facility layer: one adapter per industry, selected per organization.
 *
 * Dependency direction is one-way — facility -> decision-log, never the
 * reverse. A facility reads decisions to know when a gate may open; nothing in
 * the decision path knows a facility exists.
 *
 * Adding an industry is two steps: write the adapter, list it here.
 */
@Module({
  imports: [EventsModule, DecisionLogModule, OrganizationsModule],
  controllers: [FacilityController],
  providers: [ContainerTerminalSystem, DroneOperationsSystem, FacilityRegistry],
  exports: [FacilityRegistry],
})
export class FacilityModule {}
