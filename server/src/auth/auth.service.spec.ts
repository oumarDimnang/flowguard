import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Industry, Role } from '../common/domain/tenancy';
import { FacilityRegistry } from '../facility/facility.registry';
import type { Organization, OrganizationCreate } from '../organizations/domain/organization';
import { SlugTakenError } from '../organizations/domain/organization.errors';
import { OrganizationsService } from '../organizations/organizations.service';
import type { User, UserCreate, UserWithSecret } from '../users/domain/user';
import { EmailTakenError } from '../users/domain/user.errors';
import { UserRepository } from '../users/ports/user.repository';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

/**
 * No MongoDB. The repositories are in-memory fakes that enforce the same two
 * invariants the real ones do — unique email, unique slug — because those
 * invariants are exactly what registration is tested against.
 */

class FakeUsers extends UserRepository {
  rows: UserWithSecret[] = [];
  logins: string[] = [];
  private seq = 0;

  async findByEmailWithSecret(email: string) {
    return this.rows.find((u) => u.email === email.toLowerCase().trim()) ?? null;
  }

  async findByEmail(email: string) {
    const found = await this.findByEmailWithSecret(email);
    return found ? strip(found) : null;
  }

  async findById(id: string) {
    const found = this.rows.find((u) => u.id === id);
    return found ? strip(found) : null;
  }

  async findByOrganization(organizationId: string) {
    return this.rows.filter((u) => u.organizationId === organizationId).map(strip);
  }

  async create(user: UserCreate): Promise<User> {
    if (this.rows.some((u) => u.email === user.email)) throw new EmailTakenError(user.email);
    const row: UserWithSecret = { ...user, id: `u${++this.seq}`, createdAt: new Date() };
    this.rows.push(row);
    return strip(row);
  }

  async recordLogin(id: string) {
    this.logins.push(id);
  }
}

function strip(user: UserWithSecret): User {
  const { passwordHash: _secret, ...rest } = user;
  return rest;
}

class FakeOrganizations {
  rows: Organization[] = [];
  deleted: string[] = [];
  private seq = 0;

  async findOne(id: string) {
    const found = this.rows.find((o) => o.id === id);
    if (!found) throw new Error('unknown organization');
    return found;
  }

  async findBySlug(slug: string) {
    return this.rows.find((o) => o.slug === slug) ?? null;
  }

