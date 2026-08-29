import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoOperationRepository } from './adapters/mongo-operation.repository';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OperationRepository } from './ports/operation.repository';
import { OperationEntity, OperationSchema } from './schemas/operation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OperationEntity.name, schema: OperationSchema }]),
  ],
  controllers: [OperationsController],
  providers: [
    OperationsService,
    // Swapping datastores is this one line (S1).
    { provide: OperationRepository, useClass: MongoOperationRepository },
  ],
  exports: [OperationsService],
})
export class OperationsModule {}
