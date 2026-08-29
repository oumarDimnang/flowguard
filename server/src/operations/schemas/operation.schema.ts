import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  AssetType,
  CongestionLevel,
  Criticality,
  NetworkAction,
  OperationStatus,
  QosStatus,
} from '../../common/domain/enums';

export type OperationDocument = HydratedDocument<OperationEntity>;

/**
 * Persistence shape for the operations read model.
 *
 * Kept separate from the Operation domain type (S3) so Mongoose decorators
 * never leak into the service layer — that separation is what lets services be
 * unit-tested with an in-memory fake repository and no database running.
 */
@Schema({ collection: 'operations', timestamps: true })
export class OperationEntity {
  @Prop({ required: true, unique: true, index: true })
  operationId!: string;

  @Prop({ required: true })
  workflowId!: string;

  @Prop()
  runId?: string;

  @Prop({ required: true, enum: Object.values(AssetType) })
  assetType!: AssetType;

  @Prop({ required: true, index: true })
  deviceId!: string;

  @Prop({ required: true })
  operationName!: string;

  @Prop()
  site?: string;

  @Prop({
    required: true,
    enum: Object.values(OperationStatus),
    default: OperationStatus.PENDING,
    index: true,
  })
  status!: OperationStatus;

  @Prop({ enum: Object.values(Criticality) })
  criticality?: Criticality;

  @Prop({ enum: Object.values(CongestionLevel) })
  congestion?: CongestionLevel;

  @Prop()
  deviceReachable?: boolean;

  @Prop({ enum: Object.values(NetworkAction) })
  action?: NetworkAction;

  @Prop()
  reasoning?: string;

  @Prop()
  qodSessionId?: string;

  @Prop({ enum: Object.values(QosStatus) })
  qosStatus?: QosStatus;

  @Prop()
  sliceId?: string;

  @Prop({ required: true, default: () => new Date() })
  startedAt!: Date;

  @Prop()
  completedAt?: Date;
}

export const OperationSchema = SchemaFactory.createForClass(OperationEntity);

// The dashboard's primary query is "active operations, newest first".
OperationSchema.index({ status: 1, startedAt: -1 });
