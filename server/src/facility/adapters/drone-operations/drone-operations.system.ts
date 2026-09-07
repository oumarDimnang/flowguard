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
import { FLEET, SORTIE_BOARD } from './fleet.definitions';
import { FLIGHT_GATE, FLIGHT_LIFECYCLE, type FlightAttributes } from './flight';

/** Compressed for the demo, same as the terminal. */
const DURATIONS: Record<string, number> = {
  // PREFLIGHT is absent on purpose: it is gated, not timed.
  TAKEOFF: 3_000,
  TRANSIT: 6_000,
  ON_STATION: 8_000,
  RETURN: 5_000,
};

/**
 * A stand-in flight-operations system.
 *
 * The second industry, and the reason the facility port exists at all. Compare
 * it with ContainerTerminalSystem: no state machine, no gate polling, no
 * release logic — all of that is inherited. What is here is a lifecycle, a gate
 * and a metadata mapping, which is exactly how much a new industry should cost.
 *
 * Everything downstream is untouched. `decide()` never learns what a drone is;
 * it sees the same criticality and congestion it always did.
 */
@Injectable()
export class DroneOperationsSystem extends FacilitySystemBase {
  readonly industry = Industry.DRONE_OPERATIONS;

  protected readonly lifecycle = FLIGHT_LIFECYCLE;
  protected readonly gateState = FLIGHT_GATE;
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
      id: FLEET.id,
      name: FLEET.name,
      context: `area ${FLEET.area}`,
      throughputLabel: 'sorties/day',
      throughputTarget: FLEET.targetSortiesPerDay,
      columns: ['id', 'aircraft', 'registration', 'payload', 'flags', 'action'],
    };
  }

  protected seedJobs(): FacilityJob<FlightAttributes>[] {
    return SORTIE_BOARD.map((definition) => ({
      id: definition.id,
      assetId: definition.droneId,
      devicePhoneNumber: definition.devicePhoneNumber,
      state: JOB_QUEUED,
      lifecycle: FLIGHT_LIFECYCLE,
      gateState: FLIGHT_GATE,
      summary: definition.summary,
      attributes: { ...definition.flight },
      from: definition.fromLocation,
      to: definition.toLocation,
      expectedDurationSeconds: definition.expectedDurationSeconds,
      deferrable: definition.deferrable,
      siteFix: definition.siteFix,
    }));
  }

  /**
   * Flight attributes as business-event metadata.
   *
   * The derived keys at the bottom are the same four the offline classifier
   * reads, mapped from this industry's vocabulary: an inhabited overflight is
   * this industry's over-walkway, and beyond-visual-line-of-sight is its
   * hazard, because it is the case where the radio link is the only link.
   *
   * That mapping is the interesting part of adding an industry. The model does
   * not need to learn about drones; the facility needs to say what its work
   * means in terms the policy already understands.
   */
  protected toEvent(
    job: FacilityJob<FlightAttributes>,
    operationId: string,
  ): JobEventShape {
    const flight = job.attributes;

    return {
      assetType: AssetType.DRONE,
      operation: `${flight.missionType} — ${flight.registration}`,
      site: `${FLEET.name} — ${job.from}`,
      metadata: {
        jobInstructionId: operationId,
        flightId: job.id,
        droneId: job.assetId,
        fleetId: FLEET.id,
        area: FLEET.area,
        fromLocation: job.from,
        toLocation: job.to,

        registration: flight.registration,
        missionType: flight.missionType,
        payloadKg: flight.payloadKg,
        overPopulated: flight.overPopulated,
        bvlos: flight.bvlos,

        // Read by the agent's evidence step, which may choose to ask the
        // network whether the asset is really here. Nothing forces it to.
        ...(job.siteFix
          ? {
              siteLatitude: job.siteFix.latitude,
              siteLongitude: job.siteFix.longitude,
              siteRadiusMeters: job.siteFix.radiusMeters,
            }
          : {}),

        // Derived for the offline classifier, in its vocabulary.
        hazard: flight.bvlos,
        overWalkway: flight.overPopulated,
        loadTonnes: 0,
        deferrable: job.deferrable ?? false,
      },
    };
  }
}
