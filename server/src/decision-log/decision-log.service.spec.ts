import { Test } from '@nestjs/testing';

import {
  CongestionLevel,
  Criticality,
  NetworkAction,
  OperationStatus,
  QosStatus,
} from '../common/domain/enums';
import type { OperationPatch } from '../operations/domain/operation';
import { OperationsService } from '../operations/operations.service';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import { DecisionLogService } from './decision-log.service';
import { DecisionStep, type DecisionRecord } from './domain/decision-record';
import type { RecordDecisionDto } from './dto/record-decision.dto';
import { DecisionLogRepository, type AppendResult } from './ports/decision-log.repository';

class FakeDecisionLogRepository extends DecisionLogRepository {
  private readonly seen = new Set<string>();
  appended: string[] = [];
  received: Omit<DecisionRecord, 'recordedAt'>[] = [];

  async append(record: Omit<DecisionRecord, 'recordedAt'>): Promise<AppendResult> {
    const inserted = !this.seen.has(record.idempotencyKey);
    this.seen.add(record.idempotencyKey);
    if (inserted) this.appended.push(record.idempotencyKey);
    this.received.push(record);
    return { record: { ...record, recordedAt: new Date() }, inserted };
  }

  async findByOperation() {
    return [];
  }
  async findAll() {
    return { items: [], total: 0, skip: 0, limit: 50 };
  }
  async counts() {
    return {
      byAction: {},
      byCriticality: {},
      criticalProtected: 0,
      criticalUnprotected: 0,
      unnecessaryQodAvoided: 0,
      criticalNotAtRisk: 0,
    };
  }
}

class FakeOperationsService {
  patches: { id: string; patch: OperationPatch }[] = [];
  async applyIfPresent(id: string, patch: OperationPatch) {
    this.patches.push({ id, patch });
    return null;
  }
  lastPatch(): OperationPatch | undefined {
    return this.patches.at(-1)?.patch;
  }
}

class FakeRealtimePublisher extends RealtimePublisherPort {
  published: { event: string; payload: unknown }[] = [];
  publish<T>(event: string, payload: T): void {
    this.published.push({ event, payload });
  }
  connectedClients(): number {
    return 0;
  }
}

function decision(overrides: Partial<RecordDecisionDto> = {}): RecordDecisionDto {
  return {
    operationId: 'evt-1',
    workflowId: 'operation-evt-1',
    runId: 'run-1',
    step: DecisionStep.DECIDED,
    ...overrides,
  } as RecordDecisionDto;
}

