import { Industry } from '@/types';
import { ContainerTerminalPanel } from './container-terminal/panel';
import { DroneOperationsPanel } from './drone-operations/panel';
import type { JobQueueProps } from './job-queue';

type PanelProps = Omit<JobQueueProps, 'gridClassName' | 'renderCells' | 'rightAlignedColumns'> & {
  industry: string | undefined;
};

/**
 * Picks the panel for an organization's industry.
 *
 * Deliberately a switch over two hand-written panels rather than one renderer
 * driven by the descriptor's columns. A component general enough to draw both a
 * container move and a flight plan would draw both blandly, and the specificity
 * is the point — the sequence strip works because it names eight real physical
 * stations, not "step 4 of 8".
 *
 * The port is generic; the panels are not. Adding an industry means writing one
 * of these, which is a morning's work and the right amount of friction.
 */
export function FacilityPanel({ industry, ...props }: PanelProps) {
  switch (industry) {
    case Industry.DRONE_OPERATIONS:
      return <DroneOperationsPanel {...props} />;

    case Industry.CONTAINER_TERMINAL:
      return <ContainerTerminalPanel {...props} />;

    default:
      // An organization in an industry FlowGuard does not model yet. Say so,
      // rather than falling back to a terminal and showing a drone operator
      // somebody else's containers.
      return (
        <p className="border-t py-6 text-muted-foreground">
          No facility panel for this industry yet.
        </p>
      );
  }
}
