import { Injectable, NotFoundException } from '@nestjs/common';

import type { User, UserCreate } from './domain/user';
import { UserRepository } from './ports/user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UserRepository) {}

  async findOne(id: string): Promise<User> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException('Unknown user');
    }
    return user;
  }

  findById(id: string): Promise<User | null> {
    return this.repository.findById(id);
  }

  /** Scoped by construction — there is no unscoped list of users. */
  findByOrganization(organizationId: string): Promise<User[]> {
    return this.repository.findByOrganization(organizationId);
  }

  create(user: UserCreate): Promise<User> {
    return this.repository.create(user);
  }
}
