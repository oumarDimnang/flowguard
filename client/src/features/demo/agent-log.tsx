import { Eyebrow, Glyph } from '@/components/primitives';
import { summariseOperation } from '@/features/operations/operation-summary';
import { POLICY_RULES } from '@/features/policy/rules';
import { confidence, containerFlags, route, weight } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AGENT_READ_TOOLS,
  AGENT_WRITE_TOOLS,
  DECISION_SEQUENCE,
  DecisionStep,
  NetworkAction,
  type ContainerAttributes,
  type DecisionRecord,
  type FacilityJob,
} from '@/types';
import type { Beat } from './beats';
import { premiumHeldBy, spoken, stamp, stepOf, type MoveTimeline } from './timeline';

export interface AgentLogProps {
  beat: Beat;
  critical: MoveTimeline;
  routine: MoveTimeline;
  /** Recorded seconds in the move this beat replays. */
  seconds: number;
}

/**
 * The agent's side of the story: the decision trail, as it was written.
 *
 * Rows are the seven steps a trail can hold, in the order the product renders
 * them everywhere else. A step appears when its record's timestamp passes the
 * playhead — never before — and the most recent one opens to show what it
 * said. Everything quoted is the record's own text.
 */
export function AgentLog({ beat, critical, routine, seconds }: AgentLogProps) {
  if (beat.source === 'illustration') return <Absent />;

  const timeline = beat.source === 'routine' ? routine : critical;

  return (
    <div className="scroll-area flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-baseline justify-between gap-4">
        <Eyebrow className="text-foreground">FlowGuard agent</Eyebrow>
        <span className="datum truncate text-[11px] text-muted-foreground">
          {timeline.move.operation.workflowId}
        </span>
      </header>

      {beat.id === 'job' ? <BusinessEvent job={timeline.move.job} /> : null}
      {beat.id === 'contrast' ? <Contrast critical={critical} routine={routine} /> : null}

      <Trail timeline={timeline} seconds={seconds} compact={beat.id === 'contrast'} />
    </div>
  );
}

// ── The trail ────────────────────────────────────────────────────────

