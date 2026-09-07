import { NetworkAction } from '@/types';

/**
 * The allocation policy, mirrored from
 * `agent/src/flowguard_agent/policy/rules.py`.
 *
 * Static on purpose. `decide()` is a pure function with no I/O and no model
 * call, so its rules are known at build time — there is nothing to fetch. That
 * is the whole point of the page: the complete set of decisions this system can
 * make is finite, readable and fixed, which is not something an agent that
 * decides its own actions can ever show you.
 *
 * Order is part of the logic. The first matching rule wins, so this array is
 * the evaluation sequence, not an unordered table.
 */
export interface PolicyRule {
  id: string;
  /** The condition, in the same terms the code uses. */
  when: string;
  action: NetworkAction | 'QOD_AND_SLICE / QOD';
  /** Off unless explicitly enabled in configuration. */
  disabled?: boolean;
  /** Why it is off, or why it matters. Rendered in the margin. */
  note?: string;
}

export const POLICY_RULES: readonly PolicyRule[] = [
  {
    id: 'GUARD_DEVICE_UNREACHABLE',
    when: 'the device is not reachable on the network',
    action: NetworkAction.NONE,
    note: 'Cheapest check, runs first. Never allocate to a device that is not there.',
  },
  {
    id: 'ROUTINE_NO_ACTION',
    when: 'criticality is LOW — at any congestion level',
    action: NetworkAction.NONE,
    note: 'The thesis.',
  },
  {
    id: 'SAFETY_CRITICAL_ALWAYS_PROTECT',
    when: 'the operation is safety-critical and unconditional protection is enabled',
    action: 'QOD_AND_SLICE / QOD',
    disabled: true,
    note: 'Off by default. The saving comes from not allocating when nothing is actually at risk.',
  },
  {
    id: 'MEDIUM_CRITICALITY_HIGH_CONGESTION',
    when: 'criticality is MEDIUM and congestion is at or above High',
    action: NetworkAction.QOD,
  },
  {
    id: 'MEDIUM_CRITICALITY_NETWORK_HEALTHY',
    when: 'criticality is MEDIUM and congestion is below High',
    action: NetworkAction.NONE,
  },
  {
    id: 'HIGH_CRITICALITY_NETWORK_HEALTHY',
    when: 'criticality is HIGH and congestion is below Medium',
    action: NetworkAction.NONE,
    note: 'Business-critical, but the network is already meeting requirements.',
  },
  {
    id: 'SAFETY_CRITICAL_CONGESTED_SLICE',
    when: 'criticality is HIGH, safety-critical, congested, and a slice is available',
    action: NetworkAction.QOD_AND_SLICE,
  },
  {
    id: 'HIGH_CRITICALITY_CONGESTED',
    when: 'criticality is HIGH and congestion is at or above Medium',
    action: NetworkAction.QOD,
  },
];

/** The rule the whole product rests on. Given visual weight above the others. */
export const THESIS_RULE = 'ROUTINE_NO_ACTION';

/**
 * Environment-configurable thresholds.
 *
 * Deliberately config rather than constants: judges probe the edges of a
 * policy, and being able to change a value and re-run a scenario live is a far
 * better answer than describing what would happen.
 */
export const POLICY_THRESHOLDS: readonly { key: string; value: string; note?: string }[] = [
  {
    key: 'qod_congestion_threshold',
    value: 'Medium',
    note: 'minimum congestion before HIGH-criticality work is granted QoD',
  },
  {
    key: 'medium_criticality_threshold',
    value: 'High',
    note: 'minimum congestion before MEDIUM-criticality work is granted QoD',
  },
  {
    key: 'enable_slice_escalation',
    value: 'true',
    note: 'grant a slice to safety-critical work when one is available',
  },
  {
    key: 'always_protect_safety_critical',
    value: 'false',
    note: 'protect safety-critical work even on an uncongested network',
  },
];