describe('DecisionLogService', () => {
  let service: DecisionLogService;
  let operations: FakeOperationsService;
  let realtime: FakeRealtimePublisher;
  let repository: FakeDecisionLogRepository;

  beforeEach(async () => {
    repository = new FakeDecisionLogRepository();
    operations = new FakeOperationsService();
    realtime = new FakeRealtimePublisher();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DecisionLogService,
        { provide: DecisionLogRepository, useValue: repository },
        { provide: OperationsService, useValue: operations },
        { provide: RealtimePublisherPort, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(DecisionLogService);
  });

  it('records a decision, projects it, and pushes it to the dashboard', async () => {
    const result = await service.record(
      decision({
        criticality: Criticality.HIGH,
        congestion: CongestionLevel.HIGH,
        action: NetworkAction.QOD,
        reasoning: 'Safety-critical lift during congestion',
      }),
    );

    expect(result).toEqual({ recorded: true, duplicate: false });
    expect(operations.lastPatch()).toMatchObject({
      criticality: Criticality.HIGH,
      congestion: CongestionLevel.HIGH,
      action: NetworkAction.QOD,
    });
    expect(realtime.published[0].event).toBe(LIVE_EVENTS.DECISION_RECORDED);
  });

  /**
   * Temporal retries activities. A retried emit must not append twice, must not
   * re-project, and must not re-publish — otherwise the decision trace
   * double-renders and the impact metrics inflate.
   */
  it('ignores a replayed activity emitting the same step', async () => {
    const payload = decision({ action: NetworkAction.QOD });

    const first = await service.record(payload);
    const second = await service.record(payload);

    expect(first).toEqual({ recorded: true, duplicate: false });
    expect(second).toEqual({ recorded: false, duplicate: true });
    expect(repository.appended).toEqual(['run-1:DECIDED']);
    expect(realtime.published).toHaveLength(1);
    expect(operations.patches).toHaveLength(1);
  });

  it('distinguishes different steps of the same run', async () => {
    await service.record(decision({ step: DecisionStep.CONGESTION_CHECKED }));
    await service.record(decision({ step: DecisionStep.DECIDED }));

    expect(repository.appended).toEqual(['run-1:CONGESTION_CHECKED', 'run-1:DECIDED']);
  });

  /**
   * A decision of NONE is terminal — nothing was allocated, so there is nothing
   * to monitor or release.
   */
  it('completes the operation immediately when the decision is NONE', async () => {
    await service.record(decision({ action: NetworkAction.NONE, criticality: Criticality.LOW }));

    const patch = operations.lastPatch();
    expect(patch?.status).toBe(OperationStatus.COMPLETED);
    expect(patch?.completedAt).toBeInstanceOf(Date);
  });

  it('keeps the operation in flight when connectivity was granted', async () => {
    await service.record(decision({ action: NetworkAction.QOD, criticality: Criticality.HIGH }));

    expect(operations.lastPatch()?.status).toBe(OperationStatus.ASSESSING);
    expect(operations.lastPatch()?.completedAt).toBeUndefined();
  });

  /** D8: the session only becomes real on AVAILABLE, not on REQUESTED. */
  it('moves to MONITORING only once QoD reports AVAILABLE', async () => {
    await service.record(
      decision({
        step: DecisionStep.QOS_STATUS_CHANGED,
        qosStatus: QosStatus.REQUESTED,
        qodSessionId: 'sess-1',
      }),
    );
    expect(operations.lastPatch()?.status).toBeUndefined();

    await service.record(
      decision({
        runId: 'run-2',
        step: DecisionStep.QOS_STATUS_CHANGED,
        qosStatus: QosStatus.AVAILABLE,
        qodSessionId: 'sess-1',
      }),
    );
    expect(operations.lastPatch()?.status).toBe(OperationStatus.MONITORING);
    expect(realtime.published.map((p) => p.event)).toContain(LIVE_EVENTS.QOD_STATUS_CHANGED);
  });

  it('marks the operation complete when connectivity is released', async () => {
    await service.record(decision({ step: DecisionStep.RELEASED }));

    const patch = operations.lastPatch();
    expect(patch?.status).toBe(OperationStatus.COMPLETED);
    expect(patch?.completedAt).toBeInstanceOf(Date);
  });

  /**
   * The agent's reasoning trace used to be dropped between the workflow and
   * the DTO. Once forwarded, it must actually reach the persisted record —
   * this is what makes it visible to a future dashboard.
   */
  it('persists the reasoning trace and tool calls, not just the verdict', async () => {
    await service.record(
      decision({
        step: DecisionStep.CRITICALITY_ASSESSED,
        criticality: Criticality.HIGH,
        graphTrace: ['classify(attempt=1, model=x) -> HIGH @ 0.99', 'validate(ok)'],
        toolCalls: [
          {
            name: 'retrieve_device_location',
            arguments: {},
            result: 'Device is at 26.15, 50.62.',
            failed: false,
          },
        ],
      }),
    );

    expect(repository.received[0]).toMatchObject({
      graphTrace: ['classify(attempt=1, model=x) -> HIGH @ 0.99', 'validate(ok)'],
      toolCalls: [
        expect.objectContaining({ name: 'retrieve_device_location', failed: false }),
      ],
    });
  });
});
