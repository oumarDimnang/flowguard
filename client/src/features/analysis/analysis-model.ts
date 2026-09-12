import { POLICY_RULES } from '@/features/policy/rules';
import {
  CongestionLevel,
  Criticality,
  DecisionStep,
  NetworkAction,
  type DecisionRecord,
} from '@/types';

/**
 * Pattern across every decision, derived from the log.
 *
 * All of it computed here from records the server already stores, rather than
 * from counters it keeps — reset the database, replay the scenario set, get the
 * same figures. That reproducibility is the reason the numbers are worth
 * putting on a slide at all.
 *
 * The cost is that this reads a page of the decision log and aggregates in the
 * browser. Fine at demo scale, and honest: nothing here can show a number the
 * trail does not contain.
 */

export const CRITICALITY_ROWS: readonly Criticality[] = [
  Criticality.HIGH,
  Criticality.MEDIUM,
  Criticality.LOW,
];

export const CONGESTION_COLUMNS: readonly CongestionLevel[] = [
  CongestionLevel.LOW,
  CongestionLevel.MEDIUM,
  CongestionLevel.HIGH,
];

export interface MatrixCell {
  criticality: Criticality;
  congestion: CongestionLevel;
  count: number;
  /** The action that dominates this cell, or undefined when it is empty. */
  action?: NetworkAction;
}

export interface RuleCount {
  id: string;
  count: number;
  /** Off in configuration rather than merely never matched. */
  disabled?: boolean;
}

export interface HoldSample {
  at: number;
  held: number;
}

export interface AnalysisModel {
  matrix: MatrixCell[];
  rules: RuleCount[];
  holds: HoldSample[];
  /** Every time the held count came back to zero. The product, as a number. */
  returnsToZero: number;
  peak: { held: number; at: number } | undefined;
  /** Seconds from first network read to decision, one per operation. */
  latencies: number[];
  decisions: number;
  protectedCount: number;
  reductionPct: number;
}

/**
 * Every rule `decide()` can take, in evaluation order.
 *
 * Taken from the policy rather than discovered from the data: a rule that has
 * never fired has to appear with a count of zero, and it cannot be discovered
 * from records that do not mention it. One list, so this cannot fall behind the
 * Policy page again.
 */
const ALL_RULES: readonly { id: string; disabled?: boolean }[] = POLICY_RULES.map(
  ({ id, disabled }) => ({ id, disabled }),
);

export function buildAnalysis(records: readonly DecisionRecord[]): AnalysisModel {
  // Oldest first within each operation. The log arrives newest first, and an
  // operation can record DECIDED twice — the second when it stops with its
  // load committed — so "the decision" has to mean the first one, not whichever
  // the list happened to return first.
  const chronological = [...records].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  const byOperation = new Map<string, DecisionRecord[]>();
  for (const record of chronological) {
    const trail = byOperation.get(record.operationId);
    if (trail) trail.push(record);
    else byOperation.set(record.operationId, [record]);
  }

  return {
    matrix: buildMatrix(byOperation),
    rules: countRules(records),
    ...buildHolds(chronological),
    latencies: measureLatencies(byOperation),
    ...countDecisions(byOperation),
  };
}

// ── The matrix ──────────────────────────────────────────────────────

/**
 * Criticality against congestion, counted per operation.
 *
 * Assembled per operation rather than per record because the three facts land
 * on three different steps: congestion on CONGESTION_CHECKED, criticality on
 * CRITICALITY_ASSESSED, action on DECIDED. Counting records would triple every
 * cell.
 */
