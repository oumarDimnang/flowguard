import type { Organization, OrganizationCreate } from '../domain/organization';

/** Data access contract for tenants (S1). */
export abstract class OrganizationRepository {
  abstract findById(id: string): Promise<Organization | null>;
  abstract findBySlug(slug: string): Promise<Organization | null>;
  abstract findAll(): Promise<Organization[]>;

  /**
   * Throws SlugTakenError when the slug is in use.
   *
   * Not idempotent, for the same reason UserRepository.create is not: on the
   * registration path "the slug exists" must never mean "attach this stranger
   * to the tenant that owns it".
   */
  abstract create(organization: OrganizationCreate): Promise<Organization>;

  /**
   * Removes a tenant. Only used to undo a registration whose admin account
   * could not be created — an organization with nobody in it is unreachable
   * and would otherwise sit in the collection forever.
   */
  abstract delete(id: string): Promise<void>;
}
