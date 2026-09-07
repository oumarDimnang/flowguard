import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import { Connection, ConnectionStates } from 'mongoose';

import { Public } from '../auth/decorators/public.decorator';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { WorkflowOrchestratorPort } from '../temporal/ports/workflow-orchestrator.port';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    mongo: { up: boolean; state: string };
    temporal: { up: boolean };
    realtime: { up: boolean; connectedClients: number };
  };
}

/**
 * Hand-rolled rather than @nestjs/terminus: terminus has no release compatible
 * with NestJS 12 (its peer range stops at ^11), and the only non-trivial check
 * here is Temporal, which terminus has no indicator for anyway.
 *
 * Both dependency checks perform real work — a Mongo ready-state read and a
 * getSystemInfo RPC against Temporal — rather than reporting that an object was
 * constructed.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly orchestrator: WorkflowOrchestratorPort,
    private readonly realtime: RealtimePublisherPort,
  ) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const mongoUp = this.mongo.readyState === ConnectionStates.connected;
    const temporalUp = await this.orchestrator.isHealthy();

    const report: HealthReport = {
      status: mongoUp && temporalUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        mongo: { up: mongoUp, state: ConnectionStates[this.mongo.readyState] },
        temporal: { up: temporalUp },
        // Total, not per tenant: /health is an operational probe, and a
        // per-organization count here would be tenant data on a public route.
        realtime: { up: true, connectedClients: this.realtime.totalConnectedClients() },
      },
    };

    res
      .status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(report);
  }

  /** Liveness only — does not touch dependencies. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
