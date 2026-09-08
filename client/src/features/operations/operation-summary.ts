import { POLICY_RULES } from '@/features/policy/rules';
import { confidence } from '@/lib/format';
import {
  AssetType,
  CongestionLevel,
  Criticality,
  DecisionStep,
  NetworkAction,
  isOperationInFlight,
  type DecisionRecord,
  type Operation,
  type ToolCall,
} from '@/types';

/**
 * What happened, and what was decided, in prose.
 *
 * Derived, never generated. Every sentence below is assembled from fields that
 * are already in the trail, which is the only way a summary can sit above an
 * audit record without weakening it: a paraphrase produced by a model could
 * drift from the thing it claims to summarise, and there would be no way to
 * tell from the page which one was wrong.
 *
 * The one piece of model prose in here — `reasoning` — is quoted verbatim and
 * labelled as the model's, because `DecisionRecord.reasoning` is explicitly
 * documented as render-verbatim-do-not-summarise.
 */
export interface OperationSummary {
  /** The outcome in one line. Short enough for a table row. */
  headline: string;
  /** What happened, in order. Full sentences, each from one part of the trail. */
  narrative: string[];
  /** The rule that produced the action, and the condition it encodes. */
  verdict?: { action: NetworkAction; rule?: string; when?: string };
  /**
   * The model's own justification, and the pinned model that wrote it.
   *
   * Present only when a model actually wrote it. `Operation.reasoning` also
   * carries the *workflow's* rationale on paths where no model ran at all —
   * the unreachable guard clause, for one — and attributing deterministic
   * prose to a model would be a lie told by the one panel whose job is to
   * separate the two.
   */
  reasoning?: { text: string; model?: string };
  /**
   * What would have had to be different for the decision to be different.
   *
   * The most useful sentence on the page and the reason this is not a generic
   * event-log summary: the product's whole claim is about what does *not*
   * trigger an allocation, and that is invisible unless it is stated.
   */
  counterfactual?: string;
  /** Set when the trail is still short, so the summary does not overclaim. */
  pending?: string;
}

const RULE_CONDITIONS = new Map(POLICY_RULES.map((rule) => [rule.id, rule.when]));

/**
 * Trace lines `validate(...)` can carry, and what each one means for a reader.
 *
 * Matched on the note alone, never on the whole line, so a change to the trace
 * format drops this paragraph rather than printing something wrong about it.
 */
const VALIDATE_NOTES: Record<string, string> = {
  'downgraded-on-location-contradiction':
    'The operation described itself as safety-critical, and the network contradicted it: the asset was not at the site the job named. A hazardous-site inspection by an asset that is not at the site is not one, so the claim was downgraded rather than taken at its word.',
  'promoted-low-to-high-on-safety-flag':
    'The classification and the safety flag disagreed with each other. The flag was trusted, because it is the more consequential of the two, and the criticality was raised to match.',
  'thin-reasoning':
    'The model returned a judgement without a usable justification, so a fallback explanation was recorded in its place. The classification itself still stands.',
  'degraded=no-assessment':
    'The reasoning graph produced no result at all, so the assessment defaulted to MEDIUM rather than to either extreme.',
};

