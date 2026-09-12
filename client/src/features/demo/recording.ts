import type {
  ContainerAttributes,
  DecisionRecord,
  FacilityJob,
  IsoDateString,
  Operation,
} from '@/types';

/**
 * Two real crane moves, recorded for the demo.
 *
 * Captured from the running stack — Temporal, the Python worker, the NestJS
 * server and Mongo — by dispatching move-1 and then move-2 on crane-a through
 * the server's own container-terminal system, exactly as the Control Room's
 * dispatch button does. The criticality judgements came from a real model over
 * OpenRouter. The network was FlowGuard's mock provider, which scripts crane-a's
 * cell as High congestion so that both moves see identical conditions.
 *
 * Verbatim apart from two things: the organization id is redacted (it is a
 * field, and a segment of every workflow id), and empty arrays are omitted.
 * Nothing is edited to read better. The page is only worth showing if every
 * step, time and sentence on it actually happened.
 *
 * Regenerate by re-running a capture rather than by editing this file.
 */

/** A facility state change, stamped when the terminal system published it. */
export interface StateChange {
  state: string;
  at: IsoDateString;
}

export interface RecordedMove {
  job: FacilityJob<ContainerAttributes>;
  transitions: readonly StateChange[];
  operation: Operation;
  records: readonly DecisionRecord[];
}

export interface Recording {
  capturedAt: IsoDateString;
  /** The pinned model behind the criticality judgements. */
  model: string;
  /** Which NetworkProvider served the CAMARA calls. */
  network: 'mock' | 'nokia';
  /** move-1: an empty box, deferrable. Dispatched just before move-2, same crane and cell. */
  routine: RecordedMove;
  /** move-2: 40 t of IMDG class 3 across an active walkway. */
  critical: RecordedMove;
}

