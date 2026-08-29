import { Injectable, NotFoundException } from '@nestjs/common';

import type { Paginated, PaginationDto } from '../common/dto/pagination.dto';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import type { Operation, OperationCreate, OperationPatch } from './domain/operation';
import { OperationRepository } from './ports/operation.repository';

/**
 * Owns the operations read model.
 *
 * Every mutation fans out over WebSocket here rather than at the call sites, so
 * there is exactly one place where a state change can fail to reach the
 * dashboard.
 */
@Injectable()
export class OperationsService {
  constructor(
    private readonly repository: OperationRepository,
    private readonly realtime: RealtimePublisherPort,
  ) {}

  async register(operation: OperationCreate): Promise<Operation> {
    const created = await this.repository.create(operation);
    this.realtime.publish(LIVE_EVENTS.OPERATION_STARTED, created);
    return created;
  }

  async apply(operationId: string, patch: OperationPatch): Promise<Operation> {
    const updated = await this.repository.patch(operationId, patch);
    if (!updated) {
      throw new NotFoundException(`Operation '${operationId}' not found`);
    }
    this.realtime.publish(LIVE_EVENTS.OPERATION_UPDATED, updated);
    return updated;
  }

  /**
   * Patch without raising when the operation is unknown.
   *
   * Used on the decision-ingest path: an out-of-order or replayed activity
   * should not fail with a 404, because the activity would then retry forever.
   */
  async applyIfPresent(operationId: string, patch: OperationPatch): Promise<Operation | null> {
    const updated = await this.repository.patch(operationId, patch);
    if (updated) {
      this.realtime.publish(LIVE_EVENTS.OPERATION_UPDATED, updated);
    }
    return updated;
  }

  async findOne(operationId: string): Promise<Operation> {
    const found = await this.repository.findById(operationId);
    if (!found) {
      throw new NotFoundException(`Operation '${operationId}' not found`);
    }
    return found;
  }

  findActive(): Promise<Operation[]> {
    return this.repository.findActive();
  }

  findActiveByDevice(deviceId: string): Promise<Operation[]> {
    return this.repository.findActiveByDevice(deviceId);
  }

  findAll(pagination: PaginationDto): Promise<Paginated<Operation>> {
    return this.repository.findAll(pagination);
  }

  countByAction(): Promise<Record<string, number>> {
    return this.repository.countByAction();
  }
}