export function summariseOperation(
  operation: Operation | undefined,
  records: readonly DecisionRecord[],
): OperationSummary {
  const byStep = new Map(records.map((record) => [record.step, record]));

  const device = byStep.get(DecisionStep.DEVICE_CHECKED);
  const congestion = byStep.get(DecisionStep.CONGESTION_CHECKED);
  const assessment = byStep.get(DecisionStep.CRITICALITY_ASSESSED);
  const decided = byStep.get(DecisionStep.DECIDED);
  const allocated = byStep.get(DecisionStep.ALLOCATED);
  const qos = byStep.get(DecisionStep.QOS_STATUS_CHANGED);
  const released = byStep.get(DecisionStep.RELEASED);
  const failed = byStep.get(DecisionStep.FAILED);

  const action = decided?.action ?? operation?.action;
  const criticality = assessment?.criticality ?? operation?.criticality;
  const level = congestion?.congestion ?? operation?.congestion;
  const reachable = device?.deviceReachable ?? operation?.deviceReachable;

  // The trail is the fresher of the two sources. `operation` is a projection
  // built from these same records, so for a few hundred milliseconds after the
  // last one lands it still reads ALLOCATED while RELEASED is already sitting
  // in the list — long enough to render "still running" directly above "since
  // released". Where the record exists, it wins, and its `occurredAt` is the
  // worker's own clock rather than the server's.
  const finishedAt = operation?.completedAt ?? released?.occurredAt ?? failed?.occurredAt;
  const total = spokenDuration(operation?.startedAt, finishedAt);

  const narrative: string[] = [];

  // ── What was asked ────────────────────────────────────────────────
  if (operation) {
    narrative.push(
      `${operation.deviceId} was dispatched to ${sentenceCase(operation.operationName)}` +
        `${operation.site ? ` at ${operation.site}` : ''}.`,
    );
  }

  // ── What the network said ─────────────────────────────────────────
  if (reachable === false) {
    narrative.push(
      'The device was not reachable on the network, so there was no live link to protect. ' +
        'That check is the cheapest one in the system and runs first, which is why nothing ' +
        'further was spent finding out.',
    );
  } else if (reachable === true) {
    narrative.push(
      level
        ? `The device was reachable, and the serving cell was reporting ${level} congestion.`
        : 'The device was reachable.',
    );
  }

  // ── What the agent judged, and what it chose to look at ───────────
  const validated = validateNote(assessment?.graphTrace);

  if (assessment) {
    narrative.push(assessmentSentence(assessment));

    const tools = assessment.toolCalls ?? [];
    if (tools.length > 0) narrative.push(evidenceSentence(tools));

    if (validated) narrative.push(VALIDATE_NOTES[validated]);

    if (assessment.error) {
      narrative.push(
        `The assessment did not complete — ${assessment.error} — so the configured ` +
          'fail-open policy supplied the classification instead. It is recorded as a ' +
          'normal assessment with the error attached, rather than as a silent default.',
      );
    }
  }

  // ── What was decided, and by what ─────────────────────────────────
  const rule = decided?.rule;
  const when = rule ? RULE_CONDITIONS.get(rule) : undefined;

  if (action) {
    narrative.push(decisionSentence(action, rule, when));
  }

  // ── What the machine was doing meanwhile ──────────────────────────
  //
  // The decision trail says what was decided; it never says what the crane was
  // doing while that happened, which is the half an operator actually asked
  // about. Derived from the two timestamps rather than from the facility,
  // whose in-memory job is long gone by the time anyone reads this page.
  const held = decisionLatency(device, decided);
  if (held !== undefined && operation) {
    narrative.push(gateSentence(held, operation.assetType));
  }

  // ── What was actually done to the network ─────────────────────────
  if (allocated) {
    narrative.push(allocationSentence(allocated, qos));
  }

  if (released) {
    narrative.push(
      total === undefined
        ? 'Everything was released when the operation finished. Nothing is held longer than the operation that needed it.'
        : `Everything was released when the operation finished, ${total} after it started. ` +
          'Nothing is held longer than the operation that needed it.',
    );
  } else if (allocated && operation && !isFinished(operation) && !failed) {
    narrative.push(
      'The allocation is still held. It is released when the operation reports completion, ' +
        'and the workflow runs that release on every exit path — including a crash.',
    );
  }

  if (failed) {
    narrative.push(`The workflow failed: ${failed.error ?? 'no reason was recorded'}.`);
  }

  return {
    headline: headlineFor({
      operation,
      action,
      criticality,
      reachable,
      released: released !== undefined,
      held: total,
      failed,
    }),
    narrative,
    verdict: action ? { action, rule, when } : undefined,
    reasoning:
      assessment?.reasoning !== undefined
        ? { text: assessment.reasoning, model: assessment.modelId }
        : undefined,
    counterfactual: counterfactualFor(action, criticality, level, reachable, rule, validated),
    pending: pendingFor(operation, records, finishedAt !== undefined),
  };
}

