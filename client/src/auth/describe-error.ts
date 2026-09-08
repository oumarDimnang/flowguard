import { ApiError } from '@/api/client';

/**
 * A sentence for whatever the auth routes throw.
 *
 * Bad credentials and a dead server are different problems, and telling them
 * apart saves someone retyping a password that was never wrong. Throttling
 * is called out by name because "invalid password" after five tries would
 * send a legitimate user to reset something that does not need resetting.
 */
export function describeAuthError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.isThrottled) return 'Too many attempts. Wait a few minutes and try again.';
    if (err.isUnauthenticated) return fallback;
    if (err.status === 400) return err.messages[0] ?? 'Check the fields and try again.';
    if (err.status >= 500) return 'The server hit a problem. Try again in a moment.';
    return err.messages[0] ?? 'The server rejected the request. Try again.';
  }
  return 'Could not reach the server. Check that it is running.';
}

/** Which field a validation message from the server belongs to, if any. */
export function fieldFor(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('organization')) return 'organizationName';
  if (lower.includes('industry')) return 'industry';
  if (lower.includes('password')) return 'password';
  if (lower.includes('email')) return 'email';
  if (lower.includes('name')) return 'name';
  return undefined;
}

/** Loose on purpose: the server validates properly; this only catches a typo before a round trip. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
