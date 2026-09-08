import { Injectable, NotFoundException } from '@nestjs/common';

import type { Industry } from '../common/domain/tenancy';
import { ContainerTerminalSystem } from './adapters/container-terminal/container-terminal.system';
import { DroneOperationsSystem } from './adapters/drone-operations/drone-operations.system';
import { FacilitySystemPort } from './ports/facility-system.port';

/**
 * Industry to facility system.
 *
 * Built from the adapters' own `industry` field rather than a hand-written map,
 * so registering an adapter in the module is the only step — there is no second
 * place to forget.
 */
@Injectable()
export class FacilityRegistry {
  private readonly byIndustry = new Map<Industry, FacilitySystemPort>();

  constructor(terminal: ContainerTerminalSystem, drones: DroneOperationsSystem) {
    for (const system of [terminal, drones]) {
      this.byIndustry.set(system.industry, system);
    }
  }

  /**
   * The facility system for an organization's industry.
   *
   * A 404 rather than a 500 when nothing is registered: an organization in an
   * industry FlowGuard does not yet model is a gap in coverage, not a fault.
   */
  /** Industries an organization can be registered in today. */
  supported(): Industry[] {
    return [...this.byIndustry.keys()];
  }

  supports(industry: Industry): boolean {
    return this.byIndustry.has(industry);
  }

  for(industry: Industry): FacilitySystemPort {
    const system = this.byIndustry.get(industry);
    if (!system) {
      throw new NotFoundException(`No facility system for industry '${industry}'`);
    }
    return system;
  }
}
