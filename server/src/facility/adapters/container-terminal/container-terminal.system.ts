import { Injectable } from '@nestjs/common';

import { AssetType } from '../../../common/domain/enums';
import { Industry } from '../../../common/domain/tenancy';
import { DecisionLogService } from '../../../decision-log/decision-log.service';
import { EventsService } from '../../../events/events.service';
import { RealtimePublisherPort } from '../../../realtime/ports/realtime-publisher.port';
import {
  JOB_QUEUED,
  type FacilityDescriptor,
  type FacilityJob,
  type JobEventShape,
} from '../../domain/facility-job';
import { FacilitySystemBase } from '../../facility-system.base';
import { BERTH, WORK_QUEUE } from './berth.definitions';
import { MOVE_GATE, MOVE_LIFECYCLE, type ContainerAttributes } from './container-move';

/** Compressed for the demo. A real container move runs 90-180 seconds. */
const DURATIONS: Record<string, number> = {
  GANTRY: 4_000,
  TROLLEY: 3_000,
  SPREADER: 3_000,
  // TWISTLOCK is absent on purpose: it is gated, not timed.
  HOISTING: 8_000,
  LANDING: 4_000,
};

/**
 * A stand-in Terminal Operating System.
 *
 * The facility system a container terminal runs — the thing a real deployment
 * replaces with Navis N4 issuing job instructions over OPC-UA to the equipment
 * control layer.
 *
 * All the machinery lives in the base: dispatch, timed transitions, the gate,
 * release on every exit path. What is here is only the vocabulary — the crane's
 * eight physical stations, the twistlock interlock, and how a container becomes
 * a business event.
 */
@Injectable()
export class ContainerTerminalSystem extends FacilitySystemBase {
  readonly industry = Industry.CONTAINER_TERMINAL;

  protected readonly lifecycle = MOVE_LIFECYCLE;
  protected readonly gateState = MOVE_GATE;
  protected readonly durations = DURATIONS;

  constructor(
    events: EventsService,
    decisions: DecisionLogService,
    realtime: RealtimePublisherPort,
  ) {
    super(events, decisions, realtime);
  }

  describe(): FacilityDescriptor {
    return {
      industry: this.industry,
      id: BERTH.id,
      name: BERTH.name,
      context: `vessel ${BERTH.vessel}`,
      throughputLabel: 'moves/hour',
      throughputTarget: BERTH.targetMovesPerHour,
      columns: ['id', 'crane', 'container', 'weight', 'flags', 'action'],
    };
  }

  protected seedJobs(): FacilityJob<ContainerAttributes>[] {
    return WORK_QUEUE.map((definition) => ({
      id: definition.id,
      assetId: definition.craneId,
      devicePhoneNumber: definition.devicePhoneNumber,
      state: JOB_QUEUED,
      lifecycle: MOVE_LIFECYCLE,
      gateState: MOVE_GATE,
      summary: definition.summary,
      attributes: { ...definition.container },
      from: definition.fromLocation,
      to: definition.toLocation,
      expectedDurationSeconds: definition.expectedDurationSeconds,
      deferrable: definition.deferrable,
      siteFix: definition.siteFix,
    }));
  }

  /**
   * TOS attributes as business-event metadata.
   *
   * Two vocabularies deliberately coexist. The TIC4.0-aligned names are what a
   * real terminal emits and what the model reasons over. The four derived keys
   * at the bottom are what the offline MockClassifier keys off
   * (agent/src/flowguard_agent/llm/client.py), so the whole loop still runs
   * with no API key. A production integration would map TOS fields inside the
   * agent and drop the derived set.
   *
   * Everything rides inside `metadata` rather than as top-level fields, because
   * the ValidationPipe runs with forbidNonWhitelisted: a new top-level field
   * would be a 400, whereas metadata is an open record by design.
   */
  protected toEvent(
    job: FacilityJob<ContainerAttributes>,
    operationId: string,
  ): JobEventShape {
    const container = job.attributes;

    return {
      assetType: AssetType.CRANE,
      operation: `Move container ${container.containerId}`,
      site: `${BERTH.name} — ${job.from}`,
      metadata: {
        jobInstructionId: operationId,
        moveId: job.id,
        craneId: job.assetId,
        berthId: BERTH.id,
        vessel: BERTH.vessel,
        fromLocation: job.from,
        toLocation: job.to,

        containerId: container.containerId,
        grossWeightKg: container.grossWeightKg,
        imdgClass: container.imdgClass,
        reefer: container.reefer ?? false,
        twinLift: container.twinLift ?? false,

        // Read by the agent's evidence step, which may choose to ask the
        // network whether the asset is really here. Nothing forces it to.
        ...(job.siteFix
          ? {
              siteLatitude: job.siteFix.latitude,
              siteLongitude: job.siteFix.longitude,
              siteRadiusMeters: job.siteFix.radiusMeters,
            }
          : {}),

        // Derived for the offline classifier.
        hazard: container.imdgClass !== undefined,
        loadTonnes: Math.round(container.grossWeightKg / 100) / 10,
        overWalkway: container.overWalkway,
        deferrable: job.deferrable ?? false,
      },
    };
  }
}
