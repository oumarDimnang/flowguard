import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DecisionLogService } from '../decision-log/decision-log.service';
import { DecisionStep, type DecisionRecord } from '../decision-log/domain/decision-record';
import { EventsService } from '../events/events.service';
import type { CreateBusinessEventDto } from '../events/dto/create-business-event.dto';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { ContainerTerminalSystem } from './adapters/container-terminal/container-terminal.system';
import { DroneOperationsSystem } from './adapters/drone-operations/drone-operations.system';
import { JOB_QUEUED } from './domain/facility-job';

/**
 * No Mongo, no Temporal, no crane and no aircraft.
 *
 * The interesting property is that both industries are exercised against the
 * same expectations: the state machine, the gate and the release guarantee live
 * in the base, so a second adapter that got any of them wrong would fail here
 * rather than in production.
 */

const ORG = 'org-port';
const OTHER_ORG = 'org-aerial';

class FakeEventsService {
  accepted: CreateBusinessEventDto[] = [];
  acceptedOrgs: string[] = [];
  completed: string[] = [];

  async accept(organizationId: string, dto: CreateBusinessEventDto) {
    this.accepted.push(dto);
    this.acceptedOrgs.push(organizationId);
    return {
      operationId: dto.id,
      workflowId: `operation-${organizationId}-${dto.id}`,
      runId: 'run-1',
      alreadyRunning: false,
    };
  }

  async complete(_organizationId: string, operationId: string) {
    this.completed.push(operationId);
    return { operationId, signalled: true as const };
  }
}

class FakeDecisionLogService {
  records: DecisionRecord[] = [];

  async findByOperation(_organizationId: string, operationId: string): Promise<DecisionRecord[]> {
    return this.records.filter((r) => r.operationId === operationId);
  }
}

class FakeRealtimePublisher extends RealtimePublisherPort {
  published: { organizationId: string; event: string; payload: unknown }[] = [];

  publish<T>(organizationId: string, event: string, payload: T): void {
    this.published.push({ organizationId, event, payload });
  }

  connectedClients(): number {
    return 0;
  }

  totalConnectedClients(): number {
    return 0;
  }
}

const decidedFor = (operationId: string): DecisionRecord =>
  ({
    idempotencyKey: `${operationId}:DECIDED`,
    organizationId: ORG,
    operationId,
    workflowId: `operation-${operationId}`,
    runId: 'run-1',
    step: DecisionStep.DECIDED,
    occurredAt: new Date(),
    recordedAt: new Date(),
  }) as DecisionRecord;

/**
 * The same suite, run against both industries.
 *
 * Everything asserted here is behaviour the base owns, so this is really a test
 * of the seam: adding an industry must not require re-proving that aborting
 * releases, or that the gate always opens.
 */
