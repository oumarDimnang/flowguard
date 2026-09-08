import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing, as two functions rather than a service.
 *
 * The seed script needs to hash without booting the auth module — which now
 * reaches the facility layer and, through it, the Temporal client — and a
 * hash function has no dependencies worth injecting.
 */

/** argon2id with library defaults, which are the OWASP-recommended ones. */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * A malformed stored hash throws rather than returning false, and that would
 * surface as a 500 on the login route — a corrupt record should read as bad
 * credentials, not as a broken server.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
