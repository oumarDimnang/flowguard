import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { OperationStatus } from '../common/domain/enums';
import { OperationsService } from '../operations/operations.service';
import { WorkflowOrchestratorPort } from '../temporal/ports/workflow-orchestrator.port';
import { OperationWorkflowNotFoundError } from '../temporal/temporal.errors';
import type { BusinessEvent, OperationAccepted } from './domain/business-event';
import type { CreateBusinessEventDto } from './dto/create-business-event.dto';

/**
 * Entry point for the whole system: a facility reports something happening, and
 * a durable workflow is started to decide what the network should do about it.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly orchestrator: WorkflowOrchestratorPort,
    private readonly operations: OperationsService,
  ) {}

  async accept(dto: CreateBusinessEventDto): Promise<OperationAccepted> {
    const event: BusinessEvent = {
      id: dto.id,
      assetType: dto.assetType,
      device: dto.device,
      operation: dto.operation,
      description: dto.description,
      expectedDurationSeconds: dto.expectedDurationSeconds,
      site: dto.site,
      metadata: dto.metadata,
      occurredAt: dto.occurredAt ?? new Date().toISOString(),
    };

    // Start the workflow BEFORE projecting to the read model. If Temporal
    // rejects the event there is no operation to speak of, and a read model row
    // with no backing execution would be a phantom on the dashboard.
    const started = await this.orchestrator.startOperation(event);

    await this.operations.register({
      operationId: event.id,
      workflowId: started.workflowId,
      runId: started.runId,
      assetType: event.assetType,
      deviceId: event.device.id,
      operationName: event.operation,
      site: event.site,
      status: OperationStatus.PENDING,
    });

    if (started.alreadyRunning) {
      this.logger.warn(`Duplicate submission for '${event.id}' — adopted running execution`);
    }

    return {
      operationId: event.id,
      workflowId: started.workflowId,
      runId: started.runId,
      alreadyRunning: started.alreadyRunning,
    };
  }

  /**
   * The facility reports the operation has finished.
   *
   * This is the signal that triggers release of enhanced connectivity — the
   * half of the loop the entire cost saving depends on.
   */
  async complete(operationId: string): Promise<{ operationId: string; signalled: true }> {
    try {
      await this.orchestrator.signalOperationCompleted(operationId);
    } catch (err) {
      // Translate the infrastructure error into a transport one at the service
      // boundary; the adapter itself stays HTTP-agnostic.
      if (err instanceof OperationWorkflowNotFoundError) {
        throw new NotFoundException(`No running operation '${operationId}'`);
      }
      throw err;
    }

    await this.operations.applyIfPresent(operationId, { status: OperationStatus.RELEASING });

    return { operationId, signalled: true };
  }
}
