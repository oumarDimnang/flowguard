import { Controller, Get, Param, Query } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';

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
  findActive(@OrgId() organizationId: string): Promise<Operation[]> {
    return this.operations.findActive(organizationId);
  }

  @Get()
  findAll(
    @OrgId() organizationId: string,
    @Query() pagination: PaginationDto,
  ): Promise<Paginated<Operation>> {
    return this.operations.findAll(organizationId, pagination);
  }

  @Get(':operationId')
  findOne(
    @OrgId() organizationId: string,
    @Param('operationId') operationId: string,
  ): Promise<Operation> {
    return this.operations.findOne(organizationId, operationId);
  }

  /**
   * Live execution state straight from Temporal, bypassing the read model.
   *
   * Useful when the projection and the workflow disagree — the workflow is
   * always right, and this endpoint is how you prove it during debugging.
   */
  @Get(':operationId/execution')
  async execution(
    @OrgId() organizationId: string,
    @Param('operationId') operationId: string,
  ) {
    // Resolve through the read model first. Without it, any operation id in
    // any tenant could be described straight out of Temporal.
    await this.operations.findOne(organizationId, operationId);

    const snapshot = await this.orchestrator.describeOperation(organizationId, operationId);
    return snapshot ?? { status: 'NOT_FOUND', operationId };
  }
}
