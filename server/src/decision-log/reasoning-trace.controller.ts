import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { ReasoningTraceDto } from './dto/reasoning-trace.dto';
import { ReasoningTraceService } from './reasoning-trace.service';

/**
 * Inbound edge for the agent's live reasoning trace.
 *
 * Same trust boundary as /internal/decisions — the worker's bearer token — but
 * its own route, because these events are not decisions and must not be
 * mistaken for the audit trail in logs or in a future persistence change.
 *
 * 202 rather than 200: the server accepts the event and pushes it on; there
 * is nothing to report back, and the worker does not wait on the answer
 * beyond a short timeout.
 */
@Controller('internal/reasoning')
@Public()
@UseGuards(InternalTokenGuard)
export class ReasoningTraceController {
  constructor(private readonly trace: ReasoningTraceService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  record(@Body() dto: ReasoningTraceDto): { published: true } {
    return this.trace.publish(dto);
  }
}
