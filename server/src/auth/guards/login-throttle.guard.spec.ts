import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { IP_LIMIT, LoginThrottleGuard, PAIR_LIMIT } from './login-throttle.guard';
import { LoginRateLimiter } from '../login-rate-limiter';

function contextFor(ip: string, email?: string) {
  const headers: Record<string, string> = {};
  const request = { ip, body: email === undefined ? {} : { email } };
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

describe('LoginThrottleGuard', () => {
  let clock: number;
  let limiter: LoginRateLimiter;
  let guard: LoginThrottleGuard;

  beforeEach(() => {
    clock = 1_000_000;
    limiter = new LoginRateLimiter(15 * 60 * 1000, () => clock);
    guard = new LoginThrottleGuard(limiter);
  });

  it(`allows ${PAIR_LIMIT} attempts for one address and email, then refuses with 429`, () => {
    const { context, headers } = contextFor('10.0.0.1', 'ops@port.test');

    for (let i = 0; i < PAIR_LIMIT; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }

    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  /**
   * The limit is on the (address, email) pair, so a stranger hammering an
   * operator's email cannot lock that operator out from their own desk.
   */
  it('does not let one address lock an email out for a different address', () => {
    const attacker = contextFor('203.0.113.9', 'ops@port.test').context;
    const operator = contextFor('10.0.0.1', 'ops@port.test').context;

    for (let i = 0; i < PAIR_LIMIT; i += 1) guard.canActivate(attacker);
    expect(() => guard.canActivate(attacker)).toThrow(HttpException);

    expect(guard.canActivate(operator)).toBe(true);
  });

  it('bounds attempts per address across many emails', () => {
    for (let i = 0; i < IP_LIMIT; i += 1) {
      expect(guard.canActivate(contextFor('203.0.113.9', `guess${i}@port.test`).context)).toBe(
        true,
      );
    }

    expect(() => guard.canActivate(contextFor('203.0.113.9', 'another@port.test').context)).toThrow(
      HttpException,
    );
  });

  it('forgets a window once it has elapsed', () => {
    const { context } = contextFor('10.0.0.1', 'ops@port.test');
    for (let i = 0; i < PAIR_LIMIT; i += 1) guard.canActivate(context);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    clock += 15 * 60 * 1000 + 1;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('clears the pair on success so a correct password does not count as a strike', () => {
    const { context } = contextFor('10.0.0.1', 'ops@port.test');
    for (let i = 0; i < PAIR_LIMIT - 1; i += 1) guard.canActivate(context);

    limiter.clear('pair:10.0.0.1:ops@port.test');

    for (let i = 0; i < PAIR_LIMIT; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('keys the email case- and whitespace-insensitively', () => {
    for (let i = 0; i < PAIR_LIMIT; i += 1) {
      guard.canActivate(contextFor('10.0.0.1', ' OPS@Port.test ').context);
    }

    expect(() => guard.canActivate(contextFor('10.0.0.1', 'ops@port.test').context)).toThrow(
      HttpException,
    );
  });
});
