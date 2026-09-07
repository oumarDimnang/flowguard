import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { Role, roleAtLeast } from '../../common/domain/tenancy';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces the minimum role a handler declares.
 *
 * The real enforcement for anything that spends money. The client hides
 * controls a Viewer cannot use, but that is tidiness — this is the boundary.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<Role | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<Request>().session?.user;
    if (!user || !roleAtLeast(user.role, required)) {
      throw new ForbiddenException(`Requires ${required.toLowerCase()} access`);
    }

    return true;
  }
}
