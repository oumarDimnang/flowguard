import type { Paginated, PaginationDto } from '../../common/dto/pagination.dto';
import type { DecisionRecord } from '../domain/decision-record';

export interface AppendResult {
  record: DecisionRecord;
  /** False when the idempotency key was already present — a retried activity. */
  inserted: boolean;
}

/** Impact-metric aggregates, computed in the datastore rather than in memory. */
export interface DecisionCounts {
  byAction: Record<string, number>;
  byCriticality: Record<string, number>;
  /** Operations where criticality was HIGH and QoD was granted. */
  criticalProtected: number;
  /** Operations where criticality was HIGH but no QoD was granted. */
  criticalUnprotected: number;
  /** Low-criticality operations correctly left on standard connectivity. */
  unnecessaryQodAvoided: number;
}

export abstract class DecisionLogRepository {
  /** Idempotent append (S1). Never updates an existing record. */
  abstract append(record: Omit<DecisionRecord, 'recordedAt'>): Promise<AppendResult>;

  abstract findByOperation(operationId: string): Promise<DecisionRecord[]>;

  abstract findAll(pagination: PaginationDto): Promise<Paginated<DecisionRecord>>;

  abstract counts(): Promise<DecisionCounts>;
}
