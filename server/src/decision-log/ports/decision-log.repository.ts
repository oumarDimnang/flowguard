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

  /**
   * HIGH-criticality operations that were genuinely **at risk** — the network
   * was congested at or above the allocation threshold — and received
   * protection.
   *
   * "At risk" is load-bearing. A critical operation on an uncongested network
   * is correctly left alone; counting that as a protection failure would score
   * the agent's best behaviour as its worst.
   */
  criticalProtected: number;

  /** At-risk HIGH-criticality operations that received nothing. The real miss. */
  criticalUnprotected: number;

  /** LOW-criticality operations correctly left on standard connectivity. */
  unnecessaryQodAvoided: number;

  /**
   * HIGH-criticality operations withheld because the network was healthy.
   *
   * A saving, not a failure — the operation mattered, the network did not need
   * help, and no money was spent.
   */
  criticalNotAtRisk: number;
}

export abstract class DecisionLogRepository {
  /** Idempotent append (S1). Never updates an existing record. */
  abstract append(record: Omit<DecisionRecord, 'recordedAt'>): Promise<AppendResult>;

  abstract findByOperation(
    organizationId: string,
    operationId: string,
  ): Promise<DecisionRecord[]>;

  abstract findAll(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<DecisionRecord>>;

  abstract counts(organizationId: string): Promise<DecisionCounts>;
}
