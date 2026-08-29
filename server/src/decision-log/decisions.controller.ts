import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { DecisionLogService, type RecordDecisionResult } from './decision-log.service';
import { RecordDecisionDto } from './dto/record-decision.dto';

/**
 * Inbound edge from the Python worker.
 *
 * Activities POST here at every workflow step. Deliberately separated from the
 * public read controller so the guard applies to writes only, and so the route
 * prefix makes the trust boundary obvious in logs.
 */
@Controller('internal/decisions')
@UseGuards(InternalTokenGuard)
export class DecisionsController {
  constructor(private readonly decisionLog: DecisionLogService) {}

  /**
   * Always 200, including for duplicates.
   *
   * A retried activity must not receive an error: Temporal would retry it
   * again, and the activity would never succeed. The response body reports
   * whether the write was new.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  record(@Body() dto: RecordDecisionDto): Promise<RecordDecisionResult> {
    return this.decisionLog.record(dto);
  }
}
