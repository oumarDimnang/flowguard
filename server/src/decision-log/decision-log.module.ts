import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OperationsModule } from '../operations/operations.module';
import { MongoDecisionLogRepository } from './adapters/mongo-decision-log.repository';
import { DecisionLogController } from './decision-log.controller';
import { DecisionLogService } from './decision-log.service';
import { DecisionsController } from './decisions.controller';
import { DecisionLogRepository } from './ports/decision-log.repository';
import { ReasoningTraceController } from './reasoning-trace.controller';
import { ReasoningTraceService } from './reasoning-trace.service';
import { DecisionRecordEntity, DecisionRecordSchema } from './schemas/decision-record.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DecisionRecordEntity.name, schema: DecisionRecordSchema },
    ]),
    OperationsModule,
  ],
  controllers: [DecisionLogController, DecisionsController, ReasoningTraceController],
  providers: [
    DecisionLogService,
    ReasoningTraceService,
    { provide: DecisionLogRepository, useClass: MongoDecisionLogRepository },
  ],
  exports: [DecisionLogService],
})
export class DecisionLogModule {}
