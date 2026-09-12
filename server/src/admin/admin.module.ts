import { Module } from '@nestjs/common';

import { FacilityModule } from '../facility/facility.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AccountsService } from './accounts.service';
import { OrganizationsController } from './organizations.controller';
import { UsersController } from './users.controller';

/**
 * The system administrator's HTTP surface: organizations and accounts.
 *
 * Its own module so the domain modules stay acyclic — creating an organization
 * needs the facility registry (which industries exist), and the facility layer
 * already depends on organizations.
 */
@Module({
  imports: [UsersModule, OrganizationsModule, FacilityModule],
  controllers: [UsersController, OrganizationsController],
  providers: [AccountsService],
})
export class AdminModule {}
