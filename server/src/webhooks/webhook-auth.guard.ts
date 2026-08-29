import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { safeCompare } from '../common/guards/internal-token.guard';
import type { NokiaConfig } from '../config/configuration';

/**
 * Verifies the notification auth token Nokia echoes back on callbacks (S8).
 *
 * When a QoD session or congestion subscription is created, the caller supplies
 * a sink URL and a token. Nokia returns that token on every callback to that
 * sink. Since this endpoint is publicly reachable — it must be, for Nokia to
 * reach it — the token is the only thing standing between the internet and the
 * ability to inject fake network events into a running workflow.
 *
 * Accepts either `Authorization: Bearer <token>` or the bare
 * `X-Nokia-Notification-Token` header, because the exact header Nokia uses
 * varies by API and can only be confirmed against a live sandbox.
 */
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.getOrThrow<NokiaConfig>('nokia').webhookToken;

    const presented = this.extractToken(request);
    if (!presented || !safeCompare(presented, expected)) {
      throw new UnauthorizedException('Invalid notification token');
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }

    const header = request.headers['x-nokia-notification-token'];
    return Array.isArray(header) ? header[0] : header;
  }
}
