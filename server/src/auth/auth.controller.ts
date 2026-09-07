import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { OrganizationsService } from '../organizations/organizations.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { SessionUser } from './session.config';

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
  ) {}

  /**
   * Sign in.
   *
   * The session id is regenerated on success — without that, an attacker who
   * can set a victim's cookie before login keeps a valid session afterwards
   * (session fixation).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<Identity> {
    const user = await this.auth.authenticate(dto.email, dto.password);

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    request.session.user = user;

    await new Promise<void>((resolve, reject) => {
      request.session.save((err) => (err ? reject(err) : resolve()));
    });

    return this.identity(user);
  }

  /** Destroys the session server-side, so it is revoked rather than forgotten. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request): Promise<void> {
    await new Promise<void>((resolve) => {
      request.session.destroy(() => resolve());
    });
  }

  /** Who am I, and which organization am I in. Drives the shell on first paint. */
  @Get('me')
  async me(@CurrentUser() user: SessionUser | undefined): Promise<Identity> {
    if (!user) throw new UnauthorizedException('Sign in to continue');
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
