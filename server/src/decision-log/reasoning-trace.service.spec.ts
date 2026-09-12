import { Test } from '@nestjs/testing';

import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import { ReasoningTraceKind, type ReasoningTraceDto } from './dto/reasoning-trace.dto';
import { ReasoningTraceService } from './reasoning-trace.service';

class FakeRealtimePublisher extends RealtimePublisherPort {
  published: { organizationId: string; event: string; payload: unknown }[] = [];
  publish<T>(organizationId: string, event: string, payload: T): void {
    this.published.push({ organizationId, event, payload });
  }
  connectedClients(): number {
    return 0;
  }
  totalConnectedClients(): number {
    return 0;
  }
}

function trace(overrides: Partial<ReasoningTraceDto> = {}): ReasoningTraceDto {
  return {
    organizationId: 'org-1',
    operationId: 'evt-1',
    workflowId: 'operation-evt-1',
    runId: 'run-1',
    seq: 1,
    kind: ReasoningTraceKind.NODE_STARTED,
    node: 'classify',
    occurredAt: '2026-09-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('ReasoningTraceService', () => {
  let service: ReasoningTraceService;
  let realtime: FakeRealtimePublisher;

  beforeEach(async () => {
    realtime = new FakeRealtimePublisher();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReasoningTraceService,
        { provide: RealtimePublisherPort, useValue: realtime },
      ],
    }).compile();

    service = moduleRef.get(ReasoningTraceService);
  });

  it('pushes the event to the organization room and nowhere else', () => {
    const dto = trace({ kind: ReasoningTraceKind.TOOL_FINISHED, node: 'verify_device_location' });

    const result = service.publish(dto);

    expect(result).toEqual({ published: true });
    expect(realtime.published).toEqual([
      { organizationId: 'org-1', event: LIVE_EVENTS.REASONING_TRACE, payload: dto },
    ]);
  });

  it('does not deduplicate: a retried emit is the worker\'s problem, not ours', () => {
    // Unlike decisions, these events carry no idempotency key and are not
    // stored, so two identical posts are two pushes. The client orders and
    // dedupes on (runId, seq) itself.
    service.publish(trace());
    service.publish(trace());

    expect(realtime.published).toHaveLength(2);
  });
});
