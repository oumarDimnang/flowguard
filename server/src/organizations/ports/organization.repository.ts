import type { Organization, OrganizationCreate } from '../domain/organization';

/** Data access contract for tenants (S1). */
export abstract class OrganizationRepository {
  abstract findById(id: string): Promise<Organization | null>;
  abstract findBySlug(slug: string): Promise<Organization | null>;
  abstract findAll(): Promise<Organization[]>;
  /** Idempotent: returns the existing organization when the slug is taken. */
  abstract create(organization: OrganizationCreate): Promise<Organization>;
}