/**
 * The outcome as a table cell: a phrase, not a sentence.
 *
 * Two constraints the prose headline cannot meet. It has to fit a column
 * roughly 150px wide — a truncated sentence loses exactly the clause that
 * carried the meaning, which is worse than no line at all — and it is read
 * down a stack of twenty rows, where a repeated sentence opening is noise.
 *
 * Derived from the read model alone, because the history table has operations
 * and not their trails, and fetching a trail per row to label a list would be
 * twenty requests to render one page.
 */
export function outcomePhrase(operation: Operation): string {
  if (operation.status === 'FAILED') return 'workflow failed';
  if (operation.deviceReachable === false) return 'unreachable · nothing spent';

  if (operation.action === undefined) return operation.status.toLowerCase();

  if (operation.action === NetworkAction.NONE) {
    if (operation.criticality === Criticality.LOW) return 'routine · left on standard';
    if (operation.congestion === CongestionLevel.LOW) return 'network healthy · withheld';
    return 'below threshold · withheld';
  }

  const held = spokenDuration(operation.startedAt, operation.completedAt);
  if (isOperationInFlight(operation.status)) return 'held now';

  return held ? `held ${held} · released` : 'released';
}

/**
 * The same outcome in one line, from the read model alone.
 *
 * Split out because the history table has the operation but not its trail, and
 * fetching every trail to label a list would be a request per row.
 */
export function summaryHeadline(operation: Operation): string {
  return headlineFor({
    operation,
    action: operation.action,
    criticality: operation.criticality,
    reachable: operation.deviceReachable,
    released: operation.completedAt !== undefined && operation.action !== NetworkAction.NONE,
    held: spokenDuration(operation.startedAt, operation.completedAt),
  });
}

// ── Sentences ───────────────────────────────────────────────────────

function assessmentSentence(assessment: DecisionRecord): string {
  const attempts = countAttempts(assessment.graphTrace);
  const score = confidence(assessment.criticalityConfidence);

  const opening =
    `The agent classified it ${assessment.criticality ?? 'unknown'}` +
    (score === '—' ? '' : ` at ${score} confidence`);

  if (attempts > 1) {
    return (
      `${opening}, over ${attempts} passes — it was not satisfied with its first reading and ` +
      'went to look for evidence before committing.'
    );
  }

  return `${opening}, on a single pass.`;
}

function evidenceSentence(tools: readonly ToolCall[]): string {
  const rendered = tools.map(
    (call) => `${call.name} — ${call.failed ? 'the call failed' : firstClause(call.result)}`,
  );

  const lead =
    tools.length === 1
      ? 'It chose one read-only signal to consult'
      : `It chose ${tools.length} read-only signals to consult`;

  return (
    `${lead}, unprompted: ${rendered.join('; ')}. ` +
    'Nothing in the prompt named a tool, and nothing in the toolbox can change the network.'
  );
}

function decisionSentence(action: NetworkAction, rule?: string, when?: string): string {
  const outcome =
    action === NetworkAction.NONE
      ? 'nothing was allocated'
      : action === NetworkAction.QOD_AND_SLICE
        ? 'Quality on Demand was requested and a network slice attached'
        : 'Quality on Demand was requested';

  if (!rule) return `The decision was ${action}, so ${outcome}.`;

  // A colon rather than a dash before the condition: several rules already
  // contain an em dash of their own ("criticality is LOW — at any congestion
  // level"), and nesting one inside another makes the sentence unparseable.
  return (
    `${rule} fired${when ? `: ${when}` : ''}. The action was ${action}, so ${outcome} — ` +
    'decided by a pure function of the recorded inputs, not by the model.'
  );
}

function allocationSentence(allocated: DecisionRecord, qos: DecisionRecord | undefined): string {
  const parts: string[] = [];

  if (allocated.qodSessionId) parts.push(`session ${allocated.qodSessionId}`);
  if (allocated.sliceId) parts.push(`slice ${allocated.sliceId}`);

  const opening =
    parts.length > 0
      ? `The network was programmed: ${parts.join(', ')}.`
      : 'The network was programmed.';

  if (!qos?.qosStatus) return opening;

  // QoD is asynchronous, and the transition is the part people assume is
  // instant. Saying it plainly is more honest than showing only the end state.
  return (
    `${opening} Quality on Demand is asynchronous, so the session was REQUESTED before the ` +
    `network confirmed it as ${qos.qosStatus}.`
  );
}