describe.each([
  { name: 'container terminal', System: ContainerTerminalSystem, firstJob: 'move-1', gate: 'TWISTLOCK' },
  { name: 'drone operations', System: DroneOperationsSystem, firstJob: 'flight-1', gate: 'PREFLIGHT' },
])('$name', ({ System, firstJob, gate }) => {
  let system: InstanceType<typeof System>;
  let events: FakeEventsService;
  let decisions: FakeDecisionLogService;
  let realtime: FakeRealtimePublisher;

  beforeEach(async () => {
    events = new FakeEventsService();
    decisions = new FakeDecisionLogService();
    realtime = new FakeRealtimePublisher();

    const moduleRef = await Test.createTestingModule({
      providers: [
        System,
        { provide: EventsService, useValue: events },
        { provide: DecisionLogService, useValue: decisions },
        { provide: RealtimePublisherPort, useValue: realtime },
      ],
    }).compile();

    system = moduleRef.get(System);
  });

  afterEach(() => {
    // Jobs advance on timers; leaving them pending leaks into the next test.
    system.onApplicationShutdown();
  });

  it('starts with everything queued and nothing dispatched', () => {
    const jobs = system.listJobs(ORG);

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.state === JOB_QUEUED)).toBe(true);
    expect(events.accepted).toHaveLength(0);
  });

  it('issues a job instruction on dispatch and begins the sequence', async () => {
    const job = await system.dispatch(ORG, firstJob);

    expect(events.accepted).toHaveLength(1);
    expect(job.state).toBe(job.lifecycle[0]);
    expect(job.operationId).toBeDefined();
  });

  /**
   * S7: reusing an id would adopt the previous run's finished workflow, which
   * on stage is indistinguishable from nothing happening.
   */
  it('mints a fresh operation id per dispatch', async () => {
    const first = await system.dispatch(ORG, firstJob);
    system.reset(ORG);
    const second = await system.dispatch(ORG, firstJob);

    expect(second.operationId).not.toBe(first.operationId);
  });

  /**
   * The offline MockClassifier keys off these four, so the loop has to run with
   * no API key. Each industry maps its own vocabulary onto them — an inhabited
   * overflight is a drone's over-walkway — and losing that mapping silently
   * downgrades every classification in that industry.
   */
  it('derives the keys the offline classifier reads', async () => {
    await system.dispatch(ORG, firstJob);
    const metadata = events.accepted[0].metadata!;

    expect(metadata).toHaveProperty('hazard');
    expect(metadata).toHaveProperty('overWalkway');
    expect(metadata).toHaveProperty('deferrable');
    expect(metadata).toHaveProperty('loadTonnes');
  });

  it('refuses to dispatch a job that is already under way', async () => {
    await system.dispatch(ORG, firstJob);
    await expect(system.dispatch(ORG, firstJob)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown job', async () => {
    expect(() => system.getJob(ORG, 'nope')).toThrow(NotFoundException);
  });

  /**
   * The property that matters most: a job that ends badly still releases. An
   * abandoned job holding a QoD session is the exact failure FlowGuard exists
   * to prevent, so abort must not be a leak — in either industry.
   */
  it('signals completion when a job is aborted mid-sequence', async () => {
    const job = await system.dispatch(ORG, firstJob);
    await system.abort(ORG, firstJob);

    expect(job.state).toBe('ABORTED');
    expect(events.completed).toEqual([job.operationId]);
  });

  it('releases in-flight jobs when the plan is reset', async () => {
    const job = await system.dispatch(ORG, firstJob);
    system.reset(ORG);

    expect(events.completed).toEqual([job.operationId]);
    expect(system.listJobs(ORG).every((j) => j.state === JOB_QUEUED)).toBe(true);
  });

  /** Two tenants share one instance, so a single plan map would cross them. */
  it('gives each organization its own plan', async () => {
    await system.dispatch(ORG, firstJob);

    const theirs = system.listJobs(OTHER_ORG).find((j) => j.id === firstJob);
    expect(theirs?.state).toBe(JOB_QUEUED);
    expect(theirs?.operationId).toBeUndefined();
  });

  it('publishes only to the organization that owns the job', async () => {
    await system.dispatch(ORG, firstJob);

    expect(realtime.published.length).toBeGreaterThan(0);
    expect(realtime.published.every((p) => p.organizationId === ORG)).toBe(true);
  });

  describe('the gate', () => {
    afterEach(() => vi.useRealTimers());

    it('holds until a decision is recorded', async () => {
      vi.useFakeTimers();
      const job = await system.dispatch(ORG, firstJob);

      // Long enough for every timed state before the gate to elapse.
      await vi.advanceTimersByTimeAsync(15_000);
      expect(job.state).toBe(gate);

      decisions.records.push(decidedFor(job.operationId!));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(job.state).not.toBe(gate);
      expect(job.gateAuthorisedBy).toBe('DECISION');
    });

    /**
     * The safety property, in both industries. FlowGuard is advisory to the
     * interlock, never a precondition of it — a dead agent must delay work, not
     * prevent it. If this ever fails, FlowGuard has become able to stop a
     * facility.
     */
    it('proceeds anyway when no decision ever arrives', async () => {
      vi.useFakeTimers();
      const job = await system.dispatch(ORG, firstJob);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(job.state).not.toBe(gate);
      expect(job.gateAuthorisedBy).toBe('TIMEOUT');
    });

    it('runs the full sequence and reports completion', async () => {
      vi.useFakeTimers();
      const job = await system.dispatch(ORG, firstJob);
      decisions.records.push(decidedFor(job.operationId!));

      await vi.advanceTimersByTimeAsync(60_000);

      expect(job.state).toBe(job.lifecycle[job.lifecycle.length - 1]);
      expect(job.completedAt).toBeDefined();
      expect(events.completed).toEqual([job.operationId]);
    });
  });
});

/** The contrast pair, per industry — same asset, opposite criticality. */
describe('contrast pairs', () => {
  it('keeps the terminal pair on one crane', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContainerTerminalSystem,
        { provide: EventsService, useValue: new FakeEventsService() },
        { provide: DecisionLogService, useValue: new FakeDecisionLogService() },
        { provide: RealtimePublisherPort, useValue: new FakeRealtimePublisher() },
      ],
    }).compile();

    const system = moduleRef.get(ContainerTerminalSystem);
    const [a, b] = [system.getJob(ORG, 'move-1'), system.getJob(ORG, 'move-2')];

    expect(a.assetId).toBe(b.assetId);
    expect(a.devicePhoneNumber).toBe(b.devicePhoneNumber);
    system.onApplicationShutdown();
  });

  it('keeps the flight pair on one aircraft', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DroneOperationsSystem,
        { provide: EventsService, useValue: new FakeEventsService() },
        { provide: DecisionLogService, useValue: new FakeDecisionLogService() },
        { provide: RealtimePublisherPort, useValue: new FakeRealtimePublisher() },
      ],
    }).compile();

    const system = moduleRef.get(DroneOperationsSystem);
    const [a, b] = [system.getJob(ORG, 'flight-1'), system.getJob(ORG, 'flight-2')];

    expect(a.assetId).toBe(b.assetId);
    expect(a.devicePhoneNumber).toBe(b.devicePhoneNumber);
    system.onApplicationShutdown();
  });
});
