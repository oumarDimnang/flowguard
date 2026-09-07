import { Controller, Get } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';

import { MetricsService, type ImpactMetrics } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Backs the dashboard metrics bar. */
  @Get()
  impact(@OrgId() organizationId: string): Promise<ImpactMetrics> {
    return this.metrics.impact(organizationId);
  }
}
