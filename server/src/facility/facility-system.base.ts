import { ConflictException, Logger, NotFoundException, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DecisionLogService } from '../decision-log/decision-log.service';
import { DecisionStep } from '../decision-log/domain/decision-record';
import { EventsService } from '../events/events.service';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import {
  GateAuthorisation,
  JOB_ABORTED,
  JOB_QUEUED,
  isJobInFlight,
  type FacilityJob,
  type JobEventShape,
} from './domain/facility-job';
import { FacilitySystemPort } from './ports/facility-system.port';

/** How long a gate waits for a decision before letting the job proceed anyway. */
const GATE_TIMEOUT_MS = 30_000;
const GATE_POLL_MS = 500;

/**
 * Everything a facility system does that is not specific to its industry.
 *
 * The lifecycle differs — a crane goes GANTRY → TROLLEY → SPREADER, a drone
 * goes PREFLIGHT → TAKEOFF → TRANSIT — but the machinery around it does not:
 * dispatch mints a correlation id and starts a workflow, states advance on
 * timers, one state holds for a decision, and every exit path releases what
 * the job was holding.
 *
 * That last part is why this is shared rather than copied. The release
 * guarantee is the product, and a second industry re-implementing it from
 * memory is exactly how one of them ends up leaking a paid session.
 *
 * Subclasses supply the vocabulary; this supplies the behaviour.
 */
