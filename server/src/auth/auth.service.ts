import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import type { SessionUser } from './session.config';
import { UserRepository } from '../users/ports/user.repository';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly users: UserRepository) {}

  /**
   * Verify credentials and return what belongs on the session.
   *
   * Wrong email and wrong password raise the identical error on purpose. Which
   * half was wrong is not information a login form should give away.
   */
  async authenticate(email: string, password: string): Promise<SessionUser> {
    const found = await this.users.findByEmailWithSecret(email);

    const ok = await this.safeVerify(found?.passwordHash ?? TIMING_DECOY, password);

    if (!found || !ok) {
      this.logger.warn(`Failed login for '${email}'`);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Best-effort: a failed timestamp update must not fail a valid login.
    void this.users
      .recordLogin(found.id, new Date())
      .catch((err: Error) => this.logger.warn(`Could not record login: ${err.message}`));

    return {
      id: found.id,
      organizationId: found.organizationId,
      email: found.email,
      name: found.name,
      role: found.role,
    };
  }

  /** argon2id with library defaults, which are the OWASP-recommended ones. */
  hashPassword(password: string): Promise<string> {
    return hash(password);
  }

  /**
   * A malformed stored hash throws rather than returning false, and that would
   * surface as a 500 on the login route — a corrupt record should read as bad
   * credentials, not as a broken server.
   */
  private async safeVerify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }
}
