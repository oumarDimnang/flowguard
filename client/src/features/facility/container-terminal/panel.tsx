import { containerFlags, weight } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ContainerAttributes, FacilityJob } from '@/types';
import { JobQueue, type JobQueueProps } from '../job-queue';

/**
 * The berth plan's column template.
 *
 * Six columns: id, crane, container, weight, flags, action. The route sits on
 * its own line beneath the row, because a stowage position cannot survive being
 * squeezed into a fraction of a narrow column.
 */
const GRID = 'grid grid-cols-[64px_68px_112px_88px_minmax(0,1fr)_78px] gap-x-3';

type PanelProps = Omit<
  JobQueueProps,
  'gridClassName' | 'renderCells' | 'rightAlignedColumns'
>;

/**
 * A container terminal's work queue.
 *
 * All the behaviour lives in JobQueue and JobRow. What is here is what a
 * container row *says* — the ISO 6346 identifier, the tonnage, the IMDG class
 * and whether the path crosses a walkway, which are the attributes that
 * actually drive the criticality judgement.
 */
export function ContainerTerminalPanel(props: PanelProps) {
  return (
    <JobQueue
      {...props}
      gridClassName={GRID}
      rightAlignedColumns={[3, 5]}
      renderCells={(job) => <ContainerCells job={job as FacilityJob<ContainerAttributes>} />}
    />
  );
}

function ContainerCells({ job }: { job: FacilityJob<ContainerAttributes> }) {
  const container = job.attributes;

  return (
    <>
      <span className="font-medium">{job.id}</span>
      <span>{job.assetId}</span>
      <span>{container.containerId}</span>
      <span className="text-right">{weight(container.grossWeightKg)}</span>
      <span
        className={cn(
          'truncate text-[13px]',
          !container.imdgClass && !container.overWalkway && 'text-muted-foreground',
        )}
      >
        {containerFlags(container)}
      </span>
    </>
  );
}
