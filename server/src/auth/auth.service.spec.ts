import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { Industry, Role } from '../common/domain/tenancy';
import type { Organization } from '../organizations/domain/organization';
import { OrganizationsService } from '../organizations/organizations.service';
import type { User, UserCreate, UserWithSecret } from '../users/domain/user';
import { EmailTakenError } from '../users/domain/user.errors';
import { UserRepository } from '../users/ports/user.repository';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

/**
 * No MongoDB. The repositories are in-memory fakes that keep the invariants the
 * real ones do — unique email, organizations listed by name.
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

  async findAll() {
    return this.rows.map(strip);
  }

  async create(user: UserCreate): Promise<User> {
    if (this.rows.some((u) => u.email === user.email)) throw new EmailTakenError(user.email);
    const row: UserWithSecret = { ...user, id: `u${++this.seq}`, createdAt: new Date() };
    this.rows.push(row);
    return strip(row);
  }

  async assignOrganization(id: string, organizationId: string) {
    const row = this.rows.find((u) => u.id === id);
    if (!row) return null;
    row.organizationId = organizationId;
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

  add(id: string, name: string, industry = Industry.CONTAINER_TERMINAL): Organization {
    const row = { id, slug: id, name, industry, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }

  async findById(id: string) {
    return this.rows.find((o) => o.id === id) ?? null;
  }

  async findAll() {
    return [...this.rows].sort((a, b) => a.name.localeCompare(b.name));
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let users: FakeUsers;
  let organizations: FakeOrganizations;

  const account = async (email: string, role: Role, organizationId?: string) =>
    users.create({
      email,
      name: email,
      role,
      ...(organizationId ? { organizationId } : {}),
      passwordHash: await hashPassword('flowguard'),
    });

  beforeEach(async () => {
    users = new FakeUsers();
    organizations = new FakeOrganizations();
    organizations.add('o-port', 'Khalifa Port');
    organizations.add('o-aerial', 'Gulf Aerial');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: users },
        { provide: OrganizationsService, useValue: organizations },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('authenticate', () => {
    beforeEach(async () => {
      await account('ops@port.test', Role.OPERATOR, 'o-port');
    });

    it('returns the session user for a correct password, without the hash', async () => {
      const session = await service.authenticate('ops@port.test', 'flowguard');

      expect(session).toEqual({
        id: 'u1',
        organizationId: 'o-port',
        email: 'ops@port.test',
        name: 'ops@port.test',
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

  describe('which organization a session opens', () => {
    it('opens the first organization by name for an admin with none of their own', async () => {
      await account('admin@flowguard.test', Role.ADMIN);

      const session = await service.authenticate('admin@flowguard.test', 'flowguard');

      expect(session.organizationId).toBe('o-aerial');
    });

    it('opens nothing for an admin when no organization exists yet', async () => {
      organizations.rows = [];
      await account('admin@flowguard.test', Role.ADMIN);

      const session = await service.authenticate('admin@flowguard.test', 'flowguard');

      expect(session.organizationId).toBeUndefined();
    });

    it('keeps the organization an admin had open across a refresh', async () => {
      const admin = await account('admin@flowguard.test', Role.ADMIN);

      await expect(service.resolve(admin.id, 'o-port')).resolves.toMatchObject({
        organizationId: 'o-port',
      });
    });

    it('falls back when the organization an admin had open no longer exists', async () => {
      const admin = await account('admin@flowguard.test', Role.ADMIN);

      await expect(service.resolve(admin.id, 'o-gone')).resolves.toMatchObject({
        organizationId: 'o-aerial',
      });
    });

    /**
     * The tenant boundary, from the refresh side: whatever a stale or tampered
     * session says, an operator comes back in their own organization.
     */
    it('always re-reads an operator’s organization from the account', async () => {
      const operator = await account('ops@port.test', Role.OPERATOR, 'o-port');

      await expect(service.resolve(operator.id, 'o-aerial')).resolves.toMatchObject({
        organizationId: 'o-port',
      });
    });

    it('picks up an operator’s reassignment on the next refresh', async () => {
      const operator = await account('ops@port.test', Role.OPERATOR, 'o-port');
      await users.assignOrganization(operator.id, 'o-aerial');

      await expect(service.resolve(operator.id, 'o-port')).resolves.toMatchObject({
        organizationId: 'o-aerial',
      });
    });

    it('returns null once the account is gone', async () => {
      const operator = await account('ops@port.test', Role.OPERATOR, 'o-port');
      users.rows = [];

      await expect(service.resolve(operator.id)).resolves.toBeNull();
    });
  });

  describe('open', () => {
    it('switches an admin session to an existing organization', async () => {
      const session = { id: 'u1', email: 'a@x', name: 'A', role: Role.ADMIN, organizationId: 'o-port' };

      await expect(service.open(session, 'o-aerial')).resolves.toMatchObject({
        organizationId: 'o-aerial',
      });
    });

    it('refuses an organization that does not exist', async () => {
      const session = { id: 'u1', email: 'a@x', name: 'A', role: Role.ADMIN };

      await expect(service.open(session, 'o-gone')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
