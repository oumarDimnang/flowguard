/**
 * Mirrored from server/src/auth/auth.controller.ts and
 * server/src/common/domain/tenancy.ts.
 */

/**
 * What a user may do inside their organization.
 *
 * The boundary that matters is VIEWER vs OPERATOR: dispatching starts a
 * workflow that can allocate paid network capacity. The client hides what a
 * role cannot use, but the server guard is the actual enforcement — hiding a
 * button is tidiness, not security.
 */
export const Role = {
  VIEWER: 'VIEWER',
  OPERATOR: 'OPERATOR',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

const RANK: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.OPERATOR]: 1,
  [Role.ADMIN]: 2,
};

/** True when `role` is at or above `required`. Mirrors roleAtLeast on the server. */
export function roleAtLeast(role: Role | undefined, required: Role): boolean {
  return role !== undefined && RANK[role] >= RANK[required];
}

/** Which kind of operation an organization runs. Selects the facility panel. */
export const Industry = {
  CONTAINER_TERMINAL: 'CONTAINER_TERMINAL',
  DRONE_OPERATIONS: 'DRONE_OPERATIONS',
  EMERGENCY_DISPATCH: 'EMERGENCY_DISPATCH',
} as const;
export type Industry = (typeof Industry)[keyof typeof Industry];

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * A member of the organization, as the admin list returns them.
 *
 * Distinct from AuthenticatedUser, which is what a request carries to authorise
 * itself and holds nothing a session does not need. Never includes the password
 * hash — that leaves the repository only on the login path.
 */
export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthenticatedOrganization {
  id: string;
  slug: string;
  name: string;
  industry: Industry | string;
}

/**
 * The response from login and /auth/me.
 *
 * Note there is no organizationId on the user: that is a server-side scoping
 * key read from the session, and the client has no business naming one.
 */
export interface Identity {
  user: AuthenticatedUser;
  organization: AuthenticatedOrganization;
}
