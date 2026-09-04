import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CongestionLevel, Criticality, NetworkAction } from '../../common/domain/enums';
import type { Paginated, PaginationDto } from '../../common/dto/pagination.dto';
import { DecisionStep, type DecisionRecord } from '../domain/decision-record';
import {
  type AppendResult,
  type DecisionCounts,
  DecisionLogRepository,
} from '../ports/decision-log.repository';
import { DecisionRecordDocument, DecisionRecordEntity } from '../schemas/decision-record.schema';

/** Mongo duplicate-key error. */
const DUPLICATE_KEY = 11000;

@Injectable()
export class MongoDecisionLogRepository extends DecisionLogRepository {
  constructor(
    @InjectModel(DecisionRecordEntity.name)
    private readonly model: Model<DecisionRecordDocument>,
  ) {
    super();
  }

  async append(record: Omit<DecisionRecord, 'recordedAt'>): Promise<AppendResult> {
    try {
      const created = await this.model.create(record);
      return { record: this.toDomain(created.toObject() as DecisionRecordEntity), inserted: true };
    } catch (err) {
      // A retried activity re-emitting the same step. Return the record that is
      // already there rather than failing the activity, which would make
      // Temporal retry it again — forever.
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        const existing = await this.model
          .findOne({ idempotencyKey: record.idempotencyKey })
          .lean()
          .exec();

        return {
          record: this.toDomain(existing as DecisionRecordEntity),
          inserted: false,
        };
      }
      throw err;
    }
  }

  async findByOperation(operationId: string): Promise<DecisionRecord[]> {
    const docs = await this.model.find({ operationId }).sort({ occurredAt: 1 }).lean().exec();
    return docs.map((d) => this.toDomain(d as DecisionRecordEntity));
  }

  async findAll(pagination: PaginationDto): Promise<Paginated<DecisionRecord>> {
    const { skip, limit } = pagination;

    const [docs, total] = await Promise.all([
      this.model.find().sort({ occurredAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments().exec(),
    ]);

    return {
      items: docs.map((d) => this.toDomain(d as DecisionRecordEntity)),
      total,
      skip,
      limit,
    };
  }

  async counts(): Promise<DecisionCounts> {
    // Only DECIDED records count — earlier steps would double-count an
    // operation that passed through several stages.
    const decided = { step: DecisionStep.DECIDED };

    // Congestion at or above the allocation threshold. A HIGH-criticality
    // operation below this was never at risk, so it belongs in neither side of
    // the protection ratio.
    const atRisk = { congestion: { $in: [CongestionLevel.MEDIUM, CongestionLevel.HIGH] } };

    const [
      byActionRows,
      byCriticalityRows,
      criticalProtected,
      criticalUnprotected,
      avoided,
      criticalNotAtRisk,
    ] = await Promise.all([
        this.model
          .aggregate<{ _id: string | null; count: number }>([
            { $match: decided },
            { $group: { _id: '$action', count: { $sum: 1 } } },
          ])
          .exec(),
        this.model
          .aggregate<{ _id: string | null; count: number }>([
            { $match: decided },
            { $group: { _id: '$criticality', count: { $sum: 1 } } },
          ])
          .exec(),
        this.model
          .countDocuments({
            ...decided,
            ...atRisk,
            criticality: Criticality.HIGH,
            action: { $in: [NetworkAction.QOD, NetworkAction.QOD_AND_SLICE] },
          })
          .exec(),
        this.model
          .countDocuments({
            ...decided,
            ...atRisk,
            criticality: Criticality.HIGH,
            action: NetworkAction.NONE,
          })
          .exec(),
        this.model
          .countDocuments({ ...decided, criticality: Criticality.LOW, action: NetworkAction.NONE })
          .exec(),
        this.model
          .countDocuments({
            ...decided,
            criticality: Criticality.HIGH,
            action: NetworkAction.NONE,
            congestion: CongestionLevel.LOW,
          })
          .exec(),
      ]);

    const toMap = (rows: { _id: string | null; count: number }[]): Record<string, number> =>
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row._id ?? 'UNKNOWN'] = row.count;
        return acc;
      }, {});

    return {
      byAction: toMap(byActionRows),
      byCriticality: toMap(byCriticalityRows),
      criticalProtected,
      criticalUnprotected,
      unnecessaryQodAvoided: avoided,
      criticalNotAtRisk,
    };
  }

  private toDomain(doc: DecisionRecordEntity): DecisionRecord {
    return {
      idempotencyKey: doc.idempotencyKey,
      operationId: doc.operationId,
      workflowId: doc.workflowId,
      runId: doc.runId,
      step: doc.step,
      criticality: doc.criticality,
      criticalityConfidence: doc.criticalityConfidence,
      congestion: doc.congestion,
      deviceReachable: doc.deviceReachable,
      action: doc.action,
      reasoning: doc.reasoning,
      graphTrace: doc.graphTrace,
      toolCalls: doc.toolCalls,
      qodSessionId: doc.qodSessionId,
      qosStatus: doc.qosStatus,
      qosStatusInfo: doc.qosStatusInfo,
      sliceId: doc.sliceId,
      networkCall: doc.networkCall,
      error: doc.error,
      occurredAt: doc.occurredAt,
      recordedAt:
        (doc as DecisionRecordEntity & { recordedAt?: Date }).recordedAt ?? doc.occurredAt,
    };
  }
}
