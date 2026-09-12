import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { hashPassword } from '../auth/password';
import type { SessionUser } from '../auth/session.config';
import { belongsToOrganization, type Industry, type Role } from '../common/domain/tenancy';
import { FacilityRegistry } from '../facility/facility.registry';
import type { Organization } from '../organizations/domain/organization';
import { SlugTakenError } from '../organizations/domain/organization.errors';
import { OrganizationsService } from '../organizations/organizations.service';
import { slugify } from '../organizations/slug';
import type { User } from '../users/domain/user';
import { EmailTakenError } from '../users/domain/user.errors';
import { UsersService } from '../users/users.service';

/** How many slug collisions to tolerate before giving up on a name. */
const SLUG_ATTEMPTS = 5;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  organizationId?: string;
}

/**
 * The system administrator's work: organizations and the accounts in them.
 *
 * The one rule this enforces that nothing else can: an operator or viewer
 * always belongs to exactly one organization that exists, and an admin belongs
 * to none. The schema cannot say that, because it depends on the role.
 *
 * Every change is logged with the admin who made it. That is the audit record
 * for now — a log line, not a collection.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly users: UsersService,
    private readonly organizations: OrganizationsService,
    private readonly facilities: FacilityRegistry,
  ) {}

  listUsers(): Promise<User[]> {
    return this.users.findAll();
  }

  listOrganizations(): Promise<Organization[]> {
    return this.organizations.findAll();
  }

  /** Industries with a facility adapter. The only ones an organization can be created in. */
  industries(): Industry[] {
    return this.facilities.supported();
  }

  /**
   * The natural slug first, then a handful of suffixed ones.
   *
   * Two ports can both be called "North Terminal"; the second gets
   * 'north-terminal-a1f3'. Random rather than sequential so the suffix does not
   * count how many organizations share a name.
   */
  async createOrganization(
    input: { name: string; industry: Industry },
    actor: SessionUser,
  ): Promise<Organization> {
    if (!this.facilities.supports(input.industry)) {
      throw new BadRequestException(`FlowGuard does not model '${input.industry}' yet`);
    }

    const name = input.name.trim();
    const base = slugify(name);

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      try {
        const created = await this.organizations.create({ slug, name, industry: input.industry });
        this.logger.log(`${actor.email} created organization '${created.slug}'`);
        return created;
      } catch (err) {
        if (!(err instanceof SlugTakenError)) throw err;
      }
    }

    throw new ConflictException('Could not find a free short name for that organization');
  }

  async createUser(input: CreateUserInput, actor: SessionUser): Promise<User> {
    const organizationId = await this.organizationFor(input.role, input.organizationId);

    try {
      const user = await this.users.create({
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        role: input.role,
        ...(organizationId ? { organizationId } : {}),
        passwordHash: await hashPassword(input.password),
      });

      this.logger.log(
        `${actor.email} created ${user.role} ${user.email}` +
          (organizationId ? ` in organization ${organizationId}` : ''),
      );
      return user;
    } catch (err) {
      if (err instanceof EmailTakenError) {
        throw new ConflictException('An account already exists for that email');
      }
      throw err;
    }
  }

  /**
   * Move an operator or viewer to an organization.
   *
   * Takes effect for that person on their next page load, when their session
   * is refreshed from the account. Admins cannot be assigned: they are not
   * members of any organization.
   */
  async assignOrganization(
    userId: string,
    organizationId: string,
    actor: SessionUser,
  ): Promise<User> {
    const user = await this.users.findOne(userId);

    if (!belongsToOrganization(user.role)) {
      throw new BadRequestException('Admins are not assigned to an organization');
    }
    await this.requireOrganization(organizationId);

    const updated = await this.users.assignOrganization(userId, organizationId);
    this.logger.log(`${actor.email} assigned ${updated.email} to organization ${organizationId}`);
    return updated;
  }

  private async organizationFor(role: Role, organizationId?: string): Promise<string | undefined> {
    if (!belongsToOrganization(role)) {
      if (organizationId) {
        throw new BadRequestException('Admins are not assigned to an organization');
      }
      return undefined;
    }

    if (!organizationId) {
      throw new BadRequestException('Operators and viewers must be assigned to an organization');
    }
    await this.requireOrganization(organizationId);
    return organizationId;
  }

  private async requireOrganization(id: string): Promise<void> {
    if (!(await this.organizations.findById(id))) {
      throw new BadRequestException('Unknown organization');
    }
  }
}
