import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DecisionLogService } from '../decision-log/decision-log.service';
import { DecisionStep, type DecisionRecord } from '../decision-log/domain/decision-record';
import { EventsService } from '../events/events.service';
import type { CreateBusinessEventDto } from '../events/dto/create-business-event.dto';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { MoveState } from './domain/container-move';
import { TerminalService } from './terminal.service';

/**
 * No Mongo, no Temporal, no crane. The TOS depends on two services and one
 * abstract port, so plain fakes satisfy the whole contract (S1, S3).
 */

class FakeEventsService {
  accepted: CreateBusinessEventDto[] = [];
  completed: string[] = [];

  async accept(dto: CreateBusinessEventDto) {
    this.accepted.push(dto);
    return {
      operationId: dto.id,
      workflowId: `operation-${dto.id}`,
      runId: 'run-1',
      alreadyRunning: false,
    };
  }

  async complete(operationId: string) {
    this.completed.push(operationId);
    return { operationId, signalled: true as const };
  }
}

class FakeDecisionLogService {
  records: DecisionRecord[] = [];

  async findByOperation(operationId: string): Promise<DecisionRecord[]> {
    return this.records.filter((r) => r.operationId === operationId);
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

describe('TerminalService', () => {
  let service: TerminalService;
  let events: FakeEventsService;
  let decisions: FakeDecisionLogService;
  let realtime: FakeRealtimePublisher;

  beforeEach(async () => {
    events = new FakeEventsService();
    decisions = new FakeDecisionLogService();
    realtime = new FakeRealtimePublisher();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TerminalService,
        { provide: EventsService, useValue: events },
        { provide: DecisionLogService, useValue: decisions },
        { provide: RealtimePublisherPort, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(TerminalService);
  });

  afterEach(() => {
    // Moves advance on timers; leaving them pending leaks into the next test.
    service.onApplicationShutdown();
  });

  it('starts with the berth plan queued and nothing dispatched', () => {
    const moves = service.list();

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.state === MoveState.QUEUED)).toBe(true);
    expect(events.accepted).toHaveLength(0);
  });

  it('issues a job instruction on dispatch and begins the sequence', async () => {
    const move = await service.dispatch('move-2');

    expect(events.accepted).toHaveLength(1);
    expect(move.state).toBe(MoveState.GANTRY);
    expect(move.operationId).toBeDefined();
    expect(move.workflowId).toBe(`operation-${move.operationId}`);
  });

  /**
   * S7: reusing an id would adopt the previous run's finished workflow, which
   * on stage is indistinguishable from nothing happening.
   */
  it('mints a fresh operation id per dispatch', async () => {
    const first = await service.dispatch('move-1');
    service.reset();
    const second = await service.dispatch('move-1');

    expect(second.operationId).not.toBe(first.operationId);
    expect(second.operationId).toMatch(/^move-1-/);
  });

  it('carries TOS attributes into the event metadata', async () => {
    await service.dispatch('move-2');
    const metadata = events.accepted[0].metadata!;

    expect(metadata).toMatchObject({
      moveId: 'move-2',
      craneId: 'crane-a',
      containerId: 'MAEU7391024',
      grossWeightKg: 40_100,
      imdgClass: '3',
      overWalkway: true,
    });
    expect(metadata.jobInstructionId).toBe(events.accepted[0].id);
  });

  /**
   * The offline MockClassifier keys off these four, so the loop has to run
   * with no API key. Losing them silently downgrades every classification.
   */
  it('derives the keys the offline classifier reads', async () => {
    await service.dispatch('move-2');
    expect(events.accepted[0].metadata).toMatchObject({
      hazard: true,
      loadTonnes: 40.1,
      overWalkway: true,
      deferrable: false,
    });

    service.reset();

    await service.dispatch('move-1');
    expect(events.accepted[1].metadata).toMatchObject({
      hazard: false,
      loadTonnes: 2.3,
      overWalkway: false,
      deferrable: true,
    });
  });

  it('refuses to dispatch a move that is already under way', async () => {
    await service.dispatch('move-1');
    await expect(service.dispatch('move-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown move', async () => {
    expect(() => service.get('move-nope')).toThrow(NotFoundException);
    await expect(service.dispatch('move-nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * The property that matters most: a move that ends badly still releases.
   * An abandoned move holding a QoD session is the exact failure FlowGuard
   * exists to prevent, so abort must not be a leak.
   */
  it('signals completion when a move is aborted mid-sequence', async () => {
    const move = await service.dispatch('move-2');
    await service.abort('move-2');

    expect(move.state).toBe(MoveState.ABORTED);
    expect(events.completed).toEqual([move.operationId]);
  });

  it('refuses to abort a move that never started', async () => {
    await expect(service.abort('move-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases in-flight moves when the berth is reset', async () => {
    const move = await service.dispatch('move-2');
    service.reset();

    expect(events.completed).toEqual([move.operationId]);
    expect(service.list().every((m) => m.state === MoveState.QUEUED)).toBe(true);
  });

  it('publishes every state change to the dashboard', async () => {
    await service.dispatch('move-1');

    const moveEvents = realtime.published.filter((p) => p.event === 'terminal.move_updated');
    expect(moveEvents).toHaveLength(1);
  });

  /**
   * move-1 and move-2 run on the same crane and the same SIM. That is the
   * contrast pair — identical device and cell, opposite criticality — so if
   * they ever drift apart the demo stops proving anything.
   */
  it('keeps the contrast pair on one device', () => {
    const [first, second] = [service.get('move-1'), service.get('move-2')];

    expect(first.craneId).toBe(second.craneId);
    expect(first.devicePhoneNumber).toBe(second.devicePhoneNumber);
    expect(first.container.overWalkway).toBe(false);
    expect(second.container.overWalkway).toBe(true);
  });

  /**
   * Driven on fake timers: the sequence is ~22 seconds of wall clock, and a
   * test suite should not wait for a crane.
   */
  describe('hoist interlock', () => {
    const decidedFor = (operationId: string): DecisionRecord =>
      ({
        idempotencyKey: `${operationId}:DECIDED`,
        operationId,
        workflowId: `operation-${operationId}`,
        runId: 'run-1',
        step: DecisionStep.DECIDED,
        occurredAt: new Date(),
        recordedAt: new Date(),
      }) as DecisionRecord;

    afterEach(() => vi.useRealTimers());

    it('holds at the twistlocks until a decision is recorded', async () => {
      vi.useFakeTimers();
      const move = await service.dispatch('move-2');

      // Positioning completes, but nothing has decided yet.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(move.state).toBe(MoveState.TWISTLOCK);

      decisions.records.push(decidedFor(move.operationId!));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(move.state).toBe(MoveState.HOISTING);
      expect(move.hoistAuthorisedBy).toBe('DECISION');
    });

    /**
     * The safety property. FlowGuard is advisory to the interlock, never a
     * precondition of it — a dead agent must delay a lift, not prevent one.
     * If this test ever fails, FlowGuard has become able to stop a terminal.
     */
    it('lifts anyway when no decision ever arrives', async () => {
      vi.useFakeTimers();
      const move = await service.dispatch('move-2');

      await vi.advanceTimersByTimeAsync(45_000);

      expect(move.state).not.toBe(MoveState.TWISTLOCK);
      expect(move.hoistAuthorisedBy).toBe('TIMEOUT');
    });

    it('runs the full sequence and reports completion', async () => {
      vi.useFakeTimers();
      const move = await service.dispatch('move-2');
      decisions.records.push(decidedFor(move.operationId!));

      await vi.advanceTimersByTimeAsync(30_000);

      expect(move.state).toBe(MoveState.RELEASED);
      expect(move.completedAt).toBeDefined();
      expect(events.completed).toEqual([move.operationId]);
    });
  });
});
