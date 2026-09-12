import {
  DECISION_SEQUENCE,
  DecisionStep,
  NetworkAction,
  isOperationInFlight,
  type DecisionRecord,
  type Operation,
} from '@/types';

export type RailState = 'done' | 'current' | 'pending' | 'skipped';

export interface RailStep {
  step: DecisionStep;
  state: RailState;
  record?: DecisionRecord;
  /** Milliseconds the current step has been running. Only for `current`. */
  elapsedMs?: number;
}

/**
 * Where the workflow is, step by step.
 *
 * Pure, and kept out of the component file so the page can ask the same
 * question the rail answers — "is the agent running right now?" — without a
 * second derivation that could drift from what is drawn.
 *
 * The steps that will never come are marked as such rather than left waiting:
 * after a NONE decision there is nothing to allocate, confirm or release, and
 * after an unreachable device there is nothing at all. A rail that kept those
 * hollow would read as a workflow stuck halfway, which is the opposite of
 * what happened.
 */
export function railSteps(
  operation: Operation | undefined,
  records: readonly DecisionRecord[],
  now: number,
): RailStep[] {
  const byStep = new Map(records.map((record) => [record.step, record]));

  const finished =
    (operation !== undefined && !isOperationInFlight(operation.status)) ||
    byStep.has(DecisionStep.RELEASED) ||
    byStep.has(DecisionStep.FAILED);
  const unreachable = byStep.get(DecisionStep.DEVICE_CHECKED)?.deviceReachable === false;
  const nothingToDo = byStep.get(DecisionStep.DECIDED)?.action === NetworkAction.NONE;

  const last = records[records.length - 1];
  const since = last?.occurredAt ?? operation?.startedAt;

  let currentAssigned = false;

  return DECISION_SEQUENCE.map((step) => {
    const record = byStep.get(step);
    if (record) return { step, state: 'done', record };

    const afterDevice = step !== DecisionStep.DEVICE_CHECKED;
    const afterDecision =
      step === DecisionStep.ALLOCATED ||
      step === DecisionStep.QOS_STATUS_CHANGED ||
      step === DecisionStep.RELEASED;

    if ((unreachable && afterDevice) || (nothingToDo && afterDecision) || finished) {
      return { step, state: 'skipped' };
    }

    if (!currentAssigned) {
      currentAssigned = true;
      const elapsedMs = since ? Math.max(0, now - Date.parse(since)) : undefined;
      return { step, state: 'current', elapsedMs };
    }

    return { step, state: 'pending' };
  });
}
