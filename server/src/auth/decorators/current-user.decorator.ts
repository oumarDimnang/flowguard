import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { SessionUser } from '../session.config';

/**
 * The signed-in user, from the session.
 *
 * Only ever populated by SessionAuthGuard, so a handler that reads it without
 * that guard gets undefined rather than an unauthenticated request slipping
 * through as some default identity.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | undefined =>
    context.switchToHttp().getRequest<Request>().session?.user,
);

/**
 * Just the organization id — the argument nearly every service method takes.
 *
 * Read from the session and nowhere else. There is deliberately no way for a
 * client to supply one.
 */
export const OrgId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const user = context.switchToHttp().getRequest<Request>().session?.user;
  if (!user) {
    // Unreachable behind SessionAuthGuard. Throwing rather than returning a
    // blank string means a missing guard fails loudly instead of quietly
    // querying with an empty tenant key, which would match nothing today and
    // could match everything after a careless refactor.
    throw new Error('OrgId used on a route without SessionAuthGuard');
  }
  return user.organizationId;
});
