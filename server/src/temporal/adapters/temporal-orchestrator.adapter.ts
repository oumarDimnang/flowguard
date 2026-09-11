import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowHandle } from '@temporalio/client';

import type { TemporalConfig } from '../../config/configuration';
import type { BusinessEvent } from '../../events/domain/business-event';
import {
  CongestionUpdatedSignal,
  DeviceStatusChangedSignal,
  OperationSnapshot,
  QodStatusChangedSignal,
  StartedWorkflow,
  WorkflowOrchestratorPort,
} from '../ports/workflow-orchestrator.port';
import { SIGNALS, WORKFLOW_TYPES, operationWorkflowId } from '../temporal.constants';
import { OperationWorkflowNotFoundError } from '../temporal.errors';
import { TemporalConnectionProvider } from '../temporal-connection.provider';

/** Temporal SDK errors are matched by name to avoid coupling to import paths. */
function isAlreadyStarted(err: unknown): boolean {
  return (err as Error)?.name === 'WorkflowExecutionAlreadyStartedError';
}

function isNotFound(err: unknown): boolean {
  const name = (err as Error)?.name;
  return name === 'WorkflowNotFoundError' || name === 'WorkflowExecutionNotFoundError';
}

/**
 * The only class in the codebase that talks to @temporalio/client (S2).
 *
 * Workflows are started by *type name string* rather than by importing a
 * workflow function, because the workflows are implemented in Python. There is
 * no compile-time link between the two — see temporal.constants.ts.
 */
@Injectable()
export class TemporalOrchestratorAdapter extends WorkflowOrchestratorPort {
  private readonly logger = new Logger(TemporalOrchestratorAdapter.name);

  constructor(
    private readonly connection: TemporalConnectionProvider,
    private readonly config: ConfigService,
  ) {
    super();
  }

  private get taskQueue(): string {
    return this.config.getOrThrow<TemporalConfig>('temporal').taskQueue;
  }

  async startOperation(event: BusinessEvent): Promise<StartedWorkflow> {
    const workflowId = operationWorkflowId(event.organizationId, event.id);
    const client = this.connection.getClient();

    try {
      const handle = await client.workflow.start(WORKFLOW_TYPES.CRITICAL_OPERATION, {
        taskQueue: this.taskQueue,
        workflowId,
        args: [event],
      });

      this.logger.log(`Started ${workflowId} (run ${handle.firstExecutionRunId})`);

      return { workflowId, runId: handle.firstExecutionRunId, alreadyRunning: false };
    } catch (err) {
      // Deterministic workflow IDs mean a re-submitted business event lands
      // here instead of creating a second execution holding a second QoD
      // session (S7). Adopt the running execution and report it as such.
      if (isAlreadyStarted(err)) {
        this.logger.warn(`${workflowId} already running — returning existing execution`);
        const description = await client.workflow.getHandle(workflowId).describe();
        return { workflowId, runId: description.runId, alreadyRunning: true };
      }
      throw err;
    }
  }

  async signalOperationCompleted(
    organizationId: string,
    businessEventId: string,
  ): Promise<void> {
    await this.signal(organizationId, businessEventId, SIGNALS.OPERATION_COMPLETED);
  }

  async signalOperationSuspended(
    organizationId: string,
    businessEventId: string,
    payload: { reason: string; state?: string },
  ): Promise<void> {
    await this.signal(
      organizationId,
      businessEventId,
      SIGNALS.OPERATION_SUSPENDED,
      payload,
    );
  }

  async signalOperationResumed(
    organizationId: string,
    businessEventId: string,
  ): Promise<void> {
    await this.signal(organizationId, businessEventId, SIGNALS.OPERATION_RESUMED, {});
  }

  async signalQodStatusChanged(
    organizationId: string,
    businessEventId: string,
    payload: QodStatusChangedSignal,
  ): Promise<void> {
    await this.signal(organizationId, businessEventId, SIGNALS.QOD_STATUS_CHANGED, payload);
  }

  async signalCongestionUpdated(
    organizationId: string,
    businessEventId: string,
    payload: CongestionUpdatedSignal,
  ): Promise<void> {
    await this.signal(organizationId, businessEventId, SIGNALS.CONGESTION_UPDATED, payload);
  }

  async signalDeviceStatusChanged(
    organizationId: string,
    businessEventId: string,
    payload: DeviceStatusChangedSignal,
  ): Promise<void> {
    await this.signal(organizationId, businessEventId, SIGNALS.DEVICE_STATUS_CHANGED, payload);
  }

  async describeOperation(
    organizationId: string,
    businessEventId: string,
  ): Promise<OperationSnapshot | null> {
    const workflowId = operationWorkflowId(organizationId, businessEventId);
    try {
      const description = await this.connection
        .getClient()
        .workflow.getHandle(workflowId)
        .describe();

      return {
        workflowId,
        runId: description.runId,
        status: description.status.name,
        startedAt: description.startTime,
        closedAt: description.closeTime,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.connection.ping();
  }

  private async signal(
    organizationId: string,
    businessEventId: string,
    signalName: string,
    payload?: unknown,
  ): Promise<void> {
    const workflowId = operationWorkflowId(organizationId, businessEventId);
    const handle: WorkflowHandle = this.connection.getClient().workflow.getHandle(workflowId);

    try {
      if (payload === undefined) {
        await handle.signal(signalName);
      } else {
        await handle.signal(signalName, payload);
      }
      this.logger.debug(`Signalled ${signalName} -> ${workflowId}`);
    } catch (err) {
      if (isNotFound(err)) {
        throw new OperationWorkflowNotFoundError(workflowId);
      }
      throw err;
    }
  }
}
