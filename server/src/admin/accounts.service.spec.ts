import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { SessionUser } from '../auth/session.config';
import { Industry, Role } from '../common/domain/tenancy';
import { FacilityRegistry } from '../facility/facility.registry';
import type { Organization, OrganizationCreate } from '../organizations/domain/organization';
import { SlugTakenError } from '../organizations/domain/organization.errors';
import { OrganizationsService } from '../organizations/organizations.service';
import type { User, UserCreate, UserWithSecret } from '../users/domain/user';
import { EmailTakenError } from '../users/domain/user.errors';
import { UserRepository } from '../users/ports/user.repository';
import { UsersService } from '../users/users.service';
import { AccountsService } from './accounts.service';

/** In-memory accounts with the one invariant that matters here: a unique email. */
class FakeUsers extends UserRepository {
  rows: UserWithSecret[] = [];
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

  async recordLogin() {}
}

function strip(user: UserWithSecret): User {
  const { passwordHash: _secret, ...rest } = user;
  return rest;
}

class FakeOrganizations {
  rows: Organization[] = [];
  private seq = 0;

  async findById(id: string) {
    return this.rows.find((o) => o.id === id) ?? null;
  }

  async findAll() {
    return this.rows;
  }

  async create(organization: OrganizationCreate): Promise<Organization> {
    if (this.rows.some((o) => o.slug === organization.slug)) {
      throw new SlugTakenError(organization.slug);
    }
    const row = { ...organization, id: `o${++this.seq}`, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
}

const registry = {
  supported: () => [Industry.CONTAINER_TERMINAL, Industry.DRONE_OPERATIONS],
  supports: (industry: Industry) => industry !== Industry.EMERGENCY_DISPATCH,
};

const admin: SessionUser = { id: 'u-admin', email: 'admin@flowguard.test', name: 'Admin', role: Role.ADMIN };

const newAccount = {
  name: 'Layla Al Mansoori',
  email: 'Layla@Port.test',
  password: 'correct horse battery',
};

describe('AccountsService', () => {
  let service: AccountsService;
  let users: FakeUsers;
  let organizations: FakeOrganizations;
  let port: Organization;

  beforeEach(async () => {
    users = new FakeUsers();
    organizations = new FakeOrganizations();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountsService,
        UsersService,
        { provide: UserRepository, useValue: users },
        { provide: OrganizationsService, useValue: organizations },
        { provide: FacilityRegistry, useValue: registry },
      ],
    }).compile();

    service = moduleRef.get(AccountsService);
    port = await service.createOrganization(
      { name: 'Khalifa Port', industry: Industry.CONTAINER_TERMINAL },
      admin,
    );
  });

  describe('createOrganization', () => {
    it('derives the short name from the display name', () => {
      expect(port).toMatchObject({ slug: 'khalifa-port', name: 'Khalifa Port' });
    });

    it('gives a second organization with the same name a different slug', async () => {
      const second = await service.createOrganization(
        { name: 'Khalifa Port', industry: Industry.CONTAINER_TERMINAL },
        admin,
      );

      expect(second.slug).toMatch(/^khalifa-port-[0-9a-f]{4}$/);
    });

    it('refuses an industry no facility adapter models', async () => {
      await expect(
        service.createOrganization({ name: 'Dispatch', industry: Industry.EMERGENCY_DISPATCH }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(organizations.rows).toHaveLength(1);
    });
  });

  describe('createUser', () => {
    it('creates an operator inside the organization it is assigned to', async () => {
      const user = await service.createUser(
        { ...newAccount, role: Role.OPERATOR, organizationId: port.id },
        admin,
      );

      expect(user).toMatchObject({
        email: 'layla@port.test',
        role: Role.OPERATOR,
        organizationId: port.id,
      });
    });

    it('creates an admin in no organization', async () => {
      const user = await service.createUser({ ...newAccount, role: Role.ADMIN }, admin);

      expect(user.role).toBe(Role.ADMIN);
      expect(user.organizationId).toBeUndefined();
    });

    it.each([Role.OPERATOR, Role.VIEWER])('refuses a %s with no organization', async (role) => {
      await expect(service.createUser({ ...newAccount, role }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(users.rows).toHaveLength(0);
    });

    it('refuses an organization that does not exist', async () => {
      await expect(
        service.createUser({ ...newAccount, role: Role.OPERATOR, organizationId: 'o-gone' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to place an admin inside an organization', async () => {
      await expect(
        service.createUser({ ...newAccount, role: Role.ADMIN, organizationId: port.id }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stores an argon2 hash, never the password', async () => {
      await service.createUser({ ...newAccount, role: Role.OPERATOR, organizationId: port.id }, admin);

      expect(users.rows[0].passwordHash).toMatch(/^\$argon2id\$/);
      expect(users.rows[0].passwordHash).not.toContain(newAccount.password);
    });

    it('refuses a taken email with 409', async () => {
      await service.createUser({ ...newAccount, role: Role.OPERATOR, organizationId: port.id }, admin);

      await expect(
        service.createUser({ ...newAccount, role: Role.VIEWER, organizationId: port.id }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.rows).toHaveLength(1);
    });
  });

  describe('assignOrganization', () => {
    it('moves an operator to another organization', async () => {
      const operator = await service.createUser(
        { ...newAccount, role: Role.OPERATOR, organizationId: port.id },
        admin,
      );
      const aerial = await service.createOrganization(
        { name: 'Gulf Aerial', industry: Industry.DRONE_OPERATIONS },
        admin,
      );

      const moved = await service.assignOrganization(operator.id, aerial.id, admin);

      expect(moved.organizationId).toBe(aerial.id);
    });

    it('refuses to assign an admin', async () => {
      const other = await service.createUser({ ...newAccount, role: Role.ADMIN }, admin);

      await expect(service.assignOrganization(other.id, port.id, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses an organization that does not exist', async () => {
      const operator = await service.createUser(
        { ...newAccount, role: Role.OPERATOR, organizationId: port.id },
        admin,
      );

      await expect(service.assignOrganization(operator.id, 'o-gone', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(users.rows[0].organizationId).toBe(port.id);
    });

    it('404s an account that does not exist', async () => {
      await expect(service.assignOrganization('u-gone', port.id, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
