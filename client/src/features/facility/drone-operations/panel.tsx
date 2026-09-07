import { cn } from '@/lib/utils';
import type { FacilityJob, FlightAttributes } from '@/types';
import { JobQueue, type JobQueueProps } from '../job-queue';

/** id, aircraft, registration, payload, flags, action. */
const GRID = 'grid grid-cols-[72px_72px_112px_84px_minmax(0,1fr)_78px] gap-x-3';

type PanelProps = Omit<
  JobQueueProps,
  'gridClassName' | 'renderCells' | 'rightAlignedColumns'
>;

/**
 * A drone operator's sortie board.
 *
 * Structurally identical to the terminal panel and sharing every line of its
 * behaviour — which is the point of the facility port. The only difference is
 * what a row says, and the flags are this industry's equivalents of IMDG class
 * and over-walkway: beyond visual line of sight, and overflight of inhabited
 * ground.
 */
export function DroneOperationsPanel(props: PanelProps) {
  return (
    <JobQueue
      {...props}
      gridClassName={GRID}
      rightAlignedColumns={[3, 5]}
      renderCells={(job) => <FlightCells job={job as FacilityJob<FlightAttributes>} />}
    />
  );
}

function FlightCells({ job }: { job: FacilityJob<FlightAttributes> }) {
  const flight = job.attributes;
  const flags = flightFlags(flight);

  return (
    <>
      <span className="font-medium">{job.id}</span>
      <span>{job.assetId}</span>
      <span>{flight.registration}</span>
      <span className="text-right">{flight.payloadKg.toFixed(1)} kg</span>
      <span className={cn('truncate text-[13px]', flags === '—' && 'text-muted-foreground')}>
        {flags}
      </span>
    </>
  );
}

/**
 * `BVLOS · over populated`, or an em dash for an unremarkable sortie.
 *
 * These are the attributes that drive the judgement, so they stay on the row
 * rather than hiding behind an expander — the same rule the terminal follows
 * for hazard class and walkway crossings.
 */
function flightFlags(flight: FlightAttributes): string {
  const flags: string[] = [];
  if (flight.bvlos) flags.push('BVLOS');
  if (flight.overPopulated) flags.push('over populated');
  return flags.length > 0 ? flags.join(' · ') : '—';
}
