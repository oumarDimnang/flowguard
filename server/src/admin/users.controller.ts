import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session.config';
import { Role } from '../common/domain/tenancy';
import type { User } from '../users/domain/user';
import { AccountsService } from './accounts.service';
import { AssignOrganizationDto } from './dto/assign-organization.dto';
import { CreateUserDto } from './dto/create-user.dto';

/** Every account in the system. Admin only. */
@Controller('users')
@RequireRole(Role.ADMIN)
export class UsersController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(): Promise<User[]> {
    return this.accounts.listUsers();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: SessionUser): Promise<User> {
    return this.accounts.createUser(dto, actor);
  }

  @Patch(':id/organization')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignOrganizationDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<User> {
    return this.accounts.assignOrganization(id, dto.organizationId, actor);
  }
}
