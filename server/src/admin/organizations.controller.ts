import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session.config';
import { Role, type Industry } from '../common/domain/tenancy';
import type { Organization } from '../organizations/domain/organization';
import { AccountsService } from './accounts.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

/** Every organization in the system. Admin only. */
@Controller('organizations')
@RequireRole(Role.ADMIN)
export class OrganizationsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(): Promise<Organization[]> {
    return this.accounts.listOrganizations();
  }

  /** The industries the create form may offer. */
  @Get('industries')
  industries(): { industries: Industry[] } {
    return { industries: this.accounts.industries() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<Organization> {
    return this.accounts.createOrganization(dto, actor);
  }
}
