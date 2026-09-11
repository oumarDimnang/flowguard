import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/decorators/roles.decorator';
import { Role } from '../common/domain/tenancy';
import { OrganizationsService } from '../organizations/organizations.service';
import type { FacilityDescriptor, FacilityJob } from './domain/facility-job';
import { SuspendJobDto } from './dto/suspend-job.dto';
import { FacilityRegistry } from './facility.registry';
import type { FacilitySystemPort } from './ports/facility-system.port';

/**
 * The facility surface, whatever the industry.
 *
 * One set of routes for every organization: the adapter is chosen from the
 * organization's industry, not from anything the client sends. A drone
 * operator and a container terminal hit identical URLs and get back the same
 * shape, with a different lifecycle inside it.
 *
 * Nothing here mentions workflows, connectivity or the network — a real
 * facility system does not know FlowGuard exists, and neither do these.
 *
 * Reads are open to any member of the organization; the three writes require
 * OPERATOR, because dispatching starts a workflow that can allocate paid
 * network capacity. This guard, not the hidden button in the client, is the
 * enforcement.
 */
@Controller('facility')
export class FacilityController {
  constructor(
    private readonly registry: FacilityRegistry,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  async describe(@OrgId() organizationId: string): Promise<FacilityDescriptor> {
    const system = await this.systemFor(organizationId);
    return system.describe(organizationId);
  }

  @Get('jobs')
  async jobs(@OrgId() organizationId: string): Promise<FacilityJob[]> {
    const system = await this.systemFor(organizationId);
    return system.listJobs(organizationId);
  }

  @Get('jobs/:jobId')
  async job(
    @OrgId() organizationId: string,
    @Param('jobId') jobId: string,
  ): Promise<FacilityJob> {
    const system = await this.systemFor(organizationId);
    return system.getJob(organizationId, jobId);
  }

  /** 202: the job unfolds over time; watch it on the WebSocket. */
  @Post('jobs/:jobId/dispatch')
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async dispatch(
    @OrgId() organizationId: string,
    @Param('jobId') jobId: string,
  ): Promise<FacilityJob> {
    const system = await this.systemFor(organizationId);
    return system.dispatch(organizationId, jobId);
  }

  /**
   * Report the job halted with its load committed.
   *
   * OPERATOR, like the other writes: it changes what the network is doing. The
   * reason is free text from the facility and rides into the decision trail, so
   * the record says *why* the connectivity was held rather than only that it
   * was.
   */
  @Post('jobs/:jobId/suspend')
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async suspend(
    @OrgId() organizationId: string,
    @Param('jobId') jobId: string,
    @Body() body: SuspendJobDto,
  ): Promise<FacilityJob> {
    const system = await this.systemFor(organizationId);
    return system.suspend(organizationId, jobId, body.reason);
  }

  /** The halted job is moving again, or its load has been landed. */
  @Post('jobs/:jobId/resume')
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async resume(
    @OrgId() organizationId: string,
    @Param('jobId') jobId: string,
  ): Promise<FacilityJob> {
    const system = await this.systemFor(organizationId);
    return system.resume(organizationId, jobId);
  }

  @Post('jobs/:jobId/abort')
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async abort(
    @OrgId() organizationId: string,
    @Param('jobId') jobId: string,
  ): Promise<FacilityJob> {
    const system = await this.systemFor(organizationId);
    return system.abort(organizationId, jobId);
  }

  /** Restore the plan so the demo can be run again without a restart. */
  @Post('reset')
  @RequireRole(Role.OPERATOR)
  async reset(@OrgId() organizationId: string): Promise<FacilityJob[]> {
    const system = await this.systemFor(organizationId);
    return system.reset(organizationId);
  }

  /**
   * Resolve the adapter from the organization's own industry.
   *
   * A lookup per request, deliberately. The alternative is caching the industry
   * on the session, which then goes stale the moment an organization is
   * reclassified — and an organization looking at the wrong facility is a
   * worse failure than one extra indexed read.
   */
  private async systemFor(organizationId: string): Promise<FacilitySystemPort> {
    const organization = await this.organizations.findOne(organizationId);
    return this.registry.for(organization.industry);
  }
}
