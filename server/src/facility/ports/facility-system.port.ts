import type { Industry } from '../../common/domain/tenancy';
import type { FacilityDescriptor, FacilityJob } from '../domain/facility-job';

/**
 * A facility system: the thing that models physical work and reports it.
 *
 * The integration seam. A real deployment replaces one of these with the
 * customer's own system — Navis N4 for a container terminal, a flight-ops
 * platform for a drone operator — and everything downstream is untouched,
 * because everything downstream already speaks business events rather than
 * containers.
 *
 * An implementation cannot choose a workflow, and that is structural rather
 * than a matter of discipline: it reaches Temporal only through EventsService,
 * whose signature takes a BusinessEvent and no workflow type. The facility
 * reports what is happening; FlowGuard decides what to run about it.
 */
export abstract class FacilitySystemPort {
  /** Which organizations get this implementation. */
  abstract readonly industry: Industry;

  abstract describe(organizationId: string): FacilityDescriptor;
  abstract listJobs(organizationId: string): FacilityJob[];
  abstract getJob(organizationId: string, jobId: string): FacilityJob;

  /** Issue the job instruction. Starts the workflow and begins the sequence. */
  abstract dispatch(organizationId: string, jobId: string): Promise<FacilityJob>;

  /** Cancel a job under way. Must still release whatever it was holding. */
  abstract abort(organizationId: string, jobId: string): Promise<FacilityJob>;

  /** Restore the plan. Releases anything still in flight. */
  abstract reset(organizationId: string): FacilityJob[];
}
