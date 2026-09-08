import type { User, UserCreate, UserWithSecret } from '../domain/user';

/** Data access contract for users (S1). */
export abstract class UserRepository {
  /**
   * Includes the password hash. Used only by the auth service when verifying a
   * login — every other read goes through findById, which does not.
   */
  abstract findByEmailWithSecret(email: string): Promise<UserWithSecret | null>;

  abstract findByEmail(email: string): Promise<User | null>;

  abstract findById(id: string): Promise<User | null>;

  /** Every user in one organization. Scoped by construction. */
  abstract findByOrganization(organizationId: string): Promise<User[]>;

  /**
   * Throws EmailTakenError when the address is already registered.
   *
   * Deliberately *not* idempotent. It used to return the existing account on
   * a duplicate, which was convenient for seeding and catastrophic for
   * registration: a sign-up with somebody else's email would have handed the
   * caller that person's account. Callers that want find-or-create say so.
   */
  abstract create(user: UserCreate): Promise<User>;

  abstract recordLogin(id: string, at: Date): Promise<void>;
}
