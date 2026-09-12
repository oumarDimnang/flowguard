import { Link } from 'react-router';

import { Glyph } from '@/components/primitives';
import { summarise } from '@/features/decisions/decision-summary';
import { logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DecisionStep, type DecisionRecord } from '@/types';
import type { RailStep } from './rail-model';

/** What a step is waiting to become, before it has a record to describe it. */
const AWAITING: Record<string, string> = {
  [DecisionStep.DEVICE_CHECKED]: 'device status',
  [DecisionStep.CONGESTION_CHECKED]: 'congestion insights',
  [DecisionStep.CRITICALITY_ASSESSED]: 'the agent’s judgement',
  [DecisionStep.DECIDED]: 'the policy rule',
  [DecisionStep.ALLOCATED]: 'network allocation',
  [DecisionStep.QOS_STATUS_CHANGED]: 'QoD confirmation',
  [DecisionStep.RELEASED]: 'release',
};

export interface WorkflowRailProps {
  steps: readonly RailStep[];
  /** The FAILED record, if the workflow ended that way. */
  failure?: DecisionRecord;
  /** Live reasoning events so far, to annotate the assessment step while it runs. */
  reasoningEvents: number;
}

/**
 * The seven workflow steps as a vertical stepper, driven live.
 *
 * Done steps say what they recorded; the current one pulses and counts up;
 * the rest say what they are waiting for. Same step names as the audit
 * trail, so the two are obviously one thing.
 */
export function WorkflowRail({ steps, failure, reasoningEvents }: WorkflowRailProps) {
  return (
    <ol className="flex flex-col border-b">
      {steps.map(({ step, state, record, elapsedMs }) => (
        <li key={step} className="border-t py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                'datum status-line min-w-0 text-[13px] font-medium',
                state === 'current' && 'text-primary',
                (state === 'pending' || state === 'skipped') && 'text-muted-foreground',
                state === 'done' && step === DecisionStep.RELEASED && 'text-primary',
              )}
            >
              <Glyph
                kind={state === 'done' ? 'filled' : state === 'skipped' ? 'slash' : 'hollow'}
                className={state === 'current' ? 'animate-pulse' : undefined}
              />
              <span className="truncate">{step}</span>
            </span>

            <span className="datum shrink-0 text-[11px] text-muted-foreground">
              {state === 'done' && record
                ? logTime(record.occurredAt)
                : state === 'current' && elapsedMs !== undefined
                  ? `${(elapsedMs / 1000).toFixed(1)} s`
                  : ''}
            </span>
          </div>

          <p className="pl-4 text-[13px] text-muted-foreground">
            {state === 'done' && record
              ? summarise(record)
              : state === 'current'
                ? currentText(step, reasoningEvents)
                : state === 'skipped'
                  ? 'not needed on this run'
                  : `waiting for ${AWAITING[step]}`}
          </p>

          {state === 'done' && record?.rule ? (
            <Link
              to={`/policy?rule=${record.rule}&from=${record.operationId}`}
              className="datum pl-4 text-[11px] tracking-[0.06em] text-muted-foreground hover:text-primary"
              title="See this rule in the policy"
            >
              rule {record.rule} ↗
            </Link>
          ) : null}
        </li>
      ))}

      {failure ? (
        <li className="border-t py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="datum status-line text-[13px] font-medium text-destructive">
              <Glyph kind="slash" />
              {failure.step}
            </span>
            <span className="datum text-[11px] text-muted-foreground">
              {logTime(failure.occurredAt)}
            </span>
          </div>
          <p className="pl-4 text-[13px] text-muted-foreground">{summarise(failure)}</p>
        </li>
      ) : null}
    </ol>
  );
}

function currentText(step: DecisionStep, reasoningEvents: number): string {
  if (step === DecisionStep.CRITICALITY_ASSESSED) {
    return reasoningEvents > 0
      ? `the agent is reasoning · ${reasoningEvents} event${reasoningEvents === 1 ? '' : 's'} so far`
      : 'handing the operation to the agent…';
  }
  if (step === DecisionStep.QOS_STATUS_CHANGED) {
    return 'session requested · waiting for the network to confirm it…';
  }
  if (step === DecisionStep.RELEASED) {
    return 'holding connectivity for the operation…';
  }
  return 'running…';
}
