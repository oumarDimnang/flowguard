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

type GroupRow = { _id: string | null; count: number };

/** The one document `counts()`'s $facet stage returns. */
interface CountFacets {
  byAction: GroupRow[];
  byCriticality: GroupRow[];
  criticalProtected: { n: number }[];
  criticalUnprotected: { n: number }[];
  avoided: { n: number }[];
  criticalNotAtRisk: { n: number }[];
}

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
          .findOne({ organizationId: record.organizationId, idempotencyKey: record.idempotencyKey })
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

  async findByOperation(
    organizationId: string,
    operationId: string,
  ): Promise<DecisionRecord[]> {
    const docs = await this.model
      .find({ organizationId, operationId })
      .sort({ occurredAt: 1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d as DecisionRecordEntity));
  }

  async findAll(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<DecisionRecord>> {
    const { skip, limit } = pagination;

    // The total is scoped too — an unscoped count leaks how much work every
    // other tenant has done through a pagination footer.
    const [docs, total] = await Promise.all([
      this.model
        .find({ organizationId })
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments({ organizationId }).exec(),
    ]);

    return {
      items: docs.map((d) => this.toDomain(d as DecisionRecordEntity)),
      total,
      skip,
      limit,
    };
  }

  /**
   * One count per operation, from its first DECIDED record.
   *
   * Counting DECIDED records directly overcounted: an operation that halts
   * with its load committed records a second DECIDED (the suspended-load rule),
   * which added a second decision and a second protection to the same lift.
   * The first DECIDED is what the operation was decided as; later ones revise
   * what the network is doing for it, not what it was.
   */
  async counts(organizationId: string): Promise<DecisionCounts> {
    // Congestion at or above the allocation threshold. A HIGH-criticality
    // operation below this was never at risk, so it belongs in neither side of
    // the protection ratio.
    const atRisk = { $in: [CongestionLevel.MEDIUM, CongestionLevel.HIGH] };
    const granted = { $in: [NetworkAction.QOD, NetworkAction.QOD_AND_SLICE] };

    const [facets] = await this.model
      .aggregate<CountFacets>([
        { $match: { organizationId, step: DecisionStep.DECIDED } },
        { $sort: { occurredAt: 1 } },
        {
          $group: {
            _id: '$operationId',
            action: { $first: '$action' },
            criticality: { $first: '$criticality' },
            congestion: { $first: '$congestion' },
          },
        },
        {
          $facet: {
            byAction: [{ $group: { _id: '$action', count: { $sum: 1 } } }],
            byCriticality: [{ $group: { _id: '$criticality', count: { $sum: 1 } } }],
            criticalProtected: [
              { $match: { criticality: Criticality.HIGH, congestion: atRisk, action: granted } },
              { $count: 'n' },
            ],
            criticalUnprotected: [
              {
                $match: {
                  criticality: Criticality.HIGH,
                  congestion: atRisk,
                  action: NetworkAction.NONE,
                },
              },
              { $count: 'n' },
            ],
            avoided: [
              { $match: { criticality: Criticality.LOW, action: NetworkAction.NONE } },
              { $count: 'n' },
            ],
            criticalNotAtRisk: [
              {
                $match: {
                  criticality: Criticality.HIGH,
                  congestion: CongestionLevel.LOW,
                  action: NetworkAction.NONE,
                },
              },
              { $count: 'n' },
            ],
          },
        },
      ])
      .exec();

    const toMap = (rows: GroupRow[] = []): Record<string, number> =>
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row._id ?? 'UNKNOWN'] = row.count;
        return acc;
      }, {});
    const count = (rows: { n: number }[] = []) => rows[0]?.n ?? 0;

    return {
      byAction: toMap(facets?.byAction),
      byCriticality: toMap(facets?.byCriticality),
      criticalProtected: count(facets?.criticalProtected),
      criticalUnprotected: count(facets?.criticalUnprotected),
      unnecessaryQodAvoided: count(facets?.avoided),
      criticalNotAtRisk: count(facets?.criticalNotAtRisk),
    };
  }

  /**
   * Persistence document to domain record.
   *
   * Deliberately a spread rather than a field-by-field copy.
   *
   * This mapper used to list every field by hand, with no compiler link to the
   * three other places a decision-log field has to be declared. Every field is
   * optional, so omitting one here produced a record that saved to Mongo
   * correctly and came back from every read path silently missing it — which
   * happened to `graphTrace`/`toolCalls`, and would have happened again to
   * `rule`/`model`. Both times it was caught by a human noticing, not by a test.
   *
   * Spreading removes the failure mode entirely: a new `@Prop` on the entity
   * now reaches the domain object with no second edit. Only Mongo's own
   * bookkeeping has to be named, and `recordedAt` — supplied by `timestamps`
   * rather than declared as a prop — still needs its fallback for documents
   * written before that option existed.
   */
  private toDomain(doc: DecisionRecordEntity): DecisionRecord {
    const { _id, __v, recordedAt, ...fields } = doc as DecisionRecordEntity & {
      _id?: unknown;
      __v?: unknown;
      recordedAt?: Date;
    };

    void _id;
    void __v;

    return { ...fields, recordedAt: recordedAt ?? doc.occurredAt };
  }
}
