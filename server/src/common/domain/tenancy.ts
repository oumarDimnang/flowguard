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
 * What a user may do inside their organization.
 *
 * Three, and the boundary that matters is between VIEWER and OPERATOR:
 * dispatching starts a workflow that can allocate paid network capacity, so it
 * is the one action worth gating. ADMIN adds administration of the
 * organization itself, not deeper access to its operations.
 */
export enum Role {
  VIEWER = 'VIEWER',
  OPERATOR = 'OPERATOR',
  ADMIN = 'ADMIN',
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
