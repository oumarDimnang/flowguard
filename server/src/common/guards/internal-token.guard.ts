import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import type { AppConfig } from '../../config/configuration';

/**
 * Constant-time string comparison.
 *
 * A plain `===` on a secret leaks its prefix through response timing. The
 * length check first is unavoidable and safe to leak.
 */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Protects endpoints the Python worker calls (POST /internal/decisions).
 *
 * These are reachable from the public internet in any deployment where the
 * worker is not co-located, so they need a real check rather than a network
 * assumption.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const expected = this.config.getOrThrow<AppConfig>('app').internalApiToken;

    if (!safeCompare(header.slice('Bearer '.length), expected)) {
      throw new UnauthorizedException('Invalid internal token');
    }

    return true;
  }
}
