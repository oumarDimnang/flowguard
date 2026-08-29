import { Controller, Get, Param, Query } from '@nestjs/common';

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
  findAll(@Query() pagination: PaginationDto): Promise<Paginated<DecisionRecord>> {
    return this.decisionLog.findAll(pagination);
  }

  /** Full trail for one operation, oldest first — the replay view. */
  @Get(':operationId')
  findByOperation(@Param('operationId') operationId: string): Promise<DecisionRecord[]> {
    return this.decisionLog.findByOperation(operationId);
  }
}
