import { ConflictException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
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
export const OrgId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    organizationOf(context.switchToHttp().getRequest<Request>().session?.user),
);

/**
 * The organization a session operates in, or a refusal.
 *
 * No user is a wiring error: unreachable behind SessionAuthGuard, and thrown
 * rather than returning a blank string, because querying with an empty tenant
 * key matches nothing today and could match everything after a careless
 * refactor. No organization is an admin with nothing open — a 409 the client
 * answers by asking them to open one.
 */
export function organizationOf(user: SessionUser | undefined): string {
  if (!user) {
    throw new Error('OrgId used on a route without SessionAuthGuard');
  }
  if (!user.organizationId) {
    throw new ConflictException('No organization is open');
  }
  return user.organizationId;
}
