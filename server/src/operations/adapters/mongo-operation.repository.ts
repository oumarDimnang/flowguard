import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type { Paginated, PaginationDto } from '../../common/dto/pagination.dto';
import { OperationStatus } from '../../common/domain/enums';
import type { Operation, OperationCreate, OperationPatch } from '../domain/operation';
import { OperationRepository } from '../ports/operation.repository';
import { OperationDocument, OperationEntity } from '../schemas/operation.schema';

const TERMINAL_STATUSES = [OperationStatus.COMPLETED, OperationStatus.FAILED];

@Injectable()
export class MongoOperationRepository extends OperationRepository {
  constructor(
    @InjectModel(OperationEntity.name)
    private readonly model: Model<OperationDocument>,
  ) {
    super();
  }

  async create(operation: OperationCreate): Promise<Operation> {
    // Upsert rather than insert: activities retry, and a retried emit must not
    // produce a duplicate-key error that fails the activity.
    const doc = await this.model
      .findOneAndUpdate(
        { operationId: operation.operationId },
        {
          $setOnInsert: {
            ...operation,
            status: operation.status ?? OperationStatus.PENDING,
            startedAt: new Date(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();

    return this.toDomain(doc as OperationEntity);
  }

  async findById(operationId: string): Promise<Operation | null> {
    const doc = await this.model.findOne({ operationId }).lean().exec();
    return doc ? this.toDomain(doc as OperationEntity) : null;
  }

  async findActive(): Promise<Operation[]> {
    const docs = await this.model
      .find({ status: { $nin: TERMINAL_STATUSES } })
      .sort({ startedAt: -1 })
      .lean()
      .exec();

    return docs.map((d) => this.toDomain(d as OperationEntity));
  }

  async findActiveByDevice(deviceId: string): Promise<Operation[]> {
    const docs = await this.model
      .find({ deviceId, status: { $nin: TERMINAL_STATUSES } })
      .sort({ startedAt: -1 })
      .lean()
      .exec();

    return docs.map((d) => this.toDomain(d as OperationEntity));
  }

  async findAll(pagination: PaginationDto): Promise<Paginated<Operation>> {
    const { skip, limit } = pagination;

    const [docs, total] = await Promise.all([
      this.model.find().sort({ startedAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments().exec(),
    ]);

    return {
      items: docs.map((d) => this.toDomain(d as OperationEntity)),
      total,
      skip,
      limit,
    };
  }

  async patch(operationId: string, patch: OperationPatch): Promise<Operation | null> {
    // Atomic read-modify-write. Two activities can report on the same operation
    // concurrently, so this must never be a read-then-save.
    const doc = await this.model
      .findOneAndUpdate({ operationId }, { $set: patch }, { new: true })
      .lean()
      .exec();

    return doc ? this.toDomain(doc as OperationEntity) : null;
  }

  async countByAction(): Promise<Record<string, number>> {
    const rows = await this.model
      .aggregate<{ _id: string | null; count: number }>([
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ])
      .exec();

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row._id ?? 'UNDECIDED'] = row.count;
      return acc;
    }, {});
  }

  /** Persistence document -> domain model (S3). */
  private toDomain(doc: OperationEntity): Operation {
    return {
      operationId: doc.operationId,
      workflowId: doc.workflowId,
      runId: doc.runId,
      assetType: doc.assetType,
      deviceId: doc.deviceId,
      operationName: doc.operationName,
      site: doc.site,
      status: doc.status,
      criticality: doc.criticality,
      congestion: doc.congestion,
      deviceReachable: doc.deviceReachable,
      action: doc.action,
      reasoning: doc.reasoning,
      qodSessionId: doc.qodSessionId,
      qosStatus: doc.qosStatus,
      sliceId: doc.sliceId,
      startedAt: doc.startedAt,
      updatedAt: (doc as OperationEntity & { updatedAt?: Date }).updatedAt ?? doc.startedAt,
      completedAt: doc.completedAt,
    };
  }
}
