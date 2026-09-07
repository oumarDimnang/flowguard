import type { Industry } from '../../common/domain/tenancy';

/**
 * A tenant.
 *
 * The organization is the primary scoping key for the entire system: every
 * operation, every decision record and every live event belongs to exactly one,
 * and no query crosses the boundary.
 */
export interface Organization {
  /** Stable identifier used as the scoping key everywhere. */
  id: string;
  /** URL-safe short name, e.g. 'khalifa-port'. Unique. */
  slug: string;
  name: string;
  /** Selects the facility-system adapter this organization sees. */
  industry: Industry;
  createdAt: Date;
}

export type OrganizationCreate = Omit<Organization, 'id' | 'createdAt'>;