/**
 * Seconds from the first network read to the decision.
 *
 * Not the whole operation — the part the machine was actually waiting on. Both
 * timestamps come from the worker rather than the server, so this is what the
 * facility experienced and not what our clock says.
 */
function decisionLatency(
  device: DecisionRecord | undefined,
  decided: DecisionRecord | undefined,
): number | undefined {
  if (!device || !decided) return undefined;

  const ms = Date.parse(decided.occurredAt) - Date.parse(device.occurredAt);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : undefined;
}

/** What this industry calls the interlock the job pauses at. */
const GATE_NAME: Partial<Record<AssetType, string>> = {
  [AssetType.CRANE]: 'twistlock interlock',
  [AssetType.DRONE]: 'pre-flight hold',
};

/** The gate holds for 30s in every industry. facility-system.base.ts. */
const GATE_SECONDS = 30;

/**
 * The safety property, measured on this run.
 *
 * It answers the question operators actually ask — "so my crane stops and waits
 * for your AI?" — and it is only convincing with a real number in it.
 *
 * Phrased against the interlock's budget rather than as a claim that this
 * particular job paused at one. Nothing in the decision log records whether an
 * operation arrived through a facility gate or straight from a scenario, and
 * the trail must not narrate a hold that may never have happened.
 */
function gateSentence(seconds: number, asset: AssetType): string {
  const gate = GATE_NAME[asset] ?? 'gate';
  const count = `${seconds} second${seconds === 1 ? '' : 's'}`;

  if (seconds >= GATE_SECONDS) {
    return (
      `The decision landed ${count} after the first network read — longer than the ` +
      `${GATE_SECONDS} seconds a ${gate} holds for one. Work does not wait on FlowGuard: ` +
      'the interlock opens on time regardless, and a job that proceeds undecided is recorded ' +
      'as authorised by timeout rather than by decision.'
    );
  }

  return (
    `The decision landed ${count} after the first network read. A ${gate} — the last instant ` +
    `before the load is committed — holds up to ${GATE_SECONDS} seconds for one and then ` +
    'proceeds regardless, so a job dispatched through it would not have been waiting on this. ' +
    'FlowGuard can delay work at most, and never prevent it.'
  );
}

// ── Headline ────────────────────────────────────────────────────────

interface HeadlineInput {
  operation: Operation | undefined;
  action: NetworkAction | undefined;
  criticality: Criticality | undefined;
  reachable: boolean | undefined;
  released: boolean | undefined;
  held?: string;
  failed?: DecisionRecord;
}

function headlineFor({
  operation,
  action,
  criticality,
  reachable,
  released,
  held,
}: HeadlineInput): string {
  if (operation?.status === 'FAILED') return 'Failed — the workflow did not complete.';

  if (reachable === false) {
    return 'Not protected — the device was unreachable, so nothing was allocated.';
  }

  if (action === undefined) {
    return operation ? `In progress — ${operation.status.toLowerCase()}.` : 'No decision recorded.';
  }

  if (action === NetworkAction.NONE) {
    return criticality === Criticality.LOW
      ? 'Not protected — routine work, left on standard connectivity.'
      : `Not protected — ${criticality ?? 'the operation'} did not meet the threshold for allocation.`;
  }

  const what =
    action === NetworkAction.QOD_AND_SLICE ? 'QoD and a network slice' : 'Quality on Demand';

  if (released) {
    return held === undefined
      ? `Protected — ${what}, since released.`
      : `Protected — ${what} held for ${held}, then released.`;
  }

  return `Protected — ${what}, currently held.`;
}

// ── The counterfactual ──────────────────────────────────────────────

/**
 * Why the decision went the way it did, stated as what would have changed it.
 *
 * Written per case rather than from a template, because the interesting bit is
 * different in each: for a routine job it is that congestion was irrelevant,
 * and for a protected one it is that the same congestion on routine work would
 * have bought nothing.
 */
