import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { belongsToOrganization } from '../common/domain/tenancy';
import { OrganizationsService } from '../organizations/organizations.service';
import type { User } from '../users/domain/user';
import { UserRepository } from '../users/ports/user.repository';
import type { SessionUser } from './session.config';
import { verifyPassword } from './password';

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

/**
 * Signing in, and which organization a session operates in.
 *
 * There is no sign-up. Accounts are created by an admin (AccountsService): an
 * open form that made admins would hand strangers the whole system, and one
 * that made operators would leave them in no organization.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationsService,
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

    return this.sessionFor(found);
  }

  /**
   * The current state of a signed-in account, for refreshing a session.
   *
   * A session is a snapshot taken at login and lives for a week. Re-reading
   * the account when the dashboard loads means a role change, an organization
   * reassignment or a deleted account takes effect on the next visit. An
   * admin keeps the organization they had open, if it still exists. Returns
   * null when the account no longer exists.
   */
  async resolve(userId: string, opened?: string): Promise<SessionUser | null> {
    const user = await this.users.findById(userId);
    return user ? this.sessionFor(user, opened) : null;
  }

  /** An admin opening another organization. The route is admin-only; this checks it exists. */
  async open(session: SessionUser, organizationId: string): Promise<SessionUser> {
    if (!(await this.organizations.findById(organizationId))) {
      throw new BadRequestException('Unknown organization');
    }
    return { ...session, organizationId };
  }

  private async sessionFor(user: User, opened?: string): Promise<SessionUser> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: await this.organizationToOpen(user, opened),
    };
  }

  /**
   * Operators and viewers: their own organization, always.
   *
   * Admins: the one they had open, else the one their account names (accounts
   * created before admins became system-wide still carry one), else the first
   * organization — so an admin lands on a dashboard with something in it.
   */
  private async organizationToOpen(user: User, opened?: string): Promise<string | undefined> {
    if (belongsToOrganization(user.role)) return user.organizationId;

    for (const candidate of [opened, user.organizationId]) {
      if (candidate && (await this.organizations.findById(candidate))) return candidate;
    }

    const [first] = await this.organizations.findAll();
    return first?.id;
  }
}
