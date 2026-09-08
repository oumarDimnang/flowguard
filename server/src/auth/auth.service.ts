import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { Industry, Role } from '../common/domain/tenancy';
import { FacilityRegistry } from '../facility/facility.registry';
import { SlugTakenError } from '../organizations/domain/organization.errors';
import { OrganizationsService } from '../organizations/organizations.service';
import type { User } from '../users/domain/user';
import { EmailTakenError } from '../users/domain/user.errors';
import { UserRepository } from '../users/ports/user.repository';
import type { RegisterDto } from './dto/register.dto';
import type { SessionUser } from './session.config';
import { hashPassword, verifyPassword } from './password';
import { slugify } from './slug';

/**
 * A dummy argon2 hash, verified against when no user matches.
 *
 * Without it, a missing account returns in microseconds while a real one takes
 * the full hashing time, and that difference is a reliable oracle for
 * enumerating which email addresses have accounts. Verifying against a throwaway
 * hash makes both paths cost the same.
 */
const TIMING_DECOY =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$D5nqxLLuqEHrfN1yFA5aQnHFbXcSDbXvNSMBK2Yqz1w';

/** How many slug collisions to tolerate before giving up on a name. */
const SLUG_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationsService,
    private readonly facilities: FacilityRegistry,
  ) {}

  /**
   * Verify credentials and return what belongs on the session.
   *
   * Wrong email and wrong password raise the identical error on purpose. Which
   * half was wrong is not information a login form should give away.
   */
  async authenticate(email: string, password: string): Promise<SessionUser> {
    const found = await this.users.findByEmailWithSecret(email);

    const ok = await verifyPassword(found?.passwordHash ?? TIMING_DECOY, password);

    if (!found || !ok) {
      this.logger.warn(`Failed login for '${email}'`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Best-effort: a failed timestamp update must not fail a valid login.
    void this.users
      .recordLogin(found.id, new Date())
      .catch((err: Error) => this.logger.warn(`Could not record login: ${err.message}`));

    return toSessionUser(found);
  }

  /**
   * Create an organization and its first administrator, in that order.
   *
   * The two writes are not one transaction, so the failure between them is
   * handled by hand: an organization whose admin could not be created is
   * deleted again, because a tenant nobody can sign in to is not recoverable
   * from the outside.
   *
   * Registration never joins an existing organization. See RegisterDto.
   */
  async register(dto: RegisterDto): Promise<SessionUser> {
    if (!this.facilities.supports(dto.industry)) {
      const supported = this.facilities.supported().join(', ');
      throw new BadRequestException(
        `FlowGuard does not model '${dto.industry}' yet (${supported})`,
      );
    }

    // A courtesy check so the common case is a clean 409 without an orphaned
    // organization to clean up. The unique index is what actually guarantees it.
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('An account already exists for that email');
    }

    const organization = await this.createOrganization(dto.organizationName, dto.industry);

    let user: User;
    try {
      user = await this.users.create({
        organizationId: organization.id,
        email: dto.email.toLowerCase().trim(),
        name: dto.name.trim(),
        role: Role.ADMIN,
        passwordHash: await hashPassword(dto.password),
      });
    } catch (err) {
      await this.organizations
        .delete(organization.id)
        .catch((cleanup: Error) =>
          this.logger.error(`Orphaned organization ${organization.id}: ${cleanup.message}`),
        );

      if (err instanceof EmailTakenError) {
        throw new ConflictException('An account already exists for that email');
      }
      throw err;
    }

    this.logger.log(`Registered ${user.email} as admin of '${organization.slug}'`);
    return toSessionUser(user);
  }

  /**
   * The current state of a signed-in account, for refreshing a session.
   *
   * A session is a snapshot taken at login and lives for a week. Re-reading
   * the account when the dashboard loads means a role change or a deleted
   * account takes effect on the next visit rather than the next Tuesday.
   * Returns null when the account no longer exists.
   */
  async resolve(userId: string): Promise<SessionUser | null> {
    const user = await this.users.findById(userId);
    return user ? toSessionUser(user) : null;
  }

  /**
   * Try the natural slug first, then a handful of suffixed ones.
   *
   * Two ports can both be called "North Terminal"; the second gets
   * 'north-terminal-a1f3'. Random rather than sequential so the suffix does
   * not count how many tenants share a name.
   */
  private async createOrganization(name: string, industry: Industry) {
    const base = slugify(name);

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        return await this.organizations.create({ slug, name: name.trim(), industry });
      } catch (err) {
        if (!(err instanceof SlugTakenError)) throw err;
      }
    }

    throw new ConflictException('Could not find a free short name for that organization');
  }
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
