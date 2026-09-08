import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { Eyebrow, Loadable, SkeletonBlock, SkeletonText, Slot } from '@/components/primitives';
import { DecisionGraph } from '@/features/graph/decision-graph';
import { buildDecisionGraph } from '@/features/graph/graph-model';
import { summariseOperation } from '@/features/operations/operation-summary';
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

  // The same derivation the decision-trail page uses, so the two screens can
  // never tell different stories about one operation.
  const summary = useMemo(
    () => summariseOperation(operation, trail.records),
    [operation, trail.records],
  );

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

      {/* Before the scene, not after it. The volume is what the agency looks
          like; this is what it did — and someone who opens this link cold
          needs the second before the first is worth anything. */}
      {graph.nodes.length > 0 ? (
        <div
          className="flex flex-col gap-1.5 border-t pt-3 pb-4"
          style={{ borderColor: 'var(--edge)' }}
        >
          <p className="text-[15px] font-medium">{summary.headline}</p>
          {summary.counterfactual ? (
            <p className="max-w-[80ch] text-[13px]" style={{ color: 'var(--ink-dim)' }}>
              {summary.counterfactual}
            </p>
          ) : null}
        </div>
      ) : null}

      <Loadable
        loading={trail.loading}
        empty={graph.nodes.length === 0}
        skeleton={<SceneSkeleton />}
        whenEmpty={
          <p className="border-t py-8" style={{ borderColor: 'var(--edge)', color: 'var(--ink-dim)' }}>
            No decision records for this operation, so there is nothing to draw.
          </p>
        }
      >
        <DecisionGraph graph={graph} story={summary.narrative} />
      </Loadable>

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

/**
 * The scene's footprint before the trail arrives. Painted in the scene's own
 * edge colour rather than the page's muted token — this is the one screen
 * whose palette is not the page's, and a paper-grey bar in the dark void would
 * be the loudest thing on it. The colours go in through the bar's own custom
 * properties so the sweep keeps running; an inline background would paint
 * over it.
 */
function SceneSkeleton() {
  const style = {
    '--skeleton-base': 'var(--edge)',
    '--skeleton-sheen': 'color-mix(in oklch, var(--edge), var(--ink-dim) 35%)',
  } as React.CSSProperties;
  return (
    <div className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: 'var(--edge)' }}>
      <SkeletonText ruled={false} lines={['46%', '72%']} style={style} />
      <SkeletonBlock height={420} style={{ ...style, opacity: 0.35 }} />
    </div>
  );
}
