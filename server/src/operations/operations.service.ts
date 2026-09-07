import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { Paginated, PaginationDto } from '../common/dto/pagination.dto';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import type { Operation, OperationCreate, OperationPatch } from './domain/operation';
import { OperationRepository } from './ports/operation.repository';

/**
 * Owns the operations read model.
 *
 * Every method takes the tenant explicitly. There is no unscoped read here —
 * not even a private one — so there is nothing for a future caller to reach for
 * when it is inconvenient to have an organization to hand.
 */
@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly repository: OperationRepository,
    private readonly realtime: RealtimePublisherPort,
  ) {}

  async register(operation: OperationCreate): Promise<Operation> {
    const created = await this.repository.create(operation);
    this.realtime.publish(created.organizationId, LIVE_EVENTS.OPERATION_STARTED, created);
    return created;
  }

  async apply(
    organizationId: string,
    operationId: string,
    patch: OperationPatch,
  ): Promise<Operation> {
    const updated = await this.repository.patch(organizationId, operationId, patch);
    if (!updated) {
      throw new NotFoundException(`Unknown operation '${operationId}'`);
    }

    this.realtime.publish(updated.organizationId, LIVE_EVENTS.OPERATION_UPDATED, updated);
    return updated;
  }

  /**
   * Patch without raising when the operation is unknown.
   *
   * Decision events can arrive for an operation the read model never saw — a
   * replayed workflow after a database reset, for instance — and losing the
   * projection is not a reason to fail the activity that reported it.
   */
  async applyIfPresent(
    organizationId: string,
    operationId: string,
    patch: OperationPatch,
  ): Promise<Operation | null> {
    const updated = await this.repository.patch(organizationId, operationId, patch);
    if (updated) {
      this.realtime.publish(updated.organizationId, LIVE_EVENTS.OPERATION_UPDATED, updated);
    }
    return updated;
  }

  async findOne(organizationId: string, operationId: string): Promise<Operation> {
    const found = await this.repository.findById(organizationId, operationId);
    if (!found) {
      // 404 rather than 403 when the operation exists in another organization.
      // A 403 would confirm the id is real, which is itself a disclosure.
      throw new NotFoundException(`Unknown operation '${operationId}'`);
    }
    return found;
  }

  findActive(organizationId: string): Promise<Operation[]> {
    return this.repository.findActive(organizationId);
  }

  findActiveByDevice(organizationId: string, deviceId: string): Promise<Operation[]> {
    return this.repository.findActiveByDevice(organizationId, deviceId);
  }

  findAll(organizationId: string, pagination: PaginationDto): Promise<Paginated<Operation>> {
    return this.repository.findAll(organizationId, pagination);
  }

  /** Webhook-only. See the port for why this one read has no tenant. */
  findByIdForWebhook(operationId: string): Promise<Operation | null> {
    return this.repository.findByIdForWebhook(operationId);
  }

  /** Webhook-only. Each result carries the tenant its signal must be sent with. */
  findActiveByDeviceForWebhook(deviceId: string): Promise<Operation[]> {
    return this.repository.findActiveByDeviceForWebhook(deviceId);
  }

  countByAction(organizationId: string): Promise<Record<string, number>> {
    return this.repository.countByAction(organizationId);
  }
}
