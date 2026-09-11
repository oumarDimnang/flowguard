import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Loadable, Section, SkeletonText } from '@/components/primitives';
import { DecisionTrail } from '@/features/decisions/decision-trail';
import { OperationSummaryPanel } from '@/features/operations/operation-summary-panel';
import { useOperationTrail } from '@/hooks/use-operation-trail';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { duration } from '@/lib/format';
import { isExecutionFound } from '@/types';

/**
 * One operation, in full.
 *
 * The page to open when someone says "prove it". Deep-linkable and stable, so
 * it survives a refresh and can be reached straight from a row in history —
 * which matters, because a finished operation has no other route back.
 */
export function OperationDetail() {
  const { operationId } = useParams<{ operationId: string }>();
  const trail = useOperationTrail(operationId);
  const operation = trail.operation;

  return (
    <>
      <PageHeader
        trail={[
          { label: 'FlowGuard', to: '/' },
          { label: 'Operations', to: '/operations' },
          { label: 'Decision Trail' },
        ]}
        title={operation?.operationName ?? operationId ?? 'Operation'}
        description={
          operation
            ? `${operation.deviceId}${operation.site ? ` · ${operation.site}` : ''}`
            : undefined
        }
        meta={
          operation ? (
            <div className="flex flex-col gap-0.5">
              <span>{operation.operationId}</span>
              <span>{operation.workflowId}</span>
              <span>
                {operation.status} · {duration(operation.startedAt, operation.completedAt)}
              </span>
            </div>
          ) : null
        }
      />

      {trail.error ? (
        <div className="flex flex-wrap items-baseline gap-3 border-t py-3 text-sm">
          <p role="alert">
            {trail.error instanceof ApiError && trail.error.isNotFound
              ? 'This operation is not available. A scheduled scenario step may not have started yet, or the operation may not exist in this organization.'
              : 'Could not load the complete operation and decision trail. Any evidence shown below may be incomplete.'}
          </p>
          <button
            type="button"
            className="btn-line"
            onClick={trail.reload}
            disabled={trail.loading}
          >
            {trail.loading ? 'Checking...' : 'Check again'}
          </button>
          <Link to="/operations" className="link-rule">Back to operations</Link>
        </div>
      ) : null}

      {!trail.error || operation || trail.records.length > 0 ? (
        <>
      {/* Above the trail, not below it. Someone opening this page wants the
          outcome first and the evidence second — and the evidence is right
          there to check the summary against, which is the only reason a
          summary is safe to put on top of an audit record. */}
      <Section title="Summary" meta={<span>what happened, and what was decided</span>}>
        <OperationSummaryPanel
          operation={operation}
          records={trail.records}
          loading={trail.loading}
        />
      </Section>

      <Section
        title="Decision trail"
        meta={
          <span className="flex items-center gap-4">
            <span>{trail.records.length} records</span>
            {/* The same trail as a volume. Linked from the heading rather than
                buried, because the graph is what makes the agency legible —
                the list says what happened, the graph says who decided it. */}
            <Link to={`/operations/${operationId}/graph`} className="link-rule text-foreground">
              view as 3D graph ↗
            </Link>
          </span>
        }
      >
        <DecisionTrail records={trail.records} loading={trail.loading} />
      </Section>

        </>
      ) : null}

      {operationId ? <ExecutionPanel operationId={operationId} /> : null}
    </>
  );
}

/**
 * Temporal's own view, bypassing the read model.
 *
 * Collapsed by default because it is a debugging affordance, not part of the
 * argument — but worth having one click away: when the projection and the
 * workflow disagree the workflow is right, and being able to show that on
 * demand is stronger than asserting the projection can be trusted.
 */
function ExecutionPanel({ operationId }: { operationId: string }) {
  const [open, setOpen] = useState(false);
  const execution = useResource(
    (signal) => (open ? api.operations.execution(operationId, signal) : Promise.resolve(undefined)),
    [operationId, open],
  );

  return (
    <section className="border-t pt-4">
      <button type="button" className="btn-bare text-xs text-muted-foreground" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? '− ' : '+ '}raw execution · straight from Temporal
      </button>

      {open ? (
        <div className="log-row pt-3">
          <Eyebrow className="pt-1">source of truth</Eyebrow>
          <div className="flex flex-col gap-2">
            <p className="max-w-[68ch] text-[13px] text-muted-foreground">
              This snapshot reports the workflow status from Temporal when requested. It is
              separate from the decision trail above and does not refresh automatically.
            </p>

            {execution.error ? (
              <p role="alert" className="text-sm">
                {execution.error instanceof ApiError && execution.error.isNotFound
                  ? 'This operation is not available in the current organization.'
                  : 'Could not retrieve the workflow status from Temporal.'}
                {execution.data ? ' The snapshot below is from an earlier request.' : ''}
              </p>
            ) : null}

            <button
              type="button"
              className="btn-line self-start"
              onClick={execution.reload}
              disabled={execution.loading}
            >
              {execution.loading ? 'Checking...' : execution.error ? 'Retry status' : 'Refresh status'}
            </button>

            <Loadable
              loading={execution.loading}
              empty={execution.data === undefined}
              skeleton={
                <SkeletonText
                  ruled={false}
                  className="border-l pt-1 pb-2 pl-3"
                  lines={['30%', '55%', '48%', '62%', '40%', '20%']}
                />
              }
            >
              {execution.data ? (
                <pre className="datum m-0 overflow-x-auto border-l pt-1 pr-1 pb-2 pl-3 text-[11px] leading-relaxed">
                  {isExecutionFound(execution.data)
                    ? JSON.stringify(execution.data, null, 2)
                    : 'No workflow execution found — it may have been purged from Temporal history.'}
                </pre>
              ) : null}
            </Loadable>
          </div>
        </div>
      ) : null}
    </section>
  );
}
