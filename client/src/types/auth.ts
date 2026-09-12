/**
 * Mirrored from server/src/auth/auth.controller.ts,
 * server/src/common/domain/tenancy.ts and server/src/admin/dto/*.
 */

/**
 * What a user may do.
 *
 * OPERATOR and VIEWER belong to one organization and see only its operations;
 * dispatching is what separates them. ADMIN is a system administrator: no
 * organization of their own, creates organizations and accounts, and can open
 * any organization with operator powers. The server guard is the enforcement —
 * hiding a control here is tidiness.
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

/** Whether an account of this role must be assigned to an organization. */
export function belongsToOrganization(role: Role): boolean {
  return role !== Role.ADMIN;
}

/** Which kind of operation an organization runs. Selects the facility panel. */
export const Industry = {
  CONTAINER_TERMINAL: 'CONTAINER_TERMINAL',
  DRONE_OPERATIONS: 'DRONE_OPERATIONS',
  EMERGENCY_DISPATCH: 'EMERGENCY_DISPATCH',
} as const;
export type Industry = (typeof Industry)[keyof typeof Industry];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  [Industry.CONTAINER_TERMINAL]: 'Container terminal',
  [Industry.DRONE_OPERATIONS]: 'Drone operations',
  [Industry.EMERGENCY_DISPATCH]: 'Emergency dispatch',
};

export function industryLabel(industry: string): string {
  return INDUSTRY_LABELS[industry as Industry] ?? industry;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** An account, as the admin list returns it. Never includes the password hash. */
export interface User {
  id: string;
  /** Set for operators and viewers. Absent for admins. */
  organizationId?: string;
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
 * The response from login, /auth/me and opening an organization.
 *
 * `organization` is the one this session operates in — an operator's own, or
 * the one an admin has open. Absent only for an admin when none exists yet.
 */
export interface Identity {
  user: AuthenticatedUser;
  organization?: AuthenticatedOrganization;
}

/** Mirrors server/src/organizations/domain/organization.ts. */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  industry: Industry | string;
  createdAt: string;
}

/** Mirrors server/src/admin/dto/create-organization.dto.ts. */
export interface CreateOrganizationRequest {
  name: string;
  industry: Industry;
}

/** Mirrors server/src/admin/dto/create-user.dto.ts. */
export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Required for operators and viewers; must be absent for admins. */
  organizationId?: string;
}
