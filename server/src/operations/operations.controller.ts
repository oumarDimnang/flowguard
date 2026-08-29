import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Paginated } from '../common/dto/pagination.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { WorkflowOrchestratorPort } from '../temporal/ports/workflow-orchestrator.port';
import type { Operation } from './domain/operation';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly orchestrator: WorkflowOrchestratorPort,
  ) {}

  /** Dashboard's main view: everything currently in flight. */
  @Get('active')
  findActive(): Promise<Operation[]> {
    return this.operations.findActive();
  }

  @Get()
  findAll(@Query() pagination: PaginationDto): Promise<Paginated<Operation>> {
    return this.operations.findAll(pagination);
  }

  @Get(':operationId')
  findOne(@Param('operationId') operationId: string): Promise<Operation> {
    return this.operations.findOne(operationId);
  }

  /**
   * Live execution state straight from Temporal, bypassing the read model.
   *
   * Useful when the projection and the workflow disagree — the workflow is
   * always right, and this endpoint is how you prove it during debugging.
   */
  @Get(':operationId/execution')
  async execution(@Param('operationId') operationId: string) {
    const snapshot = await this.orchestrator.describeOperation(operationId);
    return snapshot ?? { status: 'NOT_FOUND', operationId };
  }
}
