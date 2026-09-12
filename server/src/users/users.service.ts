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

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findByEmail(email);
  }

  findByOrganization(organizationId: string): Promise<User[]> {
    return this.repository.findByOrganization(organizationId);
  }

  /** Every account. For the admin surface only. */
  findAll(): Promise<User[]> {
    return this.repository.findAll();
  }

  /** Throws EmailTakenError on a duplicate address. See UserRepository.create. */
  create(user: UserCreate): Promise<User> {
    return this.repository.create(user);
  }

  async assignOrganization(id: string, organizationId: string): Promise<User> {
    const user = await this.repository.assignOrganization(id, organizationId);
    if (!user) {
      throw new NotFoundException('Unknown user');
    }
    return user;
  }
}
