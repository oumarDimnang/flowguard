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

  abstract findById(organizationId: string, operationId: string): Promise<Operation | null>;

  /** Everything not yet COMPLETED or FAILED — the dashboard's main view. */
  abstract findActive(organizationId: string): Promise<Operation[]>;

  /**
   * In-flight operations for one device.
   *
   * Congestion subscriptions are per-device rather than per-operation, so a
   * congestion callback has to fan out to whatever that device is currently
   * doing.
   */
  abstract findActiveByDevice(organizationId: string, deviceId: string): Promise<Operation[]>;

  abstract findAll(organizationId: string, pagination: PaginationDto): Promise<Paginated<Operation>>;

  /** Returns null when the operation does not exist. */
  abstract patch(
    organizationId: string,
    operationId: string,
    patch: OperationPatch,
  ): Promise<Operation | null>;

  /**
   * Resolve an operation from its id alone, without a tenant.
   *
   * **The only unscoped read in the system, and it exists for exactly one
   * caller: Nokia's webhooks.** A callback arrives with a correlation id in its
   * sink URL and no session, so there is no tenant to scope by — the tenant is
   * what this lookup is for. The result is used to route a Temporal signal, and
   * is never returned to a user.
   *
   * Safe because `operationId` is globally unique: it is the business event id,
   * which the server mints per dispatch.
   *
   * If sink URLs ever start carrying the organization (they are currently
   * unused), delete this and read it from the path instead.
   */
  abstract findByIdForWebhook(operationId: string): Promise<Operation | null>;

  /**
   * In-flight operations for one device across every tenant.
   *
   * Same justification: congestion subscriptions are per-device (D7) and their
   * callbacks carry no organization. Each returned operation carries its own
   * `organizationId`, and each resulting signal is addressed with that — so a
   * callback still cannot reach a workflow in an unrelated tenant.
   */
  abstract findActiveByDeviceForWebhook(deviceId: string): Promise<Operation[]>;

  /** Counts by network action, backing the impact metrics. */
  abstract countByAction(organizationId: string): Promise<Record<string, number>>;
}
