import type { BusinessEvent } from '../../events/domain/business-event';
import type { QosStatus, QosStatusInfo, CongestionLevel } from '../../common/domain/enums';

export interface StartedWorkflow {
  workflowId: string;
  runId: string;
  /** True when this call found an already-running execution rather than creating one (S7). */
  alreadyRunning: boolean;
}

export interface QodStatusChangedSignal {
  sessionId: string;
  qosStatus: QosStatus;
  statusInfo?: QosStatusInfo;
}

export interface CongestionUpdatedSignal {
  deviceId: string;
  level: CongestionLevel;
  observedAt: string;
}

export interface DeviceStatusChangedSignal {
  deviceId: string;
  reachable: boolean;
  observedAt: string;
}

export interface OperationSnapshot {
  workflowId: string;
  runId: string;
  status: string;
  startedAt?: Date;
  closedAt?: Date;
}

/**
 * The boundary between FlowGuard's business logic and its durable-execution
 * engine (S2).
 *
 * Declared as an abstract class rather than an interface because TypeScript
 * interfaces are erased at runtime and therefore cannot serve as Nest
 * injection tokens. This class is both the contract and the DI token:
 *
 *   { provide: WorkflowOrchestratorPort, useClass: TemporalOrchestratorAdapter }
 *
 * Nothing outside `src/temporal/` imports `@temporalio/client`. Swapping the
 * engine, or injecting a fake in tests, is a one-line module change.
 */
export abstract class WorkflowOrchestratorPort {
  /** Start (or adopt) the durable workflow for a critical operation. */
  abstract startOperation(event: BusinessEvent): Promise<StartedWorkflow>;

  /** Tell the workflow its operation finished, so it releases connectivity. */
  abstract signalOperationCompleted(
    organizationId: string,
    businessEventId: string,
  ): Promise<void>;

  /** Relay an asynchronous CAMARA QoD status transition (D8). */
  abstract signalQodStatusChanged(
    organizationId: string,
    businessEventId: string,
    payload: QodStatusChangedSignal,
  ): Promise<void>;

  /** Relay a Congestion Insights notification. */
  abstract signalCongestionUpdated(
    organizationId: string,
    businessEventId: string,
    payload: CongestionUpdatedSignal,
  ): Promise<void>;

  /** Relay a Device Status notification. */
  abstract signalDeviceStatusChanged(
    organizationId: string,
    businessEventId: string,
    payload: DeviceStatusChangedSignal,
  ): Promise<void>;

  /** Read the current execution state, or null if no such workflow exists. */
  abstract describeOperation(
    organizationId: string,
    businessEventId: string,
  ): Promise<OperationSnapshot | null>;

  /** Liveness probe for the health endpoint. */
  abstract isHealthy(): Promise<boolean>;
}
