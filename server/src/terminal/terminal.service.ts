import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AssetType } from '../common/domain/enums';
import { DecisionLogService } from '../decision-log/decision-log.service';
import { DecisionStep } from '../decision-log/domain/decision-record';
import { EventsService } from '../events/events.service';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import { BERTH, WORK_QUEUE } from './berth.definitions';
import { HoistAuthorisation, MoveState, type ContainerMove } from './domain/container-move';

/**
 * The crane's physical sequence, in order.
 *
 * TWISTLOCK carries no duration because it is gated rather than timed — see
 * holdForHoistAuthorisation.
 */
const SEQUENCE: readonly MoveState[] = [
  MoveState.GANTRY,
  MoveState.TROLLEY,
  MoveState.SPREADER,
  MoveState.TWISTLOCK,
  MoveState.HOISTING,
  MoveState.LANDING,
  MoveState.RELEASED,
];

/**
 * Compressed for the demo. A real container move runs 90-180 seconds; what has
 * to be faithful is the *shape* — that several seconds of positioning precede
 * the interlock, because that window is where FlowGuard actually works.
 */
const STATE_DURATIONS_MS: Partial<Record<MoveState, number>> = {
  [MoveState.GANTRY]: 4_000,
  [MoveState.TROLLEY]: 3_000,
  [MoveState.SPREADER]: 3_000,
  [MoveState.HOISTING]: 8_000,
  [MoveState.LANDING]: 4_000,
};

/** How long the interlock waits for a decision before lifting anyway. */
const HOIST_HOLD_TIMEOUT_MS = 30_000;
const HOIST_HOLD_POLL_MS = 500;

/** States in which a move is under way and may be holding paid connectivity. */
function isInFlight(state: MoveState): boolean {
  return state !== MoveState.QUEUED && state !== MoveState.RELEASED && state !== MoveState.ABORTED;
}

/**
 * TOS attributes as business-event metadata.
 *
 * Two vocabularies deliberately coexist. The TIC4.0-aligned names are what a
 * real terminal emits and what the model reasons over. The four derived keys at
 * the bottom are what the offline MockClassifier keys off
 * (agent/src/flowguard_agent/llm/client.py), so the whole loop still runs with
 * no API key. A production integration would map TOS fields inside the agent
 * and drop the derived set.
 *
 * Everything rides inside `metadata` rather than as top-level fields, because
 * the server's ValidationPipe runs with forbidNonWhitelisted: a new top-level
 * field would be a 400, whereas metadata is an open record by design.
 */
function toEventMetadata(move: ContainerMove, jobInstructionId: string): Record<string, unknown> {
  const { container } = move;

  return {
    jobInstructionId,
    moveId: move.id,
    craneId: move.craneId,
    berthId: BERTH.id,
    vessel: BERTH.vessel,
    fromLocation: move.fromLocation,
    toLocation: move.toLocation,

    containerId: container.containerId,
    grossWeightKg: container.grossWeightKg,
    imdgClass: container.imdgClass,
    reefer: container.reefer ?? false,
    twinLift: container.twinLift ?? false,

    // Derived for the offline classifier.
    hazard: container.imdgClass !== undefined,
    loadTonnes: Math.round(container.grossWeightKg / 100) / 10,
    overWalkway: container.overWalkway,
    deferrable: move.deferrable ?? false,
  };
}

/**
 * A stand-in Terminal Operating System.
 *
 * This is the facility system FlowGuard integrates with — the thing a real
 * deployment replaces with Navis N4 issuing job instructions over OPC-UA to the
 * equipment control layer. It is deliberately limited to the two verbs a TOS
 * actually needs: dispatch a job, and report that the job finished.
 *
 * It cannot choose a workflow, and that is structural rather than a matter of
 * discipline: WorkflowOrchestratorPort.startOperation takes a BusinessEvent and
 * no workflow type, so nothing above src/temporal/ can name one. The terminal
 * reports what is happening; FlowGuard decides what to run about it — the same
 * split as the agent's read-only toolbox.
 *
 * State is in memory on purpose. A work queue here is not a system of record,
 * it is a facility stand-in, and it should reset cleanly between demo runs.
 */