function buildMatrix(byOperation: Map<string, DecisionRecord[]>): MatrixCell[] {
  const cells = new Map<string, { count: number; actions: Map<NetworkAction, number> }>();

  for (const trail of byOperation.values()) {
    const criticality = trail.find((r) => r.criticality)?.criticality;
    const congestion = trail.find((r) => r.congestion)?.congestion;
    const action = trail.find((r) => r.step === DecisionStep.DECIDED)?.action;

    // An operation the guard clause ended never reaches a classification, so it
    // belongs in no cell rather than in a fabricated one.
    if (!criticality || !congestion || !action) continue;

    const key = `${criticality}|${congestion}`;
    const cell = cells.get(key) ?? { count: 0, actions: new Map() };
    cell.count += 1;
    cell.actions.set(action, (cell.actions.get(action) ?? 0) + 1);
    cells.set(key, cell);
  }

  return CRITICALITY_ROWS.flatMap((criticality) =>
    CONGESTION_COLUMNS.map((congestion) => {
      const cell = cells.get(`${criticality}|${congestion}`);
      if (!cell) return { criticality, congestion, count: 0 };

      const action = [...cell.actions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { criticality, congestion, count: cell.count, action };
    }),
  );
}

// ── Rules ───────────────────────────────────────────────────────────

function countRules(records: readonly DecisionRecord[]): RuleCount[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.step === DecisionStep.DECIDED && record.rule) {
      counts.set(record.rule, (counts.get(record.rule) ?? 0) + 1);
    }
  }

  return ALL_RULES.map((rule) => ({ ...rule, count: counts.get(rule.id) ?? 0 })).sort(
    (a, b) => b.count - a.count,
  );
}

// ── Concurrency over time ───────────────────────────────────────────

/**
 * How many operations held premium connectivity at once, over time.
 *
 * An operation's first ALLOCATED is +1 and its RELEASED is −1, replayed in
 * timestamp order. Per run, not per record: a slice attached partway through
 * emits ALLOCATED a second time for the same operation, which is still one
 * operation holding. The shape that matters is the return to zero after each
 * one — a staircase would mean capacity accumulating.
 *
 * Expects records oldest first.
 */
function buildHolds(records: readonly DecisionRecord[]): {
  holds: HoldSample[];
  returnsToZero: number;
  peak: { held: number; at: number } | undefined;
} {
  const holding = new Set<string>();
  const holds: HoldSample[] = [];
  let returnsToZero = 0;
  let peak: { held: number; at: number } | undefined;

  for (const record of records) {
    const at = Date.parse(record.occurredAt);
    if (!Number.isFinite(at)) continue;

    if (record.step === DecisionStep.ALLOCATED) {
      if (holding.has(record.runId)) continue;
      holding.add(record.runId);
    } else if (record.step === DecisionStep.RELEASED) {
      // A release whose allocation fell outside the loaded window changes
      // nothing we can draw.
      if (!holding.delete(record.runId)) continue;
    } else {
      continue;
    }

    const held = holding.size;
    holds.push({ at, held });

    if (held === 0) returnsToZero += 1;
    if (!peak || held > peak.held) peak = { held, at };
  }

  return { holds, returnsToZero, peak };
}

// ── Latency ─────────────────────────────────────────────────────────

function measureLatencies(byOperation: Map<string, DecisionRecord[]>): number[] {
  const seconds: number[] = [];

  for (const trail of byOperation.values()) {
    const first = trail.find((r) => r.step === DecisionStep.DEVICE_CHECKED);
    const decided = trail.find((r) => r.step === DecisionStep.DECIDED);
    if (!first || !decided) continue;

    const ms = Date.parse(decided.occurredAt) - Date.parse(first.occurredAt);
    if (Number.isFinite(ms) && ms >= 0) seconds.push(Math.round(ms / 1000));
  }

  return seconds.sort((a, b) => a - b);
}

// ── Totals ──────────────────────────────────────────────────────────

/** One per operation, by its first DECIDED — the same rule the server's totals use. */
function countDecisions(byOperation: Map<string, DecisionRecord[]>): {
  decisions: number;
  protectedCount: number;
  reductionPct: number;
} {
  const decided = [...byOperation.values()]
    .map((trail) => trail.find((record) => record.step === DecisionStep.DECIDED))
    .filter((record): record is DecisionRecord => record !== undefined);

  const granted = decided.filter(
    (record) =>
      record.action === NetworkAction.QOD || record.action === NetworkAction.QOD_AND_SLICE,
  ).length;

  return {
    decisions: decided.length,
    protectedCount: granted,
    reductionPct:
      decided.length === 0
        ? 0
        : Math.round(((decided.length - granted) / decided.length) * 1000) / 10,
  };
}
