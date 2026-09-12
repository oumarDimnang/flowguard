import type { Role } from '../../common/domain/tenancy';

/**
 * A person with an account.
 *
 * Operators and viewers belong to exactly one organization, assigned by an
 * admin. Admins belong to none: they administer the system and choose which
 * organization to open per session (see SessionUser.organizationId).
 *
 * Membership is single, not many-to-many. A person who genuinely works for two
 * operators gets two accounts, and the scoping code stays free of "which
 * organization is this operator acting as right now".
 */
export interface User {
  id: string;
  /** Set for OPERATOR and VIEWER. Absent for ADMIN. */
  organizationId?: string;
  /** Lower-cased on write so lookups are stable. */
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  lastLoginAt?: Date;
}

/** A user plus the secret. Never leaves the auth service. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

export type UserCreate = Omit<User, 'id' | 'createdAt' | 'lastLoginAt'> & {
  passwordHash: string;
};
