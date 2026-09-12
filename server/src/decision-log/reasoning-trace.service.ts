import { Injectable } from '@nestjs/common';

import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import type { ReasoningTraceDto } from './dto/reasoning-trace.dto';

/**
 * The live reasoning channel: straight from the worker to the dashboard.
 *
 * Deliberately does nothing but publish. No repository, no projection onto the
 * operation, no idempotency key — the events are ephemeral by design, and the
 * one durable statement of the same reasoning is the CRITICALITY_ASSESSED
 * record that DecisionLogService writes when the graph finishes. Persisting
 * both would be two accounts of one judgement with no rule for which wins.
 *
 * Tenant-scoped like every other publish: the organization comes from the
 * payload because the worker authenticates with a machine token and has no
 * session to read one from.
 */
@Injectable()
export class ReasoningTraceService {
  constructor(private readonly realtime: RealtimePublisherPort) {}

  publish(dto: ReasoningTraceDto): { published: true } {
    this.realtime.publish(dto.organizationId, LIVE_EVENTS.REASONING_TRACE, dto);
    return { published: true };
  }
}
