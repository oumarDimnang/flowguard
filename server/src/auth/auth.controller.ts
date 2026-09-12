import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Role } from '../common/domain/tenancy';
import { OrganizationsService } from '../organizations/organizations.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RequireRole } from './decorators/roles.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { OpenOrganizationDto } from './dto/open-organization.dto';
import { LoginThrottleGuard, pairKey } from './guards/login-throttle.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { SESSION_COOKIE, type SessionUser } from './session.config';

/** What the dashboard needs to render its shell. */
export interface Identity {
  user: Omit<SessionUser, 'organizationId'>;
  /**
   * The organization this session operates in. Absent only for an admin when
   * no organization exists yet.
   */
  organization?: { id: string; slug: string; name: string; industry: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly organizations: OrganizationsService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  /**
   * Sign in.
   *
   * The session id is regenerated on success — without that, an attacker who
   * can set a victim's cookie before login keeps a valid session afterwards
   * (session fixation).
   */
  @Public()
  @UseGuards(LoginThrottleGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<Identity> {
    const user = await this.auth.authenticate(dto.email, dto.password);

    // A correct password is the end of the window, not one more attempt in it.
    const key = pairKey(request);
    if (key) this.limiter.clear(key);

    await regenerate(request, user);
    return this.identity(user);
  }

  /**
   * Destroys the session server-side, so it is revoked rather than forgotten.
   * The cookie is cleared too — it is already useless, but a dead cookie that
   * keeps travelling on every request is noise in every log downstream.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      request.session.destroy(() => resolve());
    });
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /**
   * Who am I, and which organization am I in. Drives the shell on first paint.
   *
   * Re-reads the account rather than echoing the session, so a deleted account
   * is signed out on its next visit and a changed role or organization is
   * picked up without waiting for the cookie to expire.
   */
  @Get('me')
  async me(
    @CurrentUser() session: SessionUser | undefined,
    @Req() request: Request,
  ): Promise<Identity> {
    if (!session) throw new UnauthorizedException('Sign in to continue');

    const user = await this.auth.resolve(session.id, session.organizationId);
    if (!user) {
      await new Promise<void>((resolve) => {
        request.session.destroy(() => resolve());
      });
      throw new UnauthorizedException('This account no longer exists');
    }

    request.session.user = user;
    return this.identity(user);
  }

  /**
   * An admin opening a different organization.
   *
   * Saved before responding: the client reconnects its socket straight after,
   * and the handshake must read the new organization, or it joins the old
   * organization's room.
   */
  @Post('organization')
  @RequireRole(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async open(
    @Body() dto: OpenOrganizationDto,
    @CurrentUser() session: SessionUser,
    @Req() request: Request,
  ): Promise<Identity> {
    const user = await this.auth.open(session, dto.organizationId);

    request.session.user = user;
    await new Promise<void>((resolve, reject) => {
      request.session.save((err) => (err ? reject(err) : resolve()));
    });

    return this.identity(user);
  }

  private async identity(user: SessionUser): Promise<Identity> {
    const organization = user.organizationId
      ? await this.organizations.findById(user.organizationId)
      : null;

    return {
      // organizationId is omitted deliberately: it is a server-side scoping
      // key, and the client has no use for it that is not better served by the
      // organization object below.
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: organization
        ? {
            id: organization.id,
            slug: organization.slug,
            name: organization.name,
            industry: organization.industry,
          }
        : undefined,
    };
  }
}

/**
 * Regenerate the session id, attach the user, and persist before responding.
 *
 * A session that kept a pre-existing id across sign-in would be a session
 * fixation hole.
 */
async function regenerate(request: Request, user: SessionUser): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    request.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  request.session.user = user;

  await new Promise<void>((resolve, reject) => {
    request.session.save((err) => (err ? reject(err) : resolve()));
  });
}
