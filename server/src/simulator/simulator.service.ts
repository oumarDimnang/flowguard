import { Injectable, Logger, NotFoundException, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EventsService } from '../events/events.service';
import {
  SCENARIOS,
  findScenario,
  type Scenario,
  type ScenarioStep,
} from './scenarios/scenario.definitions';

export interface ScenarioRun {
  runId: string;
  scenarioId: string;
  scheduled: { operationId: string; atMs: number; operation: string }[];
}

/**
 * Business event simulator — the facility systems stand-in.
 *
 * This is the "input layer" of the architecture: it represents cranes, drones
 * and vehicles reporting what they are doing. In a real deployment it is
 * replaced by the facility's own systems calling POST /events, which is why it
 * goes through EventsService rather than reaching into the orchestrator.
 */
@Injectable()
export class SimulatorService implements OnApplicationShutdown {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly events: EventsService) {}

  list(): readonly Scenario[] {
    return SCENARIOS;
  }

  /**
   * Schedules a scenario and returns immediately.
   *
   * Returns the planned timeline rather than the results, because the point of
   * a scenario is that it unfolds over time — the dashboard watches it happen
   * over the WebSocket.
   */
  run(scenarioId: string): ScenarioRun {
    const scenario = findScenario(scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Unknown scenario '${scenarioId}'`);
    }

    // Each run needs fresh event IDs. Reusing them would trip the idempotency
    // guard (S7) and adopt the previous run's finished workflow instead of
    // starting a new one — which looks, on stage, like nothing happened.
    const runId = randomUUID().slice(0, 8);

    const scheduled = scenario.steps.map((step) => ({
      operationId: this.operationId(scenario.id, step, runId),
      atMs: step.atMs,
      operation: step.event.operation,
    }));

    scenario.steps.forEach((step) => this.schedule(scenario, step, runId));

    this.logger.log(`Scenario '${scenario.id}' scheduled (run ${runId})`);

    return { runId, scenarioId: scenario.id, scheduled };
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(scenario: Scenario, step: ScenarioStep, runId: string): void {
    const operationId = this.operationId(scenario.id, step, runId);

    this.defer(async () => {
      await this.events.accept({
        id: operationId,
        assetType: step.event.assetType,
        device: step.event.device,
        operation: step.event.operation,
        description: step.event.description,
        expectedDurationSeconds: step.event.expectedDurationSeconds,
        site: step.event.site,
        metadata: { ...step.event.metadata, scenarioId: scenario.id, scenarioRunId: runId },
        occurredAt: new Date().toISOString(),
      });

      if (step.completeAfterMs !== undefined) {
        this.defer(() => this.events.complete(operationId), step.completeAfterMs);
      }
    }, step.atMs);
  }

  /**
   * Timer that swallows its own errors.
   *
   * A scenario step failing must not produce an unhandled rejection that takes
   * the process down mid-demo — log it and let the rest of the scenario run.
   */
  private defer(action: () => Promise<unknown>, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void action().catch((err: Error) =>
        this.logger.error(`Scenario step failed: ${err.message}`, err.stack),
      );
    }, delayMs);

    this.timers.add(timer);
  }

  private operationId(scenarioId: string, step: ScenarioStep, runId: string): string {
    return `${scenarioId}-${step.event.key}-${runId}`;
  }
}
