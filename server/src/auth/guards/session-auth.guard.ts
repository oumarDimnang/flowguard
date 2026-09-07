import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Requires a signed-in user.
 *
 * Registered globally in app.module.ts rather than route by route, because the
 * failure mode of the opposite arrangement is an unprotected endpoint nobody
 * notices. Routes that must stay open declare it with @Public, which is
 * greppable in a way a missing decorator is not.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Non-HTTP contexts (the WebSocket gateway) authenticate at handshake.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.session?.user) {
      throw new UnauthorizedException('Sign in to continue');
    }

    return true;
  }
}
