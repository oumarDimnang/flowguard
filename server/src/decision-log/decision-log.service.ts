import { Injectable, Logger } from '@nestjs/common';

import { NetworkAction, OperationStatus, QosStatus } from '../common/domain/enums';
import type { Paginated, PaginationDto } from '../common/dto/pagination.dto';
import type { OperationPatch } from '../operations/domain/operation';
import { OperationsService } from '../operations/operations.service';
import { RealtimePublisherPort } from '../realtime/ports/realtime-publisher.port';
import { LIVE_EVENTS } from '../realtime/realtime.events';
import { DecisionStep, type DecisionRecord } from './domain/decision-record';
import type { RecordDecisionDto } from './dto/record-decision.dto';
import { DecisionLogRepository, type DecisionCounts } from './ports/decision-log.repository';

/** Workflow stage to read-model lifecycle state. */
const STEP_TO_STATUS: Partial<Record<DecisionStep, OperationStatus>> = {
  [DecisionStep.DEVICE_CHECKED]: OperationStatus.ASSESSING,
  [DecisionStep.CONGESTION_CHECKED]: OperationStatus.ASSESSING,
  [DecisionStep.CRITICALITY_ASSESSED]: OperationStatus.ASSESSING,
  [DecisionStep.ALLOCATED]: OperationStatus.ALLOCATED,
  [DecisionStep.RELEASED]: OperationStatus.COMPLETED,
  [DecisionStep.FAILED]: OperationStatus.FAILED,
};

export interface RecordDecisionResult {
  recorded: boolean;
  /** True when this exact step had already been recorded — a retried activity. */
  duplicate: boolean;
}

/**
 * Ingest point for everything the Python worker observes and decides.
 *
 * Does three things per event, in order: append to the immutable trail, project
 * onto the dashboard read model, push to connected clients. A duplicate short-
 * circuits after the first step so a retried activity cannot double-count a
 * decision in the impact metrics.
 */
@Injectable()
export class DecisionLogService {
  private readonly logger = new Logger(DecisionLogService.name);

  constructor(
    private readonly repository: DecisionLogRepository,
    private readonly operations: OperationsService,
    private readonly realtime: RealtimePublisherPort,
  ) {}

  async record(dto: RecordDecisionDto): Promise<RecordDecisionResult> {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const { record, inserted } = await this.repository.append({
      // Run ID plus step is stable across retries of the same activity but
      // distinct across genuine workflow steps.
      idempotencyKey: `${dto.runId}:${dto.step}`,
      // From the workflow payload, not a session — the agent posts with a
      // machine token and has no session to read a tenant from.
      organizationId: dto.organizationId,
      operationId: dto.operationId,
      workflowId: dto.workflowId,
      runId: dto.runId,
      step: dto.step,
      criticality: dto.criticality,
      criticalityConfidence: dto.criticalityConfidence,
      congestion: dto.congestion,
      deviceReachable: dto.deviceReachable,
      action: dto.action,
      reasoning: dto.reasoning,
      graphTrace: dto.graphTrace,
      toolCalls: dto.toolCalls,
      rule: dto.rule,
      modelId: dto.modelId,
      qodSessionId: dto.qodSessionId,
      qosStatus: dto.qosStatus,
      qosStatusInfo: dto.qosStatusInfo,
      sliceId: dto.sliceId,
      networkCall: dto.networkCall,
      error: dto.error,
      occurredAt,
    });

    if (!inserted) {
      this.logger.debug(`Duplicate decision ignored: ${record.idempotencyKey}`);
      return { recorded: false, duplicate: true };
    }

    await this.operations.applyIfPresent(
      dto.organizationId,
      dto.operationId,
      this.toOperationPatch(dto),
    );

    this.realtime.publish(dto.organizationId, LIVE_EVENTS.DECISION_RECORDED, record);

    if (dto.step === DecisionStep.QOS_STATUS_CHANGED) {
      this.realtime.publish(dto.organizationId, LIVE_EVENTS.QOD_STATUS_CHANGED, {
        operationId: dto.operationId,
        sessionId: dto.qodSessionId,
        qosStatus: dto.qosStatus,
        qosStatusInfo: dto.qosStatusInfo,
      });
    }

    return { recorded: true, duplicate: false };
  }

  findByOperation(organizationId: string, operationId: string): Promise<DecisionRecord[]> {
    return this.repository.findByOperation(organizationId, operationId);
  }

  findAll(
    organizationId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<DecisionRecord>> {
    return this.repository.findAll(organizationId, pagination);
  }

  counts(organizationId: string): Promise<DecisionCounts> {
    return this.repository.counts(organizationId);
  }

  /** Decision event to read-model patch. Only sets what the event carries. */
  private toOperationPatch(dto: RecordDecisionDto): OperationPatch {
    const patch: OperationPatch = {};

    if (dto.criticality !== undefined) patch.criticality = dto.criticality;
    if (dto.congestion !== undefined) patch.congestion = dto.congestion;
    if (dto.deviceReachable !== undefined) patch.deviceReachable = dto.deviceReachable;
    if (dto.action !== undefined) patch.action = dto.action;
    if (dto.reasoning !== undefined) patch.reasoning = dto.reasoning;
    if (dto.qodSessionId !== undefined) patch.qodSessionId = dto.qodSessionId;
    if (dto.qosStatus !== undefined) patch.qosStatus = dto.qosStatus;
    if (dto.sliceId !== undefined) patch.sliceId = dto.sliceId;

    const mapped = STEP_TO_STATUS[dto.step];
    if (mapped) patch.status = mapped;

    // A decision of NONE is terminal: nothing was allocated, so there is
    // nothing to monitor or release. Anything else stays in flight until the
    // allocate step reports.
    if (dto.step === DecisionStep.DECIDED) {
      patch.status =
        dto.action === NetworkAction.NONE ? OperationStatus.COMPLETED : OperationStatus.ASSESSING;
      if (dto.action === NetworkAction.NONE) patch.completedAt = new Date();
    }

    // QoD is asynchronous (D8): the session only becomes real on AVAILABLE.
    if (dto.step === DecisionStep.QOS_STATUS_CHANGED && dto.qosStatus === QosStatus.AVAILABLE) {
      patch.status = OperationStatus.MONITORING;
    }

    if (dto.step === DecisionStep.RELEASED) {
      patch.completedAt = new Date();
    }

    return patch;
  }
}
