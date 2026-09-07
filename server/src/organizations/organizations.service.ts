import { Injectable, NotFoundException } from '@nestjs/common';

import type { Organization, OrganizationCreate } from './domain/organization';
import { OrganizationRepository } from './ports/organization.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly repository: OrganizationRepository) {}

  async findOne(id: string): Promise<Organization> {
    const organization = await this.repository.findById(id);
    if (!organization) {
      throw new NotFoundException('Unknown organization');
    }
    return organization;
  }

  findById(id: string): Promise<Organization | null> {
    return this.repository.findById(id);
  }

  findAll(): Promise<Organization[]> {
    return this.repository.findAll();
  }

  create(organization: OrganizationCreate): Promise<Organization> {
    return this.repository.create(organization);
  }
}
