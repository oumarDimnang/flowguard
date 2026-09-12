/**
 * Tenancy vocabulary.
 *
 * Deliberately NOT in enums.ts. That file is the cross-language contract
 * mirrored in agent/src/flowguard_agent/shared/models.py, and none of these
 * values reach the Python worker — the worker only ever carries an
 * `organizationId` string through, without interpreting it.
 */

/**
 * Which kind of operation an organization runs.
 *
 * Selects the facility-system adapter: the thing that models the physical job
 * and emits business events. Everything downstream of that event — the policy,
 * the workflow, the CAMARA calls, the audit trail — is industry-agnostic and
 * shared by every organization.
 */
export enum Industry {
  CONTAINER_TERMINAL = 'CONTAINER_TERMINAL',
  DRONE_OPERATIONS = 'DRONE_OPERATIONS',
  EMERGENCY_DISPATCH = 'EMERGENCY_DISPATCH',
}

/**
 * What a user may do.
 *
 * OPERATOR and VIEWER belong to exactly one organization, assigned by an
 * admin, and see only its operations. The boundary between them is
 * dispatching: it starts a workflow that can allocate paid network capacity.
 *
 * ADMIN is a system administrator, not a member of any organization. Admins
 * create organizations and accounts, and can open any organization's
 * operations by choosing it — with operator powers there.
 */
export enum Role {
  VIEWER = 'VIEWER',
  OPERATOR = 'OPERATOR',
  ADMIN = 'ADMIN',
}

/** Whether an account of this role must be assigned to an organization. */
export function belongsToOrganization(role: Role): boolean {
  return role !== Role.ADMIN;
}

/**
 * Roles ordered by privilege, so a guard can express "at least OPERATOR"
 * rather than enumerating every role that qualifies.
 */
const RANK: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.OPERATOR]: 1,
  [Role.ADMIN]: 2,
};

/** True when `role` is at or above `required`. */
export function roleAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