  async create(organization: OrganizationCreate): Promise<Organization> {
    if (this.rows.some((o) => o.slug === organization.slug)) {
      throw new SlugTakenError(organization.slug);
    }
    const row = { ...organization, id: `o${++this.seq}`, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }

  async delete(id: string) {
    this.deleted.push(id);
    this.rows = this.rows.filter((o) => o.id !== id);
  }
}

const registry = {
  supported: () => [Industry.CONTAINER_TERMINAL, Industry.DRONE_OPERATIONS],
  supports: (industry: Industry) => industry !== Industry.EMERGENCY_DISPATCH,
};

const signUp = {
  name: 'Noor Haddad',
  email: 'Noor@Example.test',
  password: 'correct horse battery',
  organizationName: 'North Terminal',
  industry: Industry.CONTAINER_TERMINAL,
};

describe('AuthService', () => {
  let service: AuthService;
  let users: FakeUsers;
  let organizations: FakeOrganizations;

  beforeEach(async () => {
    users = new FakeUsers();
    organizations = new FakeOrganizations();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: users },
        { provide: OrganizationsService, useValue: organizations },
        { provide: FacilityRegistry, useValue: registry },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('authenticate', () => {
    beforeEach(async () => {
      await users.create({
        organizationId: 'o-port',
        email: 'ops@port.test',
        name: 'Layla',
        role: Role.OPERATOR,
        passwordHash: await hashPassword('flowguard'),
      });
    });

    it('returns the session user for a correct password, without the hash', async () => {
      const session = await service.authenticate('ops@port.test', 'flowguard');

      expect(session).toEqual({
        id: 'u1',
        organizationId: 'o-port',
        email: 'ops@port.test',
        name: 'Layla',
        role: Role.OPERATOR,
      });
      expect(session).not.toHaveProperty('passwordHash');
    });

    it('is case- and whitespace-insensitive on the email', async () => {
      await expect(service.authenticate('  OPS@Port.test ', 'flowguard')).resolves.toMatchObject({
        id: 'u1',
      });
    });

    /** Wrong email and wrong password must be indistinguishable to the caller. */
    it('raises the same error for an unknown email and a wrong password', async () => {
      const unknown = service.authenticate('nobody@port.test', 'flowguard').catch((e) => e);
      const wrong = service.authenticate('ops@port.test', 'not-it').catch((e) => e);

      const [a, b] = await Promise.all([unknown, wrong]);
      expect(a).toBeInstanceOf(UnauthorizedException);
      expect(b).toBeInstanceOf(UnauthorizedException);
      expect((a as Error).message).toBe((b as Error).message);
    });

    it('treats a corrupt stored hash as bad credentials rather than a server error', async () => {
      users.rows[0].passwordHash = 'not-an-argon2-hash';

      await expect(service.authenticate('ops@port.test', 'flowguard')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    it('creates an organization and signs the registrant in as its ADMIN', async () => {
      const session = await service.register(signUp);

      expect(organizations.rows).toHaveLength(1);
      expect(organizations.rows[0]).toMatchObject({
        slug: 'north-terminal',
        name: 'North Terminal',
        industry: Industry.CONTAINER_TERMINAL,
      });
      expect(session).toMatchObject({
        organizationId: organizations.rows[0].id,
        email: 'noor@example.test',
        name: 'Noor Haddad',
        role: Role.ADMIN,
      });
    });

    it('stores an argon2 hash, never the password', async () => {
      await service.register(signUp);

      const stored = users.rows[0].passwordHash;
      expect(stored).toMatch(/^\$argon2id\$/);
      expect(stored).not.toContain(signUp.password);
      await expect(service.authenticate(signUp.email, signUp.password)).resolves.toBeDefined();
    });

    /**
     * The one property that matters most: a taken email is a refusal, never
     * a way into the account that owns it — and never a way into its tenant.
     */
    it('refuses a taken email with 409 and creates nothing', async () => {
      await service.register(signUp);

      await expect(
        service.register({ ...signUp, name: 'Impostor', organizationName: 'Other' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(users.rows).toHaveLength(1);
      expect(organizations.rows).toHaveLength(1);
    });

    /**
     * Two sign-ups racing past the courtesy check both reach the insert; the
     * loser must not leave an organization behind with nobody in it.
     */
    it('deletes the organization again when the user insert loses a race', async () => {
      const pristine = users.findByEmail.bind(users);
      users.findByEmail = async () => null;
      await service.register(signUp);
      users.findByEmail = pristine;
      users.findByEmail = async () => null;

      await expect(service.register(signUp)).rejects.toBeInstanceOf(ConflictException);

      expect(organizations.deleted).toHaveLength(1);
      expect(organizations.rows).toHaveLength(1);
    });

    it('gives a second organization with the same name a different slug', async () => {
      await service.register(signUp);
      await service.register({ ...signUp, email: 'other@example.test' });

      const slugs = organizations.rows.map((o) => o.slug);
      expect(slugs[0]).toBe('north-terminal');
      expect(slugs[1]).toMatch(/^north-terminal-[0-9a-f]{4}$/);
      expect(new Set(slugs).size).toBe(2);
    });

    it('refuses an industry no facility adapter models', async () => {
      await expect(
        service.register({ ...signUp, industry: Industry.EMERGENCY_DISPATCH }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(organizations.rows).toHaveLength(0);
    });
  });

  describe('resolve', () => {
    it('returns the current account state, or null once it is gone', async () => {
      const session = await service.register(signUp);

      await expect(service.resolve(session.id)).resolves.toMatchObject({ role: Role.ADMIN });

      users.rows = [];
      await expect(service.resolve(session.id)).resolves.toBeNull();
    });
  });
});
