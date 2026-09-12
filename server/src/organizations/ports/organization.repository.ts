import type { Organization, OrganizationCreate } from '../domain/organization';

/** Data access contract for tenants (S1). */
export abstract class OrganizationRepository {
  abstract findById(id: string): Promise<Organization | null>;
  abstract findBySlug(slug: string): Promise<Organization | null>;
  abstract findAll(): Promise<Organization[]>;

  /**
   * Throws SlugTakenError when the slug is in use.
   *
   * Not idempotent, for the same reason UserRepository.create is not: "the
   * slug exists" must never quietly mean "use the organization that owns it".
   */
  abstract create(organization: OrganizationCreate): Promise<Organization>;
}
