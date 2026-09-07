import type { User, UserCreate, UserWithSecret } from '../domain/user';

/** Data access contract for users (S1). */
export abstract class UserRepository {
  /**
   * Includes the password hash. Used only by the auth service when verifying a
   * login — every other read goes through findById, which does not.
   */
  abstract findByEmailWithSecret(email: string): Promise<UserWithSecret | null>;

  abstract findById(id: string): Promise<User | null>;

  /** Every user in one organization. Scoped by construction. */
  abstract findByOrganization(organizationId: string): Promise<User[]>;

  /** Idempotent: returns the existing user when the email is taken. */
  abstract create(user: UserCreate): Promise<User>;

  abstract recordLogin(id: string, at: Date): Promise<void>;
}
