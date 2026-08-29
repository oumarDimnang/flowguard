import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import type { Scenario } from './scenarios/scenario.definitions';
import { SimulatorService, type ScenarioRun } from './simulator.service';

/**
 * Stage controls. The dashboard's ScenarioControls panel drives these, so the
 * demo is a button press rather than a curl command typed under pressure.
 */
@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get('scenarios')
  list(): readonly Scenario[] {
    return this.simulator.list();
  }

  /** 202: the scenario unfolds over time; watch it on the WebSocket. */
  @Post('scenarios/:scenarioId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Param('scenarioId') scenarioId: string): ScenarioRun {
    return this.simulator.run(scenarioId);
  }
}