function Trail({
  timeline,
  seconds,
  compact,
}: {
  timeline: MoveTimeline;
  seconds: number;
  compact: boolean;
}) {
  const reached = timeline.steps.filter((s) => s.at <= seconds);
  const latest = reached[reached.length - 1]?.record.step;
  const decided = stepOf(timeline, DecisionStep.DECIDED);
  const nothingToDo =
    decided !== undefined && decided.at <= seconds && decided.record.action === NetworkAction.NONE;

  const congestion = stepOf(timeline, DecisionStep.CONGESTION_CHECKED);
  const assessed = stepOf(timeline, DecisionStep.CRITICALITY_ASSESSED);
  const assessing =
    congestion !== undefined &&
    assessed !== undefined &&
    seconds >= congestion.at &&
    seconds < assessed.at;

  return (
    <ol className="flex flex-col border-b">
      {DECISION_SEQUENCE.map((step) => {
        const timed = stepOf(timeline, step);
        const done = timed !== undefined && timed.at <= seconds;
        const skipped = !timed && nothingToDo;
        const inProgress = step === DecisionStep.CRITICALITY_ASSESSED && assessing;
        const open = !compact && (step === latest || inProgress);

        return (
          <li key={step} className="border-t py-1.5">
            <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2">
              <span className="datum text-[11px] text-muted-foreground">
                {done && timed ? `t+${stamp(timed.at)}` : '—'}
              </span>

              <span
                className={cn(
                  'status-line min-w-0 text-[13px]',
                  step === latest && 'font-medium text-primary',
                  !done && 'text-muted-foreground',
                )}
              >
                <Glyph
                  kind={done ? 'filled' : skipped ? 'slash' : 'hollow'}
                  className={inProgress ? 'animate-pulse text-primary' : undefined}
                />
                <span className="truncate">
                  {done && timed
                    ? label(timed.record)
                    : skipped
                      ? `${PENDING[step]} — not needed`
                      : inProgress
                        ? 'Assessing criticality…'
                        : PENDING[step]}
                </span>
              </span>

              <span className="datum max-w-[13rem] truncate text-right text-[11px] text-muted-foreground">
                {done && timed ? source(timed.record) : ''}
              </span>
            </div>

            {open ? (
              <div className="pt-1.5 pb-1">
                {inProgress && congestion && assessed ? (
                  <Assessment
                    record={assessed.record}
                    progress={(seconds - congestion.at) / (assessed.at - congestion.at)}
                  />
                ) : done && timed ? (
                  <Detail timeline={timeline} record={timed.record} seconds={seconds} />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const PENDING: Record<string, string> = {
  [DecisionStep.DEVICE_CHECKED]: 'Device status',
  [DecisionStep.CONGESTION_CHECKED]: 'Congestion',
  [DecisionStep.CRITICALITY_ASSESSED]: 'Criticality',
  [DecisionStep.DECIDED]: 'Decision',
  [DecisionStep.ALLOCATED]: 'Allocation',
  [DecisionStep.QOS_STATUS_CHANGED]: 'QoD confirmation',
  [DecisionStep.RELEASED]: 'Release',
};

function label(record: DecisionRecord): string {
  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return record.deviceReachable ? 'Device reachable' : 'Device unreachable';
    case DecisionStep.CONGESTION_CHECKED:
      return `Congestion ${record.congestion ?? '—'}`;
    case DecisionStep.CRITICALITY_ASSESSED:
      return `${record.criticality ?? '—'} · ${confidence(record.criticalityConfidence)} confidence`;
    case DecisionStep.DECIDED:
      return actionPhrase(record.action);
    case DecisionStep.ALLOCATED:
      return 'Allocated';
    case DecisionStep.QOS_STATUS_CHANGED:
      return `QoD ${record.qosStatus ?? '—'}`;
    case DecisionStep.RELEASED:
      return 'Released';
    default:
      return record.step;
  }
}

/** The system that answered, or the rule that fired. */
function source(record: DecisionRecord): string {
  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return 'Device Status';
    case DecisionStep.CONGESTION_CHECKED:
      return 'Congestion Insights';
    case DecisionStep.CRITICALITY_ASSESSED:
      return record.modelId ?? 'model';
    case DecisionStep.DECIDED:
      return record.rule ?? '';
    case DecisionStep.ALLOCATED:
      return record.sliceId ? 'QoD + slice' : 'QoD';
    case DecisionStep.QOS_STATUS_CHANGED:
      return 'Quality on Demand';
    case DecisionStep.RELEASED:
      return 'QoD + slice';
    default:
      return '';
  }
}

function actionPhrase(action: DecisionRecord['action']): string {
  switch (action) {
    case NetworkAction.QOD_AND_SLICE:
      return 'Decided: QoD + network slice';
    case NetworkAction.QOD:
      return 'Decided: Quality on Demand';
    case NetworkAction.NONE:
      return 'Decided: nothing to allocate';
    default:
      return 'Decided';
  }
}

// ── What each step said ──────────────────────────────────────────────

function Detail({
  timeline,
  record,
  seconds,
}: {
  timeline: MoveTimeline;
  record: DecisionRecord;
  seconds: number;
}) {
  const job = timeline.move.job;

  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return (
        <Prose>
          <span className="datum">
            {job.assetId} · {job.devicePhoneNumber}
          </span>{' '}
          answered on the network. The cheapest check runs first — FlowGuard never allocates to a
          device that is not there.
        </Prose>
      );

    case DecisionStep.CONGESTION_CHECKED:
      return (
        <Prose>
          The cell’s level, not the crane’s: every device on it sees the same {record.congestion}.
          On its own it decides nothing.
        </Prose>
      );

    case DecisionStep.CRITICALITY_ASSESSED:
      return <Assessment record={record} progress={1} />;

    case DecisionStep.DECIDED:
      return <Decision record={record} />;

    case DecisionStep.ALLOCATED: {
      const gate = timeline.gate;
      return (
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
          <Term>session</Term>
          <Value>
            {record.qodSessionId} · {record.qosStatus}
          </Value>
          {record.sliceId ? (
            <>
              <Term>slice</Term>
              <Value>{record.sliceId} · attached</Value>
            </>
          ) : null}
          {gate && seconds >= gate.to ? (
            <>
              <Term>hoist</Term>
              <Value>
                authorised t+{stamp(gate.to)} · by {timeline.move.job.gateAuthorisedBy?.toLowerCase()}
              </Value>
            </>
          ) : null}
        </dl>
      );
    }

    case DecisionStep.QOS_STATUS_CHANGED:
      return (
        <Prose>
          Confirmed {record.qosStatus}. Quality on Demand is asynchronous: with no callback from the
          mock network, the workflow polled after its 10 s wait. Nokia’s callback arrives as a
          webhook and is relayed to the workflow as a signal.
        </Prose>
      );

    case DecisionStep.RELEASED: {
      const summary = summariseOperation(timeline.move.operation, timeline.move.records);
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12.5px]">
            “{record.reasoning}”{' '}
            <span className="text-muted-foreground">
              · premium held {spoken(premiumHeldBy(timeline, seconds))}
            </span>
          </p>
          {summary.counterfactual ? (
            <p className="text-[12px] text-muted-foreground">{summary.counterfactual}</p>
          ) : null}
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * The assessment graph's path, line by line, and then the verdict.
 *
 * While the assessment is still running in the replay, its lines appear in
 * order across the window it took. The order is the recording's; the pacing
 * inside the window is not recorded, and nothing here claims it was.
 */
function Assessment({ record, progress }: { record: DecisionRecord; progress: number }) {
  const lines = (record.graphTrace ?? []).map(parseTrace);
  const finished = progress >= 1;
  const shown = finished ? lines.length : Math.floor(Math.max(0, progress) * (lines.length + 1));

  return (
    <div className="flex flex-col gap-2">
      <ol className="datum flex flex-col gap-0.5 text-[11.5px]">
        {lines.slice(0, shown).map((line, index) => (
          <li
            key={index}
            className={cn('grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-2', line.nested && 'pl-3')}
          >
            <span className={line.nested ? 'text-primary' : undefined}>{line.node}</span>
            <span className="text-muted-foreground">{line.result}</span>
          </li>
        ))}
        {finished ? null : <li className="text-muted-foreground">…</li>}
      </ol>

      {finished && record.reasoning ? (
        <figure className="m-0 flex flex-col gap-1 border-l-2 border-l-primary pl-3">
          <blockquote className="m-0 text-[12.5px] leading-snug">“{record.reasoning}”</blockquote>
          <figcaption className="datum text-[10.5px] text-muted-foreground">
            {record.modelId} · verbatim · toolbox {AGENT_READ_TOOLS.length} read,{' '}
            {AGENT_WRITE_TOOLS.length} write
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

interface TraceLine {
  node: string;
  result: string;
  nested?: boolean;
}

/** One graph-trace line, split into the node and what it produced. Unknown shapes pass through. */
function parseTrace(line: string): TraceLine {
  const classify = /^classify\(attempt=(\d+), model=[^)]+\) -> (\w+) @ ([\d.]+)/.exec(line);
  if (classify) {
    return { node: `classify · pass ${classify[1]}`, result: `${classify[2]} @ ${classify[3]}` };
  }

  const evidence = /^gather_evidence\(facts=(\d+), tools=(\d+)\)/.exec(line);
  if (evidence) {
    const tools = Number(evidence[2]);
    return {
      node: 'gather_evidence',
      result: `${evidence[1]} facts · ${tools} tool${tools === 1 ? '' : 's'} chosen`,
    };
  }

  const tool = /^\s*tool:(\w+) -> (.+)$/.exec(line);
  if (tool) return { node: tool[1], result: tool[2], nested: true };

  const node = /^(\w+)\((.*)\)/.exec(line.trim());
  if (node) return { node: node[1], result: node[2] };

  return { node: line.trim(), result: '' };
}

function Decision({ record }: { record: DecisionRecord }) {
  const rule = POLICY_RULES.find((candidate) => candidate.id === record.rule);

  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
      <Term>rule</Term>
      <Value>
        <Breakable text={record.rule ?? '—'} />
      </Value>
      {rule ? (
        <>
          <Term>when</Term>
          <dd className="m-0">{rule.when}</dd>
        </>
      ) : null}
      <Term>inputs</Term>
      <Value>
        {record.criticality} · {record.congestion} · reachable {record.deviceReachable ? 'yes' : 'no'}
      </Value>
      <Term>by</Term>
      <dd className="m-0 text-muted-foreground">
        <span className="datum text-foreground">decide()</span>, a pure function of those inputs. The
        model has no write tools, so it cannot allocate whatever it concludes.
      </dd>
    </dl>
  );
}

// ── Beat-specific blocks ─────────────────────────────────────────────

function BusinessEvent({ job }: { job: FacilityJob<ContainerAttributes> }) {
  return (
    <section className="flex flex-col gap-1.5 border-t pt-2">
      <Eyebrow>Business event · from the terminal system</Eyebrow>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
        <Term>asset</Term>
        <Value>
          {job.assetId} · {job.devicePhoneNumber}
        </Value>
        <Term>container</Term>
        <Value>{job.attributes.containerId}</Value>
        <Term>gross</Term>
        <Value>{weight(job.attributes.grossWeightKg)}</Value>
        <Term>flags</Term>
        <Value>{containerFlags(job.attributes)}</Value>
        <Term>route</Term>
        <Value>{route(job.from, job.to)}</Value>
        <Term>expected</Term>
        <Value>{job.expectedDurationSeconds} s</Value>
      </dl>
      <p className="text-[12px] leading-snug text-muted-foreground">{job.summary}</p>
    </section>
  );
}

function Contrast({ critical, routine }: { critical: MoveTimeline; routine: MoveTimeline }) {
  const rows = [critical, routine].map((timeline) => {
    const assessed = stepOf(timeline, DecisionStep.CRITICALITY_ASSESSED)?.record;
    const decided = stepOf(timeline, DecisionStep.DECIDED)?.record;
    const congestion = stepOf(timeline, DecisionStep.CONGESTION_CHECKED)?.record;
    return {
      id: timeline.move.job.id,
      container: timeline.move.job.attributes,
      congestion: congestion?.congestion ?? '—',
      criticality: `${assessed?.criticality ?? '—'} · ${confidence(assessed?.criticalityConfidence)}`,
      rule: decided?.rule ?? '—',
      action: decided?.action ?? '—',
      held: spoken(timeline.premium ? timeline.premium.to - timeline.premium.from : 0),
    };
  });
  const [later, earlier] = rows;
  const apart = Math.round((critical.origin - routine.origin) / 1000);

  const line = (term: string, a: React.ReactNode, b: React.ReactNode, same = false) => (
    <>
      <Term>{term}</Term>
      <Value className={same ? 'text-muted-foreground' : undefined}>{a}</Value>
      <Value className={same ? 'text-muted-foreground' : 'text-primary'}>{b}</Value>
    </>
  );

  return (
    <section className="flex flex-col gap-1.5 border-t pt-2">
      <Eyebrow>Same crane, same cell, dispatched {apart} s apart</Eyebrow>
      <dl className="grid grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
        <span />
        <span className="eyebrow">{earlier.id}</span>
        <span className="eyebrow">{later.id}</span>
        {line('container', earlier.container.containerId, later.container.containerId)}
        {line('gross', weight(earlier.container.grossWeightKg), weight(later.container.grossWeightKg))}
        {line('flags', containerFlags(earlier.container), containerFlags(later.container))}
        {line('congestion', earlier.congestion, later.congestion, earlier.congestion === later.congestion)}
        {line('criticality', earlier.criticality, later.criticality)}
        {line('rule', <Breakable text={earlier.rule} />, <Breakable text={later.rule} />)}
        {line('action', earlier.action, later.action)}
        {line('premium', earlier.held, later.held)}
      </dl>
    </section>
  );
}

function Absent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-baseline justify-between gap-4">
        <Eyebrow className="text-foreground">FlowGuard agent</Eyebrow>
        <span className="datum text-[11px] text-muted-foreground">not deployed</span>
      </header>

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-[15px] font-medium">Nobody is deciding for this lift.</p>
        <p className="text-[13px] text-muted-foreground">
          Without FlowGuard the network has no idea which of its devices is carrying forty tonnes
          over people. The crane gets the same share of a busy cell as a handheld in the yard.
        </p>
      </div>

      <ol className="flex flex-col border-b text-[13px]">
        <li className="border-t py-1.5">
          <span className="status-line">
            <Glyph kind="filled" /> The cell congests as the shift changes over.
          </span>
        </li>
        <li className="border-t py-1.5">
          <span className="status-line">
            <Glyph kind="filled" /> The operator’s video uplink degrades with it.
          </span>
        </li>
        <li className="border-t py-1.5 text-destructive">
          <span className="status-line">
            <Glyph kind="slash" /> The safety system stops the crane, load in the air.
          </span>
        </li>
      </ol>

      <p className="text-[12px] text-muted-foreground">
        Next: the same kind of lift, recorded with FlowGuard running.
      </p>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-snug text-muted-foreground">{children}</p>;
}

function Term({ children }: { children: React.ReactNode }) {
  return <dt className="eyebrow pt-[3px]">{children}</dt>;
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={cn('datum m-0 min-w-0 break-words', className)}>{children}</dd>;
}

/** A rule id that may wrap at its underscores rather than overflow its column. */
function Breakable({ text }: { text: string }) {
  const parts = text.split('_');
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 ? (
            <>
              _<wbr />
            </>
          ) : null}
        </span>
      ))}
    </>
  );
}
