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
    id: 'stadium-incident',
    name: 'Stadium incident — public-safety priority comms',
    description:
      'The flagship scenario. A paramedic unit on routine standby at a capacity stadium event ' +
      'stays on standard connectivity under HIGH congestion — the same congestion a declared ' +
      'mass-casualty incident nearby escalates through minutes later, when the same device ' +
      'needs a guaranteed link to coordinate triage with the trauma centre. The pattern FirstNet ' +
      "(the US's $6.5B dedicated public-safety network, built after 9/11 responders lost " +
      'cellular comms to public congestion) solves with a second physical network, this solves ' +
      'in software on the network that already exists.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 20_000,
        event: {
          key: 'medic-12-standby',
          assetType: AssetType.AMBULANCE,
          device: { id: 'medic-12', phoneNumber: '+99999991004' },
          operation: 'Routine crowd-health standby patrol',
          description:
            'Paramedic unit stationed at a capacity stadium event, monitoring for minor medical ' +
            'needs during a routine match. Periodic check-ins only; no live decision depends on ' +
            'this feed, and a delayed check-in has no consequence.',
          expectedDurationSeconds: 600,
          site: 'Bahrain National Stadium — Gate C',
          metadata: {
            scheduled: true,
            deferrable: true,
            siteLatitude: 26.1655,
            siteLongitude: 50.547,
          },
        },
      },
      {
        atMs: 30_000,
        completeAfterMs: 25_000,
        event: {
          key: 'medic-12-incident',
          assetType: AssetType.AMBULANCE,
          device: { id: 'medic-12', phoneNumber: '+99999991004' },
          operation: 'Mass-casualty incident declared — priority triage coordination',
          description:
            'A crowd-crush incident has been declared near Gate C with multiple casualties. ' +
            'The paramedic unit needs a live, guaranteed-quality video and audio link to ' +
            'coordinate triage decisions with the regional trauma centre in real time; a dropped ' +
            'connection during active triage risks delayed life-saving care.',
          expectedDurationSeconds: 300,
          site: 'Bahrain National Stadium — Gate C',
          metadata: {
            emergency: true,
            deferrable: false,
            hazard: 'mass-casualty',
            siteLatitude: 26.1655,
            siteLongitude: 50.547,
          },
        },
      },
    ],
  },
  {
    id: 'crane-lift',
    name: 'Crane lift — high-value container',
    description:
      'Cross-industry generalisation: the same agent logic applied to port operations. A ' +
      'safety-critical lift begins during elevated congestion; the agent grants Quality on ' +
      'Demand and releases it when the lift completes.',
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
          metadata: {
            cargoValueUsd: 2_400_000,
            loadTonnes: 40,
            overWalkway: true,
            siteLatitude: 26.2041,
            siteLongitude: 50.605,
          },
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
          metadata: {
            scheduled: true,
            deferrable: true,
            siteLatitude: 26.15,
            siteLongitude: 50.62,
          },
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
          metadata: {
            emergency: true,
            deferrable: false,
            hazard: 'gas-leak',
            siteLatitude: 26.15,
            siteLongitude: 50.62,
          },
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
          metadata: {
            emergency: true,
            patientCritical: true,
            siteLatitude: 26.2285,
            siteLongitude: 50.586,
          },
        },
      },
    ],
  },
  {
    id: 'contested-lift',
    name: 'Contested lift — the agent gathers before it judges',
    description:
      'One job instruction, filed at 03:10 in a squall, that cannot be judged on its face. ' +
      'The dispatcher calls it an emergency; the manifest says the box is empty; the walkway ' +
      'is logged closed; and the crane uplink has been dropping since the wind came up, so ' +
      'nobody in the control room can see the load. Three separate things have to be true ' +
      'before this is safety-critical, and the request settles none of them — so the agent ' +
      'goes and asks the network, choosing its own checks.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 30_000,
        event: {
          key: 'crane-b-storm-recovery',
          assetType: AssetType.CRANE,
          device: { id: 'crane-b', phoneNumber: '+99999991002' },
          operation: 'Emergency lashing-bridge recovery — bay 18',
          description:
            'Night-shift recovery filed as an emergency by the duty dispatcher during a ' +
            'squall. The account is internally inconsistent and nobody has reconciled it: ' +
            'the manifest lists the container as empty, which would make this routine, while ' +
            'the dispatcher reports a shifted lashing bridge over the quay, which would not. ' +
            'The walkway is logged closed for the storm, but two lashers were signed in at ' +
            'the gate forty minutes ago and have not signed out. ' +
            'The crane uplink has been dropping in and out since the wind came up, so the ' +
            'control room cannot currently see the load on the feed and is working from the ' +
            "driver's radio. The dispatcher blames the cell for the drops; the night engineer " +
            'thinks it is the cabin modem. Nobody has confirmed which berth the crane was ' +
            'left on at end of the previous shift.',
          expectedDurationSeconds: 200,
          site: 'Khalifa Bin Salman Port — Berth 3',
          metadata: {
            emergency: true,
            deferrable: false,
            loadTonnes: 34,
            overWalkway: true,
            manifestSaysEmpty: true,
            walkwayLoggedClosed: true,
            lashersSignedIn: 2,
            uplinkIntermittent: true,
            siteLatitude: 26.2041,
            siteLongitude: 50.605,
            siteRadiusMeters: 2_000,
          },
        },
      },
    ],
  },
  {
    id: 'false-claim',
    name: 'False claim — the network contradicts the paperwork',
    description:
      'Two aircraft file the identical urgent leak inspection at the identical riser, ' +
      'seconds apart. One is there; the other is 24 km away. Nothing in the request ' +
      'distinguishes them, so the agent verifies the position against the network — and ' +
      'the one that cannot be where it says it is does not get a slice.',
    steps: [
      {
        atMs: 0,
        completeAfterMs: 25_000,
        event: {
          key: 'drone-3-riser',
          assetType: AssetType.DRONE,
          device: { id: 'drone-3', phoneNumber: '+99999991002' },
          operation: 'Pipeline leak inspection — riser 7',
          description:
            'Emergency thermal inspection of a suspected hydrocarbon leak at riser 7. ' +
            'Live imagery is being watched by the incident commander to decide whether ' +
            'to isolate the line.',
          expectedDurationSeconds: 240,
          site: 'Sitra Industrial Area — Riser 7',
          metadata: {
            emergency: true,
            deferrable: false,
            hazard: 'gas-leak',
            siteLatitude: 26.15,
            siteLongitude: 50.62,
            // Stated rather than defaulted, uniquely here: the whole scenario
            // is the distance between two claims, so the radius they are
            // measured against should be on the page.
            siteRadiusMeters: 2_000,
          },
        },
      },
      {
        atMs: 20_000,
        completeAfterMs: 25_000,
        event: {
          key: 'drone-9-riser',
          assetType: AssetType.DRONE,
          device: { id: 'drone-9', phoneNumber: '+99999991005' },
          // Deliberately word-for-word the step above. The request is not
          // where the difference lives.
          operation: 'Pipeline leak inspection — riser 7',
          description:
            'Emergency thermal inspection of a suspected hydrocarbon leak at riser 7. ' +
            'Live imagery is being watched by the incident commander to decide whether ' +
            'to isolate the line.',
          expectedDurationSeconds: 240,
          site: 'Sitra Industrial Area — Riser 7',
          metadata: {
            emergency: true,
            deferrable: false,
            hazard: 'gas-leak',
            siteLatitude: 26.15,
            siteLongitude: 50.62,
            siteRadiusMeters: 2_000,
          },
        },
      },
    ],
  },
  {
    id: 'asset-offline',
    name: 'Asset offline — the guard clause',
    description:
      'A genuinely safety-critical lift on a crane whose modem is not on the network. ' +
      'There is no uplink to protect, so the trail is two steps long and nothing is ' +
      'spent. Declining to allocate is the same discipline as releasing.',
    steps: [
      {
        atMs: 0,
        // No completion signal: the guard clause ends the workflow before
        // anything waits for one, and sending it anyway logs an error about a
        // workflow that has already finished correctly.
        event: {
          key: 'crane-c-lift',
          assetType: AssetType.CRANE,
          device: { id: 'crane-c', phoneNumber: '+99999991007' },
          operation: 'Move Container #TGHU6620441',
          description:
            'Loaded container discharge across the quay walkway on the outboard crane. ' +
            'The cabin modem dropped off the network at shift change and has not come ' +
            'back, so the operator is working from the cab rather than the control room.',
          expectedDurationSeconds: 150,
          site: 'Khalifa Bin Salman Port — Berth 3',
          metadata: {
            loadTonnes: 31.5,
            overWalkway: true,
            siteLatitude: 26.2041,
            siteLongitude: 50.605,
          },
        },
      },
    ],
  },
] as const;

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
