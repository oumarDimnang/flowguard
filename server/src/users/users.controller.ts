import { Controller, Get } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/decorators/roles.decorator';
import { Role } from '../common/domain/tenancy';
import type { User } from './domain/user';
import { UsersService } from './users.service';

/**
 * Who else is in this organization.
 *
 * The only route, and it is deliberately narrow. `findByOrganization` is scoped
 * by construction — there is no unscoped list of users to accidentally expose —
 * and the organization id comes from the session rather than from a parameter,
 * so no request can ask about a tenant it does not belong to.
 *
 * ADMIN-only. Seeing who has an operator account is knowing who can dispatch
 * work at a live facility, which is not something a viewer needs.
 *
 * Read-only for now: invites and role changes both alter what somebody can do
 * to a running terminal, and neither should ship without an audit record of who
 * made the change. The client renders those controls disabled rather than
 * pretending the capability exists.
 */
@Controller('users')
@RequireRole(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@OrgId() organizationId: string): Promise<User[]> {
    return this.users.findByOrganization(organizationId);
  }
}
