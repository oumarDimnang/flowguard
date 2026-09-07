import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { Eyebrow, Slot } from '@/components/primitives';
import { DecisionGraph } from '@/features/graph/decision-graph';
import { buildDecisionGraph } from '@/features/graph/graph-model';
import { useOperationTrail } from '@/hooks/use-operation-trail';
import { duration } from '@/lib/format';

/**
 * One workflow, as a volume.
 *
 * Deliberately full-bleed, breaking out of the page measure every other route
 * sits inside: this is the one screen whose job is to be looked at rather than
 * read, and it needs the room.
 *
 * It follows the app's light/dark toggle like everything else, but it is the
 * only screen where the two are not one palette inverted — see graph.css.
 */
export function DecisionGraphPage() {
  const { operationId } = useParams<{ operationId: string }>();
  const trail = useOperationTrail(operationId);

  const graph = useMemo(() => buildDecisionGraph(trail.records), [trail.records]);
  const operation = trail.operation;

  return (
    <div className="graph-scene -mx-[var(--page-gutter)] -mt-6 flex min-h-[calc(100vh-3rem)] flex-col px-[var(--page-gutter)] pt-6">
      <header className="grid grid-cols-1 items-end gap-8 pb-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-1">
          <Eyebrow style={{ color: 'var(--ink-dim)' }}>
            <Link to={`/operations/${operationId}`} style={{ color: 'inherit' }}>
              Decision Trail
            </Link>
            <span className="mx-1.5">/</span>
            Decision Graph
          </Eyebrow>

          <h1 className="datum text-2xl font-medium">{operationId}</h1>

          {operation ? (
            <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
              {operation.deviceId} · {operation.operationName}
            </p>
          ) : null}
        </div>

        <div
          className="datum flex flex-col items-start gap-1 text-xs lg:items-end"
          style={{ color: 'var(--ink-dim)' }}
        >
          <span>
            duration{' '}
            <span style={{ color: 'var(--ink)' }}>
              {duration(operation?.startedAt, operation?.completedAt)}
            </span>
          </span>
          <span className="flex gap-4">
            <span>
              <Slot ch={2}>{graph.agentDecisions}</Slot> agent decisions
            </span>
            <span>
              <Slot ch={2}>{graph.deterministicSteps}</Slot> deterministic steps
            </span>
          </span>
        </div>
      </header>

      {trail.loading && graph.nodes.length === 0 ? (
        <p className="border-t py-8" style={{ borderColor: 'var(--edge)', color: 'var(--ink-dim)' }}>
          Loading the trail…
        </p>
      ) : graph.nodes.length === 0 ? (
        <p className="border-t py-8" style={{ borderColor: 'var(--edge)', color: 'var(--ink-dim)' }}>
          No decision records for this operation, so there is nothing to draw.
        </p>
      ) : (
        <DecisionGraph graph={graph} />
      )}

      <p
        className="datum flex items-center gap-2 pt-3 pb-6 text-[11px] tracking-[0.08em] uppercase"
        style={{ color: 'var(--ink-dim)' }}
      >
        <span className="inline-block h-px w-6" style={{ background: 'var(--edge)' }} />
        the model chooses what to look at · deterministic code chooses what to do · the empty
        write-tools socket is why
      </p>
    </div>
  );
}
