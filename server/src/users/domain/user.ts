import type { Role } from '../../common/domain/tenancy';

/**
 * A person, always belonging to exactly one organization.
 *
 * Membership is single, not many-to-many. That is a deliberate simplification:
 * a user who genuinely works for two operators gets two accounts, and the
 * scoping code stays free of "which organization am I acting as right now",
 * which is where multi-tenant systems usually leak.
 */
export interface User {
  id: string;
  organizationId: string;
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
