import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AssetType, OperationStatus } from '../common/domain/enums';
import type { Operation, OperationCreate, OperationPatch } from '../operations/domain/operation';
import { OperationsService } from '../operations/operations.service';
import { WorkflowOrchestratorPort } from '../temporal/ports/workflow-orchestrator.port';
import { OperationWorkflowNotFoundError } from '../temporal/temporal.errors';
import type { CreateBusinessEventDto } from './dto/create-business-event.dto';
import { EventsService } from './events.service';

/**
 * These tests run with no MongoDB and no Temporal server.
 *
 * That is the whole point of the ports-and-adapters layering (S1, S3): the
 * service depends on abstract classes, so a plain object satisfies the contract
 * and the business logic is testable in milliseconds.
 */

class FakeOrchestrator extends WorkflowOrchestratorPort {
  started: unknown[] = [];
  completedSignals: string[] = [];
  alreadyRunning = false;
  missingWorkflow = false;

  async startOperation(event: { id: string }) {
    this.started.push(event);
    return {
      workflowId: `operation-${event.id}`,
      runId: 'run-1',
      alreadyRunning: this.alreadyRunning,
    };
  }

  async signalOperationCompleted(id: string): Promise<void> {
    if (this.missingWorkflow) {
      throw new OperationWorkflowNotFoundError(`operation-${id}`);
    }
    this.completedSignals.push(id);
  }

  async signalQodStatusChanged(): Promise<void> {}
  async signalCongestionUpdated(): Promise<void> {}
  async signalDeviceStatusChanged(): Promise<void> {}
  async describeOperation() {
    return null;
  }
  async isHealthy() {
    return true;
  }
}

class FakeOperationsService {
  registered: OperationCreate[] = [];
  patches: { id: string; patch: OperationPatch }[] = [];

  async register(operation: OperationCreate): Promise<Operation> {
    this.registered.push(operation);
    return operation as unknown as Operation;
  }

  async applyIfPresent(id: string, patch: OperationPatch): Promise<Operation | null> {
    this.patches.push({ id, patch });
    return null;
  }
}

const craneLift: CreateBusinessEventDto = {
  id: 'evt-1',
  assetType: AssetType.CRANE,
  device: { id: 'crane-a', phoneNumber: '+99999991001' },
  operation: 'Move Container #A392',
  description: 'High-value container over an active walkway',
  expectedDurationSeconds: 180,
};

describe('EventsService', () => {
  let service: EventsService;
  let orchestrator: FakeOrchestrator;
  let operations: FakeOperationsService;

  beforeEach(async () => {
    orchestrator = new FakeOrchestrator();
    operations = new FakeOperationsService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: WorkflowOrchestratorPort, useValue: orchestrator },
        { provide: OperationsService, useValue: operations },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  it('starts a durable workflow and projects the operation', async () => {
    const result = await service.accept(craneLift);

    expect(result.workflowId).toBe('operation-evt-1');
    expect(orchestrator.started).toHaveLength(1);
    expect(operations.registered[0]).toMatchObject({
      operationId: 'evt-1',
      deviceId: 'crane-a',
      status: OperationStatus.PENDING,
    });
  });

  it('defaults occurredAt when the facility omits it', async () => {
    await service.accept(craneLift);
    const event = orchestrator.started[0] as { occurredAt: string };
    expect(Date.parse(event.occurredAt)).not.toBeNaN();
  });

  /**
   * S7: a re-submitted business event must adopt the running execution rather
   * than start a second one. Two workflows would mean two paid QoD sessions for
   * a single physical operation.
   */
  it('reports a duplicate submission instead of starting a second workflow', async () => {
    orchestrator.alreadyRunning = true;

    const result = await service.accept(craneLift);

    expect(result.alreadyRunning).toBe(true);
    expect(result.workflowId).toBe('operation-evt-1');
  });

  it('signals completion and moves the operation to RELEASING', async () => {
    await service.complete('evt-1');

    expect(orchestrator.completedSignals).toEqual(['evt-1']);
    expect(operations.patches[0]).toEqual({
      id: 'evt-1',
      patch: { status: OperationStatus.RELEASING },
    });
  });

  /**
   * The adapter raises an infrastructure error; the service is what turns it
   * into a transport concern, keeping the adapter HTTP-agnostic.
   */
  it('translates a missing workflow into NotFoundException', async () => {
    orchestrator.missingWorkflow = true;

    await expect(service.complete('evt-nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