function counterfactualFor(
  action: NetworkAction | undefined,
  criticality: Criticality | undefined,
  level: CongestionLevel | undefined,
  reachable: boolean | undefined,
  rule: string | undefined,
  validated: string | undefined,
): string | undefined {
  if (reachable === false) {
    return 'A reachable device would have been assessed normally. Declining to spend on an asset that is not there is the same discipline as releasing one that no longer needs protecting.';
  }

  if (action === undefined) return undefined;

  // The sharpest case in the system, and it deserves its own sentence rather
  // than the generic one: two requests worded identically, and only the
  // network can tell them apart.
  if (validated === 'downgraded-on-location-contradiction') {
    return (
      'Had the network placed the asset at the site this job named, it would have been ' +
      'treated as safety-critical and given a network slice as well. The request itself was ' +
      'word for word the highest-priority kind this system handles — the only thing that ' +
      'separated it from one that was genuine is that it could be checked.'
    );
  }

  if (rule === 'ROUTINE_NO_ACTION') {
    return (
      `Congestion was ${level ?? 'unknown'}, and it made no difference. LOW-criticality work is ` +
      'left alone at every congestion level — that is the rule the product rests on. The same ' +
      'device, on the same cell, doing work that mattered would have been protected.'
    );
  }

  if (rule === 'HIGH_CRITICALITY_NETWORK_HEALTHY' || rule === 'MEDIUM_CRITICALITY_NETWORK_HEALTHY') {
    return (
      `The work was ${criticality ?? 'business-critical'}, but congestion was ${level ?? 'below the threshold'} — ` +
      'the network was already meeting requirements, so allocating would have spent money to ' +
      'change nothing. This is the row people misread as a miss.'
    );
  }

  if (action === NetworkAction.NONE) return undefined;

  return (
    `Criticality is what triggered this, not congestion. The same device on the same cell under ` +
    `the same ${level ?? 'network'} conditions, running routine work, would have been left on ` +
    'standard connectivity and nothing would have been spent.'
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

/** How far the trail has got, when it has not got to the end. */
function pendingFor(
  operation: Operation | undefined,
  records: readonly DecisionRecord[],
  finished: boolean,
): string | undefined {
  if (finished || !operation || isFinished(operation)) return undefined;
  if (records.length === 0) return 'No decisions recorded yet.';

  const last = records[records.length - 1];
  return `Still running — the trail ends at ${last.step}, and this summary grows as it does.`;
}

function isFinished(operation: Operation): boolean {
  return operation.status === 'COMPLETED' || operation.status === 'FAILED';
}

/** `classify(attempt=2, ...)` lines are the loop; counting them counts the passes. */
function countAttempts(trace: readonly string[] | undefined): number {
  if (!trace) return 0;
  return trace.filter((line) => line.trimStart().startsWith('classify(')).length;
}

/**
 * The notes `validate` recorded, turned into a reader's sentence.
 *
 * Only the notes are matched, never the whole line, so a change to the trace
 * format loses this paragraph rather than printing something wrong.
 */
function validateNote(trace: readonly string[] | undefined): string | undefined {
  if (!trace) return undefined;

  const line = trace.find((entry) => entry.trimStart().startsWith('validate('));
  if (!line) return undefined;

  return Object.keys(VALIDATE_NOTES).find((note) => line.includes(note));
}

/**
 * A duration as someone would say it, not as a column would align it.
 *
 * `format.duration` pads to `0m 26s` so figures line up down a table. In a
 * sentence that reads like a stopwatch reading, so this one rounds and spells
 * the unit — and returns undefined rather than an em dash, because a sentence
 * has no room for a placeholder.
 */
function spokenDuration(fromIso?: string, toIso?: string): string | undefined {
  if (!fromIso || !toIso) return undefined;

  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return undefined;

  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** A tool result is a whole sentence; the first clause is the verdict. */
function firstClause(result: unknown): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? null);
  const stop = text.search(/[.:]/);
  const clause = stop > 0 ? text.slice(0, stop) : text;
  return clause.length > 80 ? `${clause.slice(0, 80)}…` : clause;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
