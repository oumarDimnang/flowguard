import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ApiError } from '@/api/client';
import { PageHeader } from '@/components/layout/page-header';
import { Section, Slot, Status } from '@/components/primitives';
import { GateHold } from '@/features/facility/gate-hold';
import { DecisionGraph } from '@/features/graph/decision-graph';
import { buildDecisionGraph } from '@/features/graph/graph-model';
import { OperationSide } from '@/features/live/operation-side';
import { railSteps } from '@/features/live/rail-model';
import { ReasoningStream } from '@/features/live/reasoning-stream';
import { WorkflowRail } from '@/features/live/workflow-rail';
import { summariseOperation } from '@/features/operations/operation-summary';
import { useFacility } from '@/hooks/use-facility';
import { useSocketStatus } from '@/hooks/use-live-event';
import { useNow } from '@/hooks/use-now';
import { useOperationTrail } from '@/hooks/use-operation-trail';
import { useReasoningTrace } from '@/hooks/use-reasoning-trace';
import { duration } from '@/lib/format';
import { DecisionStep, isOperationInFlight } from '@/types';

/**
 * One operation, as it happens.
 *
 * The Control Room lands here the moment a job is dispatched, and the page
 * fills in from the socket: the workflow rail on the left ticks through its
 * steps, the agent's reasoning in the middle appears node by node while the
 * model is still thinking, the facility's job on the right moves through its
 * stations — and the decision graph underneath lights the same path in 3D.
 *
 * Everything is push-driven after one seed fetch. Refreshing mid-assessment
 * loses the live reasoning events, which are never stored, and gets the
 * recorded verdict a few seconds later; the page renders correctly from
 * either. It is also a fine page to leave open: when the operation finishes
 * it simply stops moving, and nothing on it is lost.
 */
export function LiveOperation() {
  const { operationId } = useParams<{ operationId: string }>();
  const navigate = useNavigate();

  const trail = useOperationTrail(operationId);
  const reasoning = useReasoningTrace(operationId);
  const facility = useFacility();
  const connected = useSocketStatus();

  const operation = trail.operation;
  const inFlight = operation ? isOperationInFlight(operation.status) : true;
  const now = useNow(inFlight);

  const steps = useMemo(() => railSteps(operation, trail.records, now), [operation, trail.records, now]);
  const assessing = steps.some(
    (step) => step.step === DecisionStep.CRITICALITY_ASSESSED && step.state === 'current',
  );

  const assessment = useMemo(
    () => [...trail.records].reverse().find((r) => r.step === DecisionStep.CRITICALITY_ASSESSED),
    [trail.records],
  );
  const failure = useMemo(
    () => trail.records.find((r) => r.step === DecisionStep.FAILED),
    [trail.records],
  );

  const graph = useMemo(() => buildDecisionGraph(trail.records, reasoning), [trail.records, reasoning]);
  const summary = useMemo(
    () => summariseOperation(operation, trail.records),
    [operation, trail.records],
  );

  // Dispatching from here lands on the new operation's own live page, so a
  // contrast pair plays out on one screen without a trip back to the queue.
  const dispatch = useCallback(
    async (jobId: string) => {
      const job = await facility.dispatch(jobId);
      if (job.operationId) navigate(`/operations/${job.operationId}/live`);
      return job;
    },
    [facility, navigate],
  );

  const notFound = trail.error instanceof ApiError && trail.error.isNotFound;

  // The job at its interlock, waiting on the decision this page is showing.
  // Rendered full-width between the columns and the graph: forty tonnes
  // paused short of the ground is the moment the demo exists for, and it
  // does not fit in a side column.
  const job = facility.jobs.find((candidate) => candidate.operationId === operationId);
  const holding = job !== undefined && job.gateState !== undefined && job.state === job.gateState;

  return (
    <>
      <PageHeader
        trail={[
          { label: 'FlowGuard', to: '/' },
          { label: 'Control Room', to: '/control-room' },
          { label: 'Live' },
        ]}
        title={operation?.operationName ?? operationId ?? 'Operation'}
        description={
          operation
            ? `${operation.deviceId}${operation.site ? ` · ${operation.site}` : ''}`
            : 'Waiting for the operation to be registered…'
        }
        meta={
          <div className="flex flex-col gap-0.5">
            <span>{operationId}</span>
            {operation ? <span>{operation.workflowId}</span> : null}
            <span className="flex items-center justify-end gap-3">
              {operation ? (
                <>
                  {operation.status} ·{' '}
                  {duration(
                    operation.startedAt,
                    operation.completedAt ?? new Date(now).toISOString(),
                  )}
                </>
              ) : null}
              {connected ? (
                <Status kind="filled" className="text-primary">
                  live
                </Status>
              ) : (
                <Status kind="hollow">not live</Status>
              )}
            </span>
          </div>
        }
      />

      {trail.error ? (
        <div className="flex flex-wrap items-baseline gap-3 border-t py-3 text-sm">
          <p role="alert">
            {notFound
              ? 'This operation is not available yet. It may still be registering, or it may not exist in this organization.'
              : 'Could not load the operation. Anything shown below arrived on the socket and may be incomplete.'}
          </p>
          <button type="button" className="btn-line" onClick={trail.reload} disabled={trail.loading}>
            {trail.loading ? 'Checking...' : 'Check again'}
          </button>
          <Link to="/control-room" className="link-rule">
            Back to the Control Room
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <Section
          title="Workflow"
          meta={
            <>
              <Slot ch={1}>{steps.filter((s) => s.state === 'done').length}</Slot> of{' '}
              <Slot ch={1}>{steps.length}</Slot> steps
            </>
          }
        >
          <WorkflowRail steps={steps} failure={failure} reasoningEvents={reasoning.length} />
        </Section>

        <Section
          title="Agent reasoning"
          meta={
            assessing ? (
              <Status kind="hollow" className="animate-pulse text-primary">
                thinking
              </Status>
            ) : reasoning.length > 0 ? (
              <>
                <Slot ch={2}>{reasoning.length}</Slot> live events
              </>
            ) : assessment ? (
              'from the record'
            ) : (
              'not started'
            )
          }
        >
          <ReasoningStream events={reasoning} assessment={assessment} active={assessing} />
        </Section>

        <Section title="Operation" meta={facility.descriptor?.name}>
          <OperationSide
            operationId={operationId}
            operation={operation}
            records={trail.records}
            now={now}
            jobs={facility.jobs}
            onDispatch={dispatch}
          />
        </Section>
      </div>

      {holding && job ? (
        <Section title="Gate" meta={<span>{job.gateState} · waiting on the decision above</span>}>
          <GateHold job={job} />
        </Section>
      ) : null}

      <Section
        title="Decision graph"
        meta={
          <span className="flex items-center gap-4">
            <span>
              <Slot ch={2}>{graph.agentDecisions}</Slot> agent decisions ·{' '}
              <Slot ch={1}>{graph.deterministicSteps}</Slot> deterministic steps
            </span>
            <Link to={`/operations/${operationId}/graph`} className="link-rule text-foreground">
              open full graph ↗
            </Link>
            <Link to={`/operations/${operationId}`} className="link-rule text-foreground">
              decision trail ↗
            </Link>
          </span>
        }
      >
        {graph.nodes.length > 0 ? (
          <DecisionGraph graph={graph} story={summary.narrative} />
        ) : (
          <p className="border-t border-b py-4 text-[13px] text-muted-foreground">
            The graph draws itself as the first record lands.
          </p>
        )}
      </Section>
    </>
  );
}