@Injectable()
export class TerminalService implements OnApplicationShutdown {
  private readonly logger = new Logger(TerminalService.name);
  private readonly moves = new Map<string, ContainerMove>();
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly events: EventsService,
    private readonly decisions: DecisionLogService,
    private readonly realtime: RealtimePublisherPort,
  ) {
    this.seed();
  }

  berth(): typeof BERTH {
    return BERTH;
  }

  list(): ContainerMove[] {
    return [...this.moves.values()];
  }

  get(moveId: string): ContainerMove {
    return this.require(moveId);
  }

  /**
   * Issue the job instruction.
   *
   * This is FlowGuard's trigger point, and it is why the integration story
   * holds: it fires before the spreader is even down, so the assessment runs in
   * the positioning window rather than inside the control loop. The agent never
   * goes near the crane's ~200ms glass-to-glass budget.
   */
  async dispatch(moveId: string): Promise<ContainerMove> {
    const move = this.require(moveId);

    if (move.state !== MoveState.QUEUED) {
      throw new ConflictException(`Move '${moveId}' is already ${move.state}`);
    }

    // Fresh correlation id per dispatch. Reusing one would trip the workflow-id
    // idempotency guard (S7) and adopt the previous run's finished execution,
    // which on stage looks exactly like nothing happening.
    const operationId = `${move.id}-${randomUUID().slice(0, 8)}`;

    const accepted = await this.events.accept({
      id: operationId,
      assetType: AssetType.CRANE,
      device: { id: move.craneId, phoneNumber: move.devicePhoneNumber },
      operation: `Move container ${move.container.containerId}`,
      description: move.summary,
      expectedDurationSeconds: move.expectedDurationSeconds,
      site: `${BERTH.name} — ${move.fromLocation}`,
      metadata: toEventMetadata(move, operationId),
      occurredAt: new Date().toISOString(),
    });

    move.operationId = operationId;
    move.workflowId = accepted.workflowId;
    move.dispatchedAt = new Date();

    this.logger.log(`Job instruction '${operationId}' issued to ${move.craneId}`);
    this.transition(move, MoveState.GANTRY);

    return move;
  }

  /**
   * Cancel a move that is under way.
   *
   * An abort still signals completion, because an abandoned move that keeps
   * holding a QoD session is precisely the failure this system exists to
   * prevent.
   */
  async abort(moveId: string): Promise<ContainerMove> {
    const move = this.require(moveId);

    if (!isInFlight(move.state)) {
      throw new ConflictException(`Move '${moveId}' is ${move.state} and cannot be aborted`);
    }

    this.logger.warn(`Move '${moveId}' aborted during ${move.state}`);
    this.transition(move, MoveState.ABORTED);

    return move;
  }

  /** Return the berth to its planned state so the demo can be run again. */
  reset(): ContainerMove[] {
    this.clearTimers();

    // Anything still in flight is holding connectivity. Releasing it here is
    // the same discipline the workflow's finally block enforces: the demo must
    // never be the thing that strands a paid session.
    for (const move of this.moves.values()) {
      if (isInFlight(move.state)) void this.signalComplete(move);
    }

    this.seed();
    this.realtime.publish(LIVE_EVENTS.TERMINAL_QUEUE_RESET, this.list());

    return this.list();
  }

  onApplicationShutdown(): void {
    this.clearTimers();
  }

  // ── internals ───────────────────────────────────────────────────────

  private seed(): void {
    this.moves.clear();

    for (const definition of WORK_QUEUE) {
      this.moves.set(definition.id, {
        ...definition,
        container: { ...definition.container },
        state: MoveState.QUEUED,
      });
    }
  }

  private require(moveId: string): ContainerMove {
    const move = this.moves.get(moveId);
    if (!move) {
      throw new NotFoundException(`Unknown move '${moveId}'`);
    }
    return move;
  }

  private transition(move: ContainerMove, state: MoveState): void {
    move.state = state;

    if (state === MoveState.RELEASED || state === MoveState.ABORTED) {
      move.completedAt = new Date();
    }

    this.realtime.publish(LIVE_EVENTS.TERMINAL_MOVE_UPDATED, { ...move });

    switch (state) {
      case MoveState.TWISTLOCK:
        this.holdForHoistAuthorisation(move);
        return;

      case MoveState.RELEASED:
      case MoveState.ABORTED:
        void this.signalComplete(move);
        return;

      default: {
        const next = SEQUENCE[SEQUENCE.indexOf(state) + 1];
        const delay = STATE_DURATIONS_MS[state];
        if (next !== undefined && delay !== undefined) {
          this.defer(async () => this.transition(move, next), delay);
        }
      }
    }
  }

  /**
   * The interlock.
   *
   * A crane PLC will not authorise a hoist until all four twistlock sensors
   * confirm a secure lock, which makes this the last instant at which the move
   * can wait for anything at all. So it is where the move pauses for
   * FlowGuard's decision.
   *
   * It pauses; it does not depend. The deadline always fires, so an agent that
   * is down, slow or unreachable delays a lift by at most the hold and can
   * never prevent one. A connectivity optimiser that can stop a terminal is a
   * worse problem than the one it solves.
   */
  private holdForHoistAuthorisation(move: ContainerMove): void {
    const deadline = Date.now() + HOIST_HOLD_TIMEOUT_MS;

    const poll = async (): Promise<void> => {
      // Aborted or reset while holding — abandon the gate.
      if (move.state !== MoveState.TWISTLOCK) return;

      if (await this.hasDecision(move)) {
        this.authoriseHoist(move, HoistAuthorisation.DECISION);
        return;
      }

      if (Date.now() >= deadline) {
        this.logger.warn(
          `Hoist authorised for '${move.id}' with no decision recorded — lifting unprotected`,
        );
        this.authoriseHoist(move, HoistAuthorisation.TIMEOUT);
        return;
      }

      this.defer(poll, HOIST_HOLD_POLL_MS);
    };

    void poll();
  }

  private async hasDecision(move: ContainerMove): Promise<boolean> {
    if (!move.operationId) return false;

    const records = await this.decisions.findByOperation(move.operationId);
    return records.some((record) => record.step === DecisionStep.DECIDED);
  }

  private authoriseHoist(move: ContainerMove, by: HoistAuthorisation): void {
    move.hoistAuthorisedAt = new Date();
    move.hoistAuthorisedBy = by;
    this.transition(move, MoveState.HOISTING);
  }

  /** Tell FlowGuard the operation is over, so connectivity goes back. */
  private async signalComplete(move: ContainerMove): Promise<void> {
    if (!move.operationId) return;

    try {
      await this.events.complete(move.operationId);
    } catch (err) {
      // The workflow may already have closed — its own duration TTL expired, or
      // completion was signalled elsewhere. Releasing twice is not worth failing
      // a move over, and the workflow's finally block is the real guarantee.
      this.logger.warn(
        `Completion signal for '${move.operationId}' failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Timer that swallows its own errors.
   *
   * A failed step must not produce an unhandled rejection that takes the process
   * down mid-demo — log it and let the rest of the move run.
   */
  private defer(action: () => Promise<unknown>, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void action().catch((err: Error) =>
        this.logger.error(`Move step failed: ${err.message}`, err.stack),
      );
    }, delayMs);

    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