export abstract class FacilitySystemBase
  extends FacilitySystemPort
  implements OnApplicationShutdown
{
  protected readonly logger = new Logger(this.constructor.name);

  /**
   * One plan per organization.
   *
   * A single shared map would hand every tenant the same jobs, so dispatching
   * in one would change what another saw. Seeded lazily, because the set of
   * tenants is not known when this service is built.
   */
  private readonly plans = new Map<string, Map<string, FacilityJob>>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly events: EventsService,
    private readonly decisions: DecisionLogService,
    private readonly realtime: RealtimePublisherPort,
  ) {
    super();
  }

  // ── What each industry must supply ──────────────────────────────────

  /** The ordered states, oldest first. The last is terminal. */
  protected abstract readonly lifecycle: readonly string[];

  /** Where the job pauses for a decision, if it pauses at all. */
  protected abstract readonly gateState: string | undefined;

  /** How long each state takes. The gate state is omitted — it is not timed. */
  protected abstract readonly durations: Readonly<Record<string, number>>;

  /** The plan this organization starts with. */
  protected abstract seedJobs(): FacilityJob[];

  /** How this industry files a job as a business event. */
  protected abstract toEvent(job: FacilityJob, operationId: string): JobEventShape;

  // ── Reads ───────────────────────────────────────────────────────────

  listJobs(organizationId: string): FacilityJob[] {
    return [...this.plan(organizationId).values()];
  }

  getJob(organizationId: string, jobId: string): FacilityJob {
    return this.require(organizationId, jobId);
  }

  // ── Writes ──────────────────────────────────────────────────────────

  /**
   * Issue the job instruction.
   *
   * FlowGuard's trigger point, and why the latency story holds: it fires at the
   * start of the sequence, so the assessment runs in the positioning window
   * rather than inside anybody's control loop.
   */
  async dispatch(organizationId: string, jobId: string): Promise<FacilityJob> {
    const job = this.require(organizationId, jobId);

    if (job.state !== JOB_QUEUED) {
      throw new ConflictException(`Job '${jobId}' is already ${job.state}`);
    }

    // Fresh correlation id per dispatch. Reusing one would trip the workflow-id
    // idempotency guard (S7) and adopt the previous run's finished execution,
    // which on stage looks exactly like nothing happening.
    const operationId = `${job.id}-${randomUUID().slice(0, 8)}`;
    const shape = this.toEvent(job, operationId);

    const accepted = await this.events.accept(organizationId, {
      id: operationId,
      assetType: shape.assetType,
      device: { id: job.assetId, phoneNumber: job.devicePhoneNumber },
      operation: shape.operation,
      description: job.summary,
      expectedDurationSeconds: job.expectedDurationSeconds,
      site: shape.site,
      metadata: shape.metadata,
      occurredAt: new Date().toISOString(),
    });

    job.operationId = operationId;
    job.workflowId = accepted.workflowId;
    job.dispatchedAt = new Date();

    this.logger.log(`Job instruction '${operationId}' issued to ${job.assetId}`);
    this.transition(organizationId, job, this.lifecycle[0]);

    return job;
  }

  /**
   * Cancel a job under way.
   *
   * Still signals completion, because an abandoned job that keeps holding a QoD
   * session is precisely the failure this system exists to prevent.
   */
  async abort(organizationId: string, jobId: string): Promise<FacilityJob> {
    const job = this.require(organizationId, jobId);

    if (!isJobInFlight(job)) {
      throw new ConflictException(`Job '${jobId}' is ${job.state} and cannot be aborted`);
    }

    this.logger.warn(`Job '${jobId}' aborted during ${job.state}`);
    this.transition(organizationId, job, JOB_ABORTED);

    return job;
  }

  reset(organizationId: string): FacilityJob[] {
    for (const job of this.plan(organizationId).values()) {
      if (isJobInFlight(job)) void this.signalComplete(organizationId, job);
    }

    // Timers are not cleared: they are shared across tenants, and cancelling
    // them all would freeze another organization mid-sequence. Replacing the
    // plan is enough — each pending transition still holds the old job object,
    // which is no longer reachable from any plan.
    this.plans.delete(organizationId);
    const restored = this.listJobs(organizationId);

    this.realtime.publish(organizationId, LIVE_EVENTS.FACILITY_PLAN_RESET, restored);
    return restored;
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  // ── Internals ───────────────────────────────────────────────────────

  private plan(organizationId: string): Map<string, FacilityJob> {
    const existing = this.plans.get(organizationId);
    if (existing) return existing;

    const seeded = new Map(this.seedJobs().map((job) => [job.id, job]));
    this.plans.set(organizationId, seeded);
    return seeded;
  }

  private require(organizationId: string, jobId: string): FacilityJob {
    const job = this.plan(organizationId).get(jobId);
    if (!job) {
      throw new NotFoundException(`Unknown job '${jobId}'`);
    }
    return job;
  }

  private transition(organizationId: string, job: FacilityJob, state: string): void {
    job.state = state;

    const finished = this.lifecycle[this.lifecycle.length - 1];
    if (state === finished || state === JOB_ABORTED) {
      job.completedAt = new Date();
    }

    this.realtime.publish(organizationId, LIVE_EVENTS.FACILITY_JOB_UPDATED, { ...job });

    if (state === this.gateState) {
      this.holdAtGate(organizationId, job);
      return;
    }

    if (state === finished || state === JOB_ABORTED) {
      void this.signalComplete(organizationId, job);
      return;
    }

    const next = this.lifecycle[this.lifecycle.indexOf(state) + 1];
    const delay = this.durations[state];
    if (next !== undefined && delay !== undefined) {
      this.defer(async () => this.transition(organizationId, job, next), delay);
    }
  }

  /**
   * The gate.
   *
   * A crane PLC will not authorise a hoist until four twistlock sensors
   * confirm; a drone will not launch until pre-flight passes. Either way it is
   * the last instant at which the job can wait for anything, so it is where it
   * waits for FlowGuard.
   *
   * It pauses; it does not depend. The deadline always fires, so an agent that
   * is down, slow or unreachable delays work by at most the hold and can never
   * prevent it.
   */
  private holdAtGate(organizationId: string, job: FacilityJob): void {
    const deadline = Date.now() + GATE_TIMEOUT_MS;

    const poll = async (): Promise<void> => {
      // Aborted or reset while holding — abandon the gate.
      if (job.state !== this.gateState) return;

      if (await this.hasDecision(organizationId, job)) {
        this.openGate(organizationId, job, GateAuthorisation.DECISION);
        return;
      }

      if (Date.now() >= deadline) {
        this.logger.warn(
          `Gate opened for '${job.id}' with no decision recorded — proceeding unprotected`,
        );
        this.openGate(organizationId, job, GateAuthorisation.TIMEOUT);
        return;
      }

      this.defer(poll, GATE_POLL_MS);
    };

    void poll();
  }

  private async hasDecision(organizationId: string, job: FacilityJob): Promise<boolean> {
    if (!job.operationId) return false;

    const records = await this.decisions.findByOperation(organizationId, job.operationId);
    return records.some((record) => record.step === DecisionStep.DECIDED);
  }

  private openGate(organizationId: string, job: FacilityJob, by: GateAuthorisation): void {
    job.gateAuthorisedAt = new Date();
    job.gateAuthorisedBy = by;

    const next = this.lifecycle[this.lifecycle.indexOf(job.state) + 1];
    if (next) this.transition(organizationId, job, next);
  }

  /** Tell FlowGuard the operation is over, so connectivity goes back. */
  private async signalComplete(organizationId: string, job: FacilityJob): Promise<void> {
    if (!job.operationId) return;

    try {
      await this.events.complete(organizationId, job.operationId);
    } catch (err) {
      // The workflow may already have closed — its own duration TTL expired, or
      // completion was signalled elsewhere. Releasing twice is not worth failing
      // a job over, and the workflow's finally block is the real guarantee.
      this.logger.warn(
        `Completion signal for '${job.operationId}' failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Timer that swallows its own errors.
   *
   * A failed step must not produce an unhandled rejection that takes the
   * process down mid-demo — log it and let the rest of the job run.
   */
  private defer(action: () => Promise<unknown>, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void action().catch((err: Error) =>
        this.logger.error(`Job step failed: ${err.message}`, err.stack),
      );
    }, delayMs);

    this.timers.add(timer);
  }
}
