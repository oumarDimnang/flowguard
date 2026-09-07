import type { MoveDefinition } from './domain/container-move';

/**
 * The berth this stand-in TOS operates.
 *
 * A real deployment replaces this module with Navis N4 (or whichever TOS the
 * terminal runs) issuing job instructions over OPC-UA to the equipment control
 * layer. What matters is that the *integration point* is identical: a job
 * instruction carrying the attributes below, dispatched before the lift.
 */
export const BERTH = {
  id: 'berth-3',
  name: 'Khalifa Bin Salman Port — Berth 3',
  vessel: 'MV GULF TRADER',
  /** Nominal crane productivity, used to express moves as recovered time. */
  targetMovesPerHour: 32,
} as const;

/**
 * The work queue.
 *
 * Moves 1 and 2 are the demonstration, and they are deliberately on the SAME
 * crane: an empty repositioning followed by a 40-tonne IMDG class 3 lift over
 * an active walkway. Same device, same cell, same congestion, minutes apart —
 * and FlowGuard must reach opposite decisions. That is the drone-contrast
 * thesis restated in the vocabulary of the industry being pitched.
 *
 * Phone numbers are Nokia sandbox simulated devices.
 */
export const WORK_QUEUE: readonly MoveDefinition[] = [
  {
    id: 'move-1',
    craneId: 'crane-a',
    devicePhoneNumber: '+99999991001',
    container: {
      containerId: 'MSCU4823157',
      grossWeightKg: 2_300,
      overWalkway: false,
    },
    fromLocation: 'BAY 22 ROW 04 TIER 82',
    toLocation: 'YARD A-12-3',
    expectedDurationSeconds: 90,
    deferrable: true,
    summary:
      'Scheduled repositioning of an empty container from the vessel to the yard stack. ' +
      'No personnel beneath the path and no time dependency — the move can be repeated ' +
      'later in the shift without operational consequence.',
  },
  {
    id: 'move-2',
    craneId: 'crane-a',
    devicePhoneNumber: '+99999991001',
    container: {
      containerId: 'MAEU7391024',
      grossWeightKg: 40_100,
      imdgClass: '3',
      overWalkway: true,
    },
    fromLocation: 'BAY 22 ROW 06 TIER 84',
    toLocation: 'YARD H-04-1',
    expectedDurationSeconds: 180,
    summary:
      'Remote-operated lift of a 40-tonne IMDG class 3 (flammable liquids) container ' +
      'whose path crosses an active quay walkway. The operator is driving from the ' +
      'control room on a live uplink video feed; losing that feed with the load ' +
      'suspended forces an emergency stop above people.',
  },
  {
    id: 'move-3',
    craneId: 'crane-b',
    devicePhoneNumber: '+99999991002',
    container: {
      containerId: 'CMAU2210896',
      grossWeightKg: 28_400,
      reefer: true,
      overWalkway: false,
    },
    fromLocation: 'BAY 18 ROW 02 TIER 86',
    toLocation: 'REEFER STACK R-03-2',
    expectedDurationSeconds: 150,
    summary:
      'Refrigerated container discharge to the reefer stack. The unit carries its own ' +
      'temperature telemetry and must be plugged within the cold-chain window, but the ' +
      'operation itself is routine and no one is beneath it.',
  },
  {
    id: 'move-4',
    craneId: 'crane-b',
    devicePhoneNumber: '+99999991002',
    container: {
      containerId: 'HLXU8845213',
      grossWeightKg: 36_800,
      overWalkway: true,
      twinLift: true,
    },
    fromLocation: 'BAY 18 ROW 08 TIER 82',
    toLocation: 'YARD C-07-2',
    expectedDurationSeconds: 165,
    summary:
      'Twin-lift of two loaded containers across an active walkway against the vessel ' +
      'departure cutoff. Twin-lift doubles the suspended mass and narrows the spreader ' +
      'tolerance, so the operator is working from camera feeds throughout.',
  },
];

export function findMoveDefinition(moveId: string): MoveDefinition | undefined {
  return WORK_QUEUE.find((m) => m.id === moveId);
}
