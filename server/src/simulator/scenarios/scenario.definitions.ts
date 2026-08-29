import { AssetType } from '../../common/domain/enums';

export interface ScenarioEvent {
  /** Suffix appended to the run nonce to build a unique event id. */
  key: string;
  assetType: AssetType;
  device: { id: string; phoneNumber?: string };
  operation: string;
  description: string;
  expectedDurationSeconds: number;
  site?: string;
  metadata?: Record<string, unknown>;
}

export interface ScenarioStep {
  /** Delay from scenario start before this event is emitted. */
  atMs: number;
  event: ScenarioEvent;
  /** Emit a completion signal this long after the event, if set. */
  completeAfterMs?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
}

/**
 * Scripted, reproducible demo scenarios.
 *
 * Reproducibility is the point: the submission claims specific impact
 * percentages, and those numbers have to come from replaying a fixed scenario
 * set rather than being computed by hand.
 *
 * Phone numbers are Nokia sandbox simulated devices.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'crane-lift',
    name: 'Crane lift — high-value container',
    description:
      'The primary demo path. A safety-critical lift begins during elevated congestion; ' +
      'the agent grants Quality on Demand and releases it when the lift completes.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 25_000,
        event: {
          key: 'crane-a-lift',
          assetType: AssetType.CRANE,
          device: { id: 'crane-a', phoneNumber: '+99999991001' },
          operation: 'Move Container #A392',
          description:
            'Remote-operated gantry crane lifting a 40-tonne high-value container over an ' +
            'active quay walkway. Operator relies on a live low-latency video feed; loss of ' +
            'feed mid-lift requires an emergency stop with the load suspended.',
          expectedDurationSeconds: 180,
          site: 'Khalifa Bin Salman Port — Berth 3',
          metadata: { cargoValueUsd: 2_400_000, loadTonnes: 40, overWalkway: true },
        },
      },
    ],
  },
  {
    id: 'drone-contrast',
    name: 'Drone contrast pair — criticality, not congestion',
    description:
      'The thesis, demonstrated. The same drone under identical HIGH congestion: routine ' +
      'mapping is left on standard connectivity, then five minutes later a pipeline leak ' +
      'inspection on the same device receives QoD. Congestion is unchanged; only business ' +
      'criticality differs.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 20_000,
        event: {
          key: 'drone-3-routine',
          assetType: AssetType.DRONE,
          device: { id: 'drone-3', phoneNumber: '+99999991002' },
          operation: 'Routine perimeter mapping',
          description:
            'Scheduled photogrammetry sweep of the northern perimeter. Imagery is batched ' +
            'and uploaded after landing. No live decision depends on this feed, and the ' +
            'flight can be repeated at any time.',
          expectedDurationSeconds: 600,
          site: 'Sitra Industrial Area',
          metadata: { scheduled: true, deferrable: true },
        },
      },
      {
        atMs: 30_000,
        completeAfterMs: 25_000,
        event: {
          key: 'drone-3-leak',
          assetType: AssetType.DRONE,
          device: { id: 'drone-3', phoneNumber: '+99999991002' },
          operation: 'Pipeline leak inspection',
          description:
            'Emergency thermal inspection of a suspected gas leak on trunk line B. Live ' +
            'thermal imagery is being watched by the incident commander to decide whether to ' +
            'evacuate the adjacent compound. A dropped feed delays that decision.',
          expectedDurationSeconds: 240,
          site: 'Sitra Industrial Area — Trunk Line B',
          metadata: { emergency: true, deferrable: false, hazard: 'gas-leak' },
        },
      },
    ],
  },
  {
    id: 'ambulance-telemedicine',
    name: 'Ambulance — live specialist consultation',
    description:
      'Cross-industry generalisation: identical agent logic, different business context. ' +
      'A paramedic escalates from routine transport to a live consultation mid-journey.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 30_000,
        event: {
          key: 'ambulance-7-consult',
          assetType: AssetType.AMBULANCE,
          device: { id: 'ambulance-7', phoneNumber: '+99999991003' },
          operation: 'Live stroke specialist consultation',
          description:
            'En-route patient showing suspected stroke symptoms. Paramedic has opened a live ' +
            'video consultation with a neurologist to determine whether to divert to a ' +
            'thrombectomy-capable centre. The decision window is minutes.',
          expectedDurationSeconds: 420,
          site: 'Route 1 — inbound',
          metadata: { emergency: true, patientCritical: true },
        },
      },
    ],
  },
] as const;

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
