import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Section } from '@/components/primitives';
import { DecisionTrail } from '@/features/decisions/decision-trail';
import { OperationSummaryPanel } from '@/features/operations/operation-summary-panel';
import { useOperationTrail } from '@/hooks/use-operation-trail';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/api/endpoints';
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
      <button type="button" className="btn-bare text-xs text-muted-foreground" onClick={() => setOpen((o) => !o)}>
        {open ? '− ' : '+ '}raw execution · straight from Temporal
      </button>

      {open ? (
        <div className="log-row pt-3">
          <Eyebrow className="pt-1">source of truth</Eyebrow>
          <div className="flex flex-col gap-2">
            <p className="max-w-[68ch] text-[13px] text-muted-foreground">
              Everything above is a projection built from emitted decision events. This is the
              workflow history itself. Where the two disagree, this one is correct.
            </p>

            {execution.loading ? <span className="datum text-xs text-muted-foreground">loading…</span> : null}

            {execution.data ? (
              <pre className="datum m-0 overflow-x-auto border-l pt-1 pr-1 pb-2 pl-3 text-[11px] leading-relaxed">
                {isExecutionFound(execution.data)
                  ? JSON.stringify(execution.data, null, 2)
                  : 'No workflow execution found — it may have been purged from Temporal history.'}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
