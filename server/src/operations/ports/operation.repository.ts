import type { Paginated, PaginationDto } from '../../common/dto/pagination.dto';
import type { Operation, OperationCreate, OperationPatch } from '../domain/operation';

/**
 * Data access contract for the operations read model (S1).
 *
 * Abstract class, not an interface: TypeScript interfaces are erased at runtime
 * and cannot be Nest injection tokens. Bound in operations.module.ts as
 * { provide: OperationRepository, useClass: MongoOperationRepository }.
 */
export abstract class OperationRepository {
  /**
   * Insert, or return the existing record if this operation is already known.
   * Idempotent so a replayed activity cannot duplicate a row.
   */
  abstract create(operation: OperationCreate): Promise<Operation>;

  abstract findById(operationId: string): Promise<Operation | null>;

  /** Everything not yet COMPLETED or FAILED — the dashboard's main view. */
  abstract findActive(): Promise<Operation[]>;

  /**
   * In-flight operations for one device.
   *
   * Congestion subscriptions are per-device rather than per-operation, so a
   * congestion callback has to fan out to whatever that device is currently
   * doing.
   */
  abstract findActiveByDevice(deviceId: string): Promise<Operation[]>;

  abstract findAll(pagination: PaginationDto): Promise<Paginated<Operation>>;

  /** Returns null when the operation does not exist. */
  abstract patch(operationId: string, patch: OperationPatch): Promise<Operation | null>;

  /** Counts by network action, backing the impact metrics. */
  abstract countByAction(): Promise<Record<string, number>>;
}
