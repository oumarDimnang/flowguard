import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  CongestionLevel,
  Criticality,
  NetworkAction,
  QosStatus,
  QosStatusInfo,
} from '../../common/domain/enums';
import { DecisionStep, type NetworkCallTrace, type ToolCall } from '../domain/decision-record';

export type DecisionRecordDocument = HydratedDocument<DecisionRecordEntity>;

/**
 * Append-only audit trail.
 *
 * The heterogeneous payload is exactly why this project uses a document store:
 * a crane event, a congestion reading and a QoD session carry different shapes,
 * and each entry nests its full decision context in one document instead of
 * five joined tables.
 */
@Schema({ collection: 'decision_log', timestamps: { createdAt: 'recordedAt', updatedAt: false } })
export class DecisionRecordEntity {
  /** Unique index is the dedupe mechanism for retried activities. */
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  /** Tenant key. Indexed because every single read filters on it. */
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  operationId!: string;

  @Prop({ required: true })
  workflowId!: string;

  @Prop({ required: true })
  runId!: string;

  @Prop({ required: true, enum: Object.values(DecisionStep), index: true })
  step!: DecisionStep;

  @Prop({ enum: Object.values(Criticality) })
  criticality?: Criticality;

  @Prop()
  criticalityConfidence?: number;

  @Prop({ enum: Object.values(CongestionLevel) })
  congestion?: CongestionLevel;

  @Prop()
  deviceReachable?: boolean;

  @Prop({ enum: Object.values(NetworkAction), index: true })
  action?: NetworkAction;

  @Prop()
  reasoning?: string;

  @Prop({ type: [String] })
  graphTrace?: string[];

  @Prop({ type: [Object] })
  toolCalls?: ToolCall[];

  @Prop({ index: true })
  rule?: string;

  @Prop()
  modelId?: string;

  @Prop()
  qodSessionId?: string;

  @Prop({ enum: Object.values(QosStatus) })
  qosStatus?: QosStatus;

  @Prop({ enum: Object.values(QosStatusInfo) })
  qosStatusInfo?: QosStatusInfo;

  @Prop()
  sliceId?: string;

  @Prop({ type: Object })
  networkCall?: NetworkCallTrace;

  @Prop()
  error?: string;

  @Prop({ required: true })
  occurredAt!: Date;
}

export const DecisionRecordSchema = SchemaFactory.createForClass(DecisionRecordEntity);

// Replaying one operation's trail in order is the primary read pattern.
DecisionRecordSchema.index({ organizationId: 1, operationId: 1, occurredAt: 1 });
