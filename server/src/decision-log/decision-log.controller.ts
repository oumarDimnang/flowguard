import { Controller, Get, Param, Query } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';

import type { Paginated } from '../common/dto/pagination.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DecisionLogService } from './decision-log.service';
import type { DecisionRecord } from './domain/decision-record';

/**
 * Read side of the audit trail. Backs the decision-trace panel and the
 * "explainable decision trail" the submission promises.
 */
@Controller('decision-log')
export class DecisionLogController {
  constructor(private readonly decisionLog: DecisionLogService) {}

  @Get()
  findAll(
    @OrgId() organizationId: string,
    @Query() pagination: PaginationDto,
  ): Promise<Paginated<DecisionRecord>> {
    return this.decisionLog.findAll(organizationId, pagination);
  }

  /** Full trail for one operation, oldest first — the replay view. */
  @Get(':operationId')
  findByOperation(
    @OrgId() organizationId: string,
    @Param('operationId') operationId: string,
  ): Promise<DecisionRecord[]> {
    return this.decisionLog.findByOperation(organizationId, operationId);
  }
}
