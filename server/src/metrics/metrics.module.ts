import { Module } from '@nestjs/common';

import { DecisionLogModule } from '../decision-log/decision-log.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [DecisionLogModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