export const RECORDING: Recording = {
  capturedAt: '2026-09-11T13:47:21.968Z',
  model: 'openai/gpt-5.6-luna',
  network: 'mock',
  routine: {
    job: {
      id: 'move-1',
      assetId: 'crane-a',
      devicePhoneNumber: '+99999991001',
      state: 'RELEASED',
      lifecycle: ['GANTRY', 'TROLLEY', 'SPREADER', 'TWISTLOCK', 'HOISTING', 'LANDING', 'RELEASED'],
      gateState: 'TWISTLOCK',
      summary: 'Scheduled repositioning of an empty container from the vessel to the yard stack. No personnel beneath the path and no time dependency — the move can be repeated later in the shift without operational consequence.',
      attributes: {
        containerId: 'MSCU4823157',
        grossWeightKg: 2300,
        overWalkway: false,
      },
      from: 'BAY 22 ROW 04 TIER 82',
      to: 'YARD A-12-3',
      expectedDurationSeconds: 90,
      deferrable: true,
      operationId: 'move-1-2ce95596',
      workflowId: 'operation-org-move-1-2ce95596',
      dispatchedAt: '2026-09-11T13:46:27.543Z',
      gateAuthorisedAt: '2026-09-11T13:46:37.713Z',
      gateAuthorisedBy: 'DECISION',
      completedAt: '2026-09-11T13:46:49.732Z',
    },
    transitions: [
      {
        state: 'GANTRY',
        at: '2026-09-11T13:46:27.543Z',
      },
      {
        state: 'TROLLEY',
        at: '2026-09-11T13:46:31.550Z',
      },
      {
        state: 'SPREADER',
        at: '2026-09-11T13:46:34.558Z',
      },
      {
        state: 'TWISTLOCK',
        at: '2026-09-11T13:46:37.572Z',
      },
      {
        state: 'HOISTING',
        at: '2026-09-11T13:46:37.713Z',
      },
      {
        state: 'LANDING',
        at: '2026-09-11T13:46:45.717Z',
      },
      {
        state: 'RELEASED',
        at: '2026-09-11T13:46:49.732Z',
      },
    ],
    operation: {
      operationId: 'move-1-2ce95596',
      workflowId: 'operation-org-move-1-2ce95596',
      runId: '01a090b8-382c-7580-bc82-6cfff7795095',
      assetType: 'CRANE',
      deviceId: 'crane-a',
      operationName: 'Move container MSCU4823157',
      site: 'Khalifa Bin Salman Port — Berth 3 — BAY 22 ROW 04 TIER 82',
      status: 'COMPLETED',
      criticality: 'LOW',
      congestion: 'High',
      deviceReachable: true,
      action: 'NONE',
      reasoning: 'This is a scheduled move of a light, non-hazardous empty container with no personnel beneath the path. It is explicitly deferrable and can be repeated later without operational consequence, so degraded connectivity would be only an inconvenience. — Operation is routine (criticality LOW). Congestion is High, but congestion alone does not justify premium allocation.',
      startedAt: '2026-09-11T13:46:27.248Z',
      updatedAt: '2026-09-11T13:46:32.402Z',
      completedAt: '2026-09-11T13:46:32.402Z',
    },
    records: [
      {
        idempotencyKey: '01a090b8-382c-7580-bc82-6cfff7795095:DEVICE_CHECKED:2026-09-11T13:46:27.303Z',
        operationId: 'move-1-2ce95596',
        workflowId: 'operation-org-move-1-2ce95596',
        runId: '01a090b8-382c-7580-bc82-6cfff7795095',
        step: 'DEVICE_CHECKED',
        deviceReachable: true,
        occurredAt: '2026-09-11T13:46:27.303Z',
        recordedAt: '2026-09-11T13:46:27.590Z',
      },
      {
        idempotencyKey: '01a090b8-382c-7580-bc82-6cfff7795095:CONGESTION_CHECKED:2026-09-11T13:46:27.954Z',
        operationId: 'move-1-2ce95596',
        workflowId: 'operation-org-move-1-2ce95596',
        runId: '01a090b8-382c-7580-bc82-6cfff7795095',
        step: 'CONGESTION_CHECKED',
        congestion: 'High',
        occurredAt: '2026-09-11T13:46:27.954Z',
        recordedAt: '2026-09-11T13:46:28.109Z',
      },
      {
        idempotencyKey: '01a090b8-382c-7580-bc82-6cfff7795095:CRITICALITY_ASSESSED:2026-09-11T13:46:31.646Z',
        operationId: 'move-1-2ce95596',
        workflowId: 'operation-org-move-1-2ce95596',
        runId: '01a090b8-382c-7580-bc82-6cfff7795095',
        step: 'CRITICALITY_ASSESSED',
        criticality: 'LOW',
        criticalityConfidence: 0.99,
        reasoning: 'This is a scheduled move of a light, non-hazardous empty container with no personnel beneath the path. It is explicitly deferrable and can be repeated later without operational consequence, so degraded connectivity would be only an inconvenience.',
        graphTrace: ['classify(attempt=1, model=openai/gpt-5.6-luna) -> LOW @ 0.99', 'validate(ok)'],
        modelId: 'openai/gpt-5.6-luna',
        occurredAt: '2026-09-11T13:46:31.646Z',
        recordedAt: '2026-09-11T13:46:31.806Z',
      },
      {
        idempotencyKey: '01a090b8-382c-7580-bc82-6cfff7795095:DECIDED:2026-09-11T13:46:32.102Z',
        operationId: 'move-1-2ce95596',
        workflowId: 'operation-org-move-1-2ce95596',
        runId: '01a090b8-382c-7580-bc82-6cfff7795095',
        step: 'DECIDED',
        criticality: 'LOW',
        congestion: 'High',
        deviceReachable: true,
        action: 'NONE',
        reasoning: 'This is a scheduled move of a light, non-hazardous empty container with no personnel beneath the path. It is explicitly deferrable and can be repeated later without operational consequence, so degraded connectivity would be only an inconvenience. — Operation is routine (criticality LOW). Congestion is High, but congestion alone does not justify premium allocation.',
        rule: 'ROUTINE_NO_ACTION',
        occurredAt: '2026-09-11T13:46:32.102Z',
        recordedAt: '2026-09-11T13:46:32.257Z',
      },
    ],
  },
  critical: {
    job: {
      id: 'move-2',
      assetId: 'crane-a',
      devicePhoneNumber: '+99999991001',
      state: 'RELEASED',
      lifecycle: ['GANTRY', 'TROLLEY', 'SPREADER', 'TWISTLOCK', 'HOISTING', 'LANDING', 'RELEASED'],
      gateState: 'TWISTLOCK',
      summary: 'Remote-operated lift of a 40-tonne IMDG class 3 (flammable liquids) container whose path crosses an active quay walkway. The operator is driving from the control room on a live uplink video feed; losing that feed with the load suspended forces an emergency stop above people.',
      attributes: {
        containerId: 'MAEU7391024',
        grossWeightKg: 40100,
        imdgClass: '3',
        overWalkway: true,
      },
      from: 'BAY 22 ROW 06 TIER 84',
      to: 'YARD H-04-1',
      expectedDurationSeconds: 180,
      operationId: 'move-2-6b3a51bd',
      workflowId: 'operation-org-move-2-6b3a51bd',
      dispatchedAt: '2026-09-11T13:46:53.179Z',
      gateAuthorisedAt: '2026-09-11T13:47:05.931Z',
      gateAuthorisedBy: 'DECISION',
      completedAt: '2026-09-11T13:47:17.948Z',
    },
    transitions: [
      {
        state: 'GANTRY',
        at: '2026-09-11T13:46:53.179Z',
      },
      {
        state: 'TROLLEY',
        at: '2026-09-11T13:46:57.189Z',
      },
      {
        state: 'SPREADER',
        at: '2026-09-11T13:47:00.193Z',
      },
      {
        state: 'TWISTLOCK',
        at: '2026-09-11T13:47:03.209Z',
      },
      {
        state: 'HOISTING',
        at: '2026-09-11T13:47:05.931Z',
      },
      {
        state: 'LANDING',
        at: '2026-09-11T13:47:13.941Z',
      },
      {
        state: 'RELEASED',
        at: '2026-09-11T13:47:17.948Z',
      },
    ],
    operation: {
      operationId: 'move-2-6b3a51bd',
      workflowId: 'operation-org-move-2-6b3a51bd',
      runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
      assetType: 'CRANE',
      deviceId: 'crane-a',
      operationName: 'Move container MAEU7391024',
      site: 'Khalifa Bin Salman Port — Berth 3 — BAY 22 ROW 06 TIER 84',
      status: 'COMPLETED',
      criticality: 'HIGH',
      congestion: 'High',
      deviceReachable: true,
      action: 'QOD_AND_SLICE',
      reasoning: 'Operation complete; enhanced connectivity released.',
      qodSessionId: 'mock-qod-crane-a-0001',
      qosStatus: 'UNAVAILABLE',
      sliceId: 'mock-urllc-slice-01',
      startedAt: '2026-09-11T13:46:53.034Z',
      updatedAt: '2026-09-11T13:47:18.422Z',
      completedAt: '2026-09-11T13:47:18.422Z',
    },
    records: [
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:DEVICE_CHECKED:2026-09-11T13:46:53.085Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'DEVICE_CHECKED',
        deviceReachable: true,
        occurredAt: '2026-09-11T13:46:53.085Z',
        recordedAt: '2026-09-11T13:46:53.247Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:CONGESTION_CHECKED:2026-09-11T13:46:53.591Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'CONGESTION_CHECKED',
        congestion: 'High',
        occurredAt: '2026-09-11T13:46:53.591Z',
        recordedAt: '2026-09-11T13:46:53.745Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:CRITICALITY_ASSESSED:2026-09-11T13:47:04.668Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'CRITICALITY_ASSESSED',
        criticality: 'HIGH',
        criticalityConfidence: 0.99,
        reasoning: 'This is a remote-operated lift of a 40-tonne container carrying flammable liquids across an active walkway, with people potentially beneath or near the suspended load. Loss of the live control feed while the load is suspended could create a loss-of-control or falling-load hazard, and the move cannot be deferred without consequence.',
        graphTrace: [
          'classify(attempt=1, model=openai/gpt-5.6-luna) -> HIGH @ 0.99',
          'gather_evidence(facts=5, tools=1)',
          '  tool:verify_device_location -> CONFIRMED: the device is within 2000m of the stated location.',
          'classify(attempt=2, model=openai/gpt-5.6-luna) -> HIGH @ 0.99',
          'validate(ok)',
        ],
        toolCalls: [
          {
            name: 'verify_device_location',
            arguments: {
              latitude: 26.2041,
              longitude: 50.605,
              radius_meters: 2000,
            },
            result: 'CONFIRMED: the device is within 2000m of the stated location.',
            failed: false,
          },
        ],
        modelId: 'openai/gpt-5.6-luna',
        occurredAt: '2026-09-11T13:47:04.668Z',
        recordedAt: '2026-09-11T13:47:04.828Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:DECIDED:2026-09-11T13:47:05.121Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'DECIDED',
        criticality: 'HIGH',
        congestion: 'High',
        deviceReachable: true,
        action: 'QOD_AND_SLICE',
        reasoning: 'This is a remote-operated lift of a 40-tonne container carrying flammable liquids across an active walkway, with people potentially beneath or near the suspended load. Loss of the live control feed while the load is suspended could create a loss-of-control or falling-load hazard, and the move cannot be deferred without consequence. — Safety-critical operation at risk from High congestion; guaranteed quality requested and device attached to a dedicated slice.',
        rule: 'SAFETY_CRITICAL_CONGESTED_SLICE',
        occurredAt: '2026-09-11T13:47:05.121Z',
        recordedAt: '2026-09-11T13:47:05.283Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:ALLOCATED:2026-09-11T13:47:05.789Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'ALLOCATED',
        action: 'QOD_AND_SLICE',
        qodSessionId: 'mock-qod-crane-a-0001',
        qosStatus: 'REQUESTED',
        sliceId: 'mock-urllc-slice-01',
        occurredAt: '2026-09-11T13:47:05.789Z',
        recordedAt: '2026-09-11T13:47:05.945Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:QOS_STATUS_CHANGED:2026-09-11T13:47:16.287Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'QOS_STATUS_CHANGED',
        qodSessionId: 'mock-qod-crane-a-0001',
        qosStatus: 'AVAILABLE',
        occurredAt: '2026-09-11T13:47:16.287Z',
        recordedAt: '2026-09-11T13:47:16.443Z',
      },
      {
        idempotencyKey: '01a090b8-9ce9-7292-a32d-87f240f0a610:RELEASED:2026-09-11T13:47:18.123Z',
        operationId: 'move-2-6b3a51bd',
        workflowId: 'operation-org-move-2-6b3a51bd',
        runId: '01a090b8-9ce9-7292-a32d-87f240f0a610',
        step: 'RELEASED',
        reasoning: 'Operation complete; enhanced connectivity released.',
        qodSessionId: 'mock-qod-crane-a-0001',
        qosStatus: 'UNAVAILABLE',
        sliceId: 'mock-urllc-slice-01',
        occurredAt: '2026-09-11T13:47:18.123Z',
        recordedAt: '2026-09-11T13:47:18.278Z',
      },
    ],
  },
};
