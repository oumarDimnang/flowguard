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

  /** Every account in the system. Admin-only callers; there is no tenant filter here. */
  abstract findAll(): Promise<User[]>;

  /**
   * Throws EmailTakenError when the address is already registered.
   *
   * Deliberately *not* idempotent. It used to return the existing account on
   * a duplicate, which was convenient for seeding and catastrophic for account
   * creation: a new account with somebody else's email would have handed the
   * caller that person's account. Callers that want find-or-create say so.
   */
  abstract create(user: UserCreate): Promise<User>;

  /** Moves an account to an organization. Null when the account does not exist. */
  abstract assignOrganization(id: string, organizationId: string): Promise<User | null>;

  abstract recordLogin(id: string, at: Date): Promise<void>;
}
