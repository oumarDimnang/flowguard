import { Controller, Get } from '@nestjs/common';

import { MetricsService, type ImpactMetrics } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Backs the dashboard metrics bar. */
  @Get()
  impact(): Promise<ImpactMetrics> {
    return this.metrics.impact();
  }
}
