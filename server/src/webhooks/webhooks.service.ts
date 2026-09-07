import { Injectable, Logger } from '@nestjs/common';

import { OperationsService } from '../operations/operations.service';
import { WorkflowOrchestratorPort } from '../temporal/ports/workflow-orchestrator.port';
import { OperationWorkflowNotFoundError } from '../temporal/temporal.errors';
import type {
  CongestionCallbackDto,
  DeviceStatusCallbackDto,
  QodCallbackDto,
} from './dto/nac-callback.dto';

export interface DispatchResult {
  dispatched: number;
  /** Workflows that had already finished when the callback arrived. */
  stale: number;
}

/**
 * Translates Nokia callbacks into Temporal signals.
 *
 * Correlation is carried in the sink URL rather than looked up: when a QoD
 * session is created the activity registers a sink of
 * `/webhooks/nac/qod/{operationId}`, so the callback arrives already knowing
 * which workflow it belongs to. That avoids a database round-trip on a path
 * that has to be fast, and avoids the failure mode where the read model has not
 * yet recorded the session ID when its first callback lands.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly orchestrator: WorkflowOrchestratorPort,
    private readonly operations: OperationsService,
  ) {}

  async qodStatusChanged(operationId: string, callback: QodCallbackDto): Promise<DispatchResult> {
    const organizationId = await this.resolveTenant(operationId);
    if (!organizationId) return { dispatched: 0, stale: 1 };

    return this.dispatch(operationId, () =>
      this.orchestrator.signalQodStatusChanged(organizationId, operationId, {
        sessionId: callback.data.sessionId,
        qosStatus: callback.data.qosStatus,
        statusInfo: callback.data.statusInfo,
      }),
    );
  }

  async deviceStatusChanged(
    operationId: string,
    deviceId: string,
    callback: DeviceStatusCallbackDto,
  ): Promise<DispatchResult> {
    const organizationId = await this.resolveTenant(operationId);
    if (!organizationId) return { dispatched: 0, stale: 1 };

    return this.dispatch(operationId, () =>
      this.orchestrator.signalDeviceStatusChanged(organizationId, operationId, {
        deviceId,
        reachable: callback.data.reachable ?? false,
        observedAt: callback.time ?? new Date().toISOString(),
      }),
    );
  }

  /**
   * Congestion subscriptions are per-device, not per-operation (D7), so one
   * callback fans out to every operation currently running on that device.
   */
  async congestionUpdated(
    deviceId: string,
    callback: CongestionCallbackDto,
  ): Promise<DispatchResult> {
    const active = await this.operations.findActiveByDeviceForWebhook(deviceId);

    if (active.length === 0) {
      this.logger.debug(`Congestion callback for '${deviceId}' with no active operations`);
      return { dispatched: 0, stale: 0 };
    }

    const results = await Promise.all(
      active.map((operation) =>
        // Each signal is addressed with the operation's *own* tenant, so a
        // device id shared between two organizations still cannot cross over.
        this.dispatch(operation.operationId, () =>
          this.orchestrator.signalCongestionUpdated(
            operation.organizationId,
            operation.operationId,
            {
            deviceId,
              level: callback.data.congestionLevel,
              observedAt: callback.time ?? new Date().toISOString(),
            },
          ),
        ),
      ),
    );

    return results.reduce<DispatchResult>(
      (acc, r) => ({ dispatched: acc.dispatched + r.dispatched, stale: acc.stale + r.stale }),
      { dispatched: 0, stale: 0 },
    );
  }

  /**
   * Which tenant an inbound callback belongs to.
   *
   * A webhook carries a correlation id and no session, so the organization has
   * to be resolved from the operation. A callback for an operation the read
   * model has never seen is treated as stale rather than an error — Nokia would
   * otherwise retry a request that can never succeed.
   */
  private async resolveTenant(operationId: string): Promise<string | undefined> {
    const operation = await this.operations.findByIdForWebhook(operationId);
    if (!operation) {
      this.logger.debug(`Callback for unknown operation '${operationId}'`);
      return undefined;
    }
    return operation.organizationId;
  }

  /**
   * A callback for a finished workflow is normal, not an error — network events
   * race with operation completion. Swallow it so Nokia does not retry, and so
   * the endpoint never returns 5xx for an expected condition.
   */
  private async dispatch(
    operationId: string,
    signal: () => Promise<void>,
  ): Promise<DispatchResult> {
    try {
      await signal();
      return { dispatched: 1, stale: 0 };
    } catch (err) {
      if (err instanceof OperationWorkflowNotFoundError) {
        this.logger.debug(`Callback for completed or unknown operation '${operationId}'`);
        return { dispatched: 0, stale: 1 };
      }
      throw err;
    }
  }
}
