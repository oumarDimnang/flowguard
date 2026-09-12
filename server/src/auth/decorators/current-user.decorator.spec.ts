import { ConflictException } from '@nestjs/common';

import { Role } from '../../common/domain/tenancy';
import { organizationOf } from './current-user.decorator';

describe('organizationOf', () => {
  it('returns the organization the session operates in', () => {
    expect(
      organizationOf({ id: 'u1', email: 'a@x', name: 'A', role: Role.OPERATOR, organizationId: 'o1' }),
    ).toBe('o1');
  });

  it('409s an admin with no organization open', () => {
    expect(() => organizationOf({ id: 'u1', email: 'a@x', name: 'A', role: Role.ADMIN })).toThrow(
      ConflictException,
    );
  });

  it('fails loudly when used on a route with no session guard', () => {
    expect(() => organizationOf(undefined)).toThrow(/without SessionAuthGuard/);
  });
});
