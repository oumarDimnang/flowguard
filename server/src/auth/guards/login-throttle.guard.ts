import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { LoginRateLimiter } from '../login-rate-limiter';

/**
 * Attempts per client address, per window. Generous, because an office NATs
 * every operator behind one address and a whole shift signing in at once
 * must not look like an attack.
 */
export const IP_LIMIT = 30;

/**
 * Attempts per (address, email) pair. Keyed on the pair rather than the email
 * alone on purpose: an email-only lock would let anyone who knows an
 * operator's address lock them out of the dashboard during a live operation,
 * which is a worse outcome than the guessing it prevents.
 */
export const PAIR_LIMIT = 5;

/**
 * Bounds credential guessing on the routes that accept a password.
 *
 * Applied to login and registration rather than globally: every other route
 * is behind a session, and a session cannot be guessed.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  constructor(private readonly limiter: LoginRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const verdicts = [
      this.limiter.hit(ipKey(request), IP_LIMIT),
      ...(pairKey(request) ? [this.limiter.hit(pairKey(request)!, PAIR_LIMIT)] : []),
    ];

    const refused = verdicts.find((verdict) => !verdict.allowed);
    if (refused) {
      response.setHeader('Retry-After', String(refused.retryAfterSeconds));
      // An object payload, so the exception filter reports the right label
      // instead of its InternalServerError default for string payloads.
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again in a few minutes.',
          error: 'TooManyRequests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

/** `trust proxy` is set in main.ts, so this is the real client behind a TLS terminator. */
export function ipKey(request: Request): string {
  return `ip:${request.ip ?? 'unknown'}`;
}

/** Undefined when the body carries no usable email — validation will reject it anyway. */
export function pairKey(request: Request): string | undefined {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string' || email.length === 0) return undefined;
  return `pair:${request.ip ?? 'unknown'}:${email.toLowerCase().trim()}`;
}
