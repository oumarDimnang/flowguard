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

import { Industry } from '../common/domain/tenancy';
import { FacilityRegistry } from '../facility/facility.registry';
import { OrganizationsService } from '../organizations/organizations.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginThrottleGuard, pairKey } from './guards/login-throttle.guard';
import { LoginRateLimiter } from './login-rate-limiter';
import { SESSION_COOKIE, type SessionUser } from './session.config';

/** What the dashboard needs to render its shell. */
export interface Identity {
  user: Omit<SessionUser, 'organizationId'>;
  organization: { id: string; slug: string; name: string; industry: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly organizations: OrganizationsService,
    private readonly facilities: FacilityRegistry,
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

    await establishSession(request, user);
    return this.identity(user);
  }

  /**
   * Sign up: a new organization, with the caller as its first admin.
   *
   * Signed in on success, so the first thing a new admin sees is their own
   * empty control room rather than a login form asking for what they just typed.
   */
  @Public()
  @UseGuards(LoginThrottleGuard)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() request: Request): Promise<Identity> {
    const user = await this.auth.register(dto);
    await establishSession(request, user);
    return this.identity(user);
  }

  /** Which industries the sign-up form may offer. Public: the form is shown before login. */
  @Public()
  @Get('industries')
  industries(): { industries: Industry[] } {
    return { industries: this.facilities.supported() };
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
   * is signed out on its next visit and a changed role is picked up without
   * waiting for the cookie to expire.
   */
  @Get('me')
  async me(
    @CurrentUser() session: SessionUser | undefined,
    @Req() request: Request,
  ): Promise<Identity> {
    if (!session) throw new UnauthorizedException('Sign in to continue');

    const user = await this.auth.resolve(session.id);
    if (!user) {
      await new Promise<void>((resolve) => {
        request.session.destroy(() => resolve());
      });
      throw new UnauthorizedException('This account no longer exists');
    }

    request.session.user = user;
    return this.identity(user);
  }

  private async identity(user: SessionUser): Promise<Identity> {
    const organization = await this.organizations.findOne(user.organizationId);

    return {
      // organizationId is omitted deliberately: it is a server-side scoping
      // key, and the client has no use for it that is not better served by the
      // organization object below.
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        industry: organization.industry,
      },
    };
  }
}

/**
 * Regenerate the session id, attach the user, and persist before responding.
 *
 * Shared by login and registration so neither can forget the regeneration —
 * a sign-up that kept a pre-existing session id would be the same fixation
 * hole login closes.
 */
async function establishSession(request: Request, user: SessionUser): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    request.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  request.session.user = user;

  await new Promise<void>((resolve, reject) => {
    request.session.save((err) => (err ? reject(err) : resolve()));
  });
}
