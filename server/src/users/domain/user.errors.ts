/**
 * Thrown by the repository when an email is already registered.
 *
 * A domain error rather than a Mongo code, so the service deciding what a
 * duplicate *means* — a 409 on the registration form, "already seeded" in the
 * seed script — never has to know which database raised it.
 */
export class EmailTakenError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`An account already exists for '${email}'`);
    this.name = 'EmailTakenError';
    this.email = email;
  }
}
