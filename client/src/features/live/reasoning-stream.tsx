import { Eyebrow, Glyph, Status } from '@/components/primitives';
import { ToolboxBoundary } from '@/features/decisions/toolbox-boundary';
import { confidence, logTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Criticality,
  ReasoningTraceKind,
  isReasoningNode,
  type DecisionRecord,
  type ReasoningTraceEvent,
} from '@/types';

export interface ReasoningStreamProps {
  events: readonly ReasoningTraceEvent[];
  /** The durable record, once the graph has returned. */
  assessment: DecisionRecord | undefined;
  /** The workflow is inside the assessment step right now. */
  active: boolean;
}

/**
 * The agent's thinking, as it happens.
 *
 * Each graph node appears the moment it starts and resolves when it finishes;
 * each tool call appears beneath the node that made it, first as a call in
 * flight and then with what the network said. When the graph returns, the
 * verdict and the model's own words land underneath — verbatim, never
 * summarised — and the toolbox boundary beside them says what the model could
 * and could not have done.
 *
 * Rendered from the live events while they exist and from the recorded
 * `graphTrace` otherwise, so a page opened after the fact still shows the
 * path. The two are the same lines: the agent emits each trace line live and
 * then records it.
 */
export function ReasoningStream({ events, assessment, active }: ReasoningStreamProps) {
  const rows = events.length > 0 ? rowsFromEvents(events) : rowsFromRecord(assessment);
  const model = assessment?.modelId ?? modelFromEvents(events);

  if (rows.length === 0 && !assessment) {
    return (
      <div className="flex flex-col gap-2 border-t border-b py-4">
        {active ? (
          <p className="status-line text-[13px] text-primary">
            <Glyph kind="hollow" className="animate-pulse" />
            Waiting for the model…
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No reasoning for this operation — the workflow never reached the agent.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col border-b">
        {rows.map((row) => (
          <li key={row.key} className="border-t py-2">
            <NodeRow row={row} />

            {row.tools.length > 0 ? (
              <ol className="flex flex-col gap-1 pt-1.5 pl-6">
                {row.tools.map((tool) => (
                  <ToolRow key={tool.key} tool={tool} />
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>

      {assessment ? (
        <Verdict record={assessment} />
      ) : active ? (
        <p className="status-line text-[13px] text-muted-foreground">
          <Glyph kind="hollow" className="animate-pulse text-primary" />
          The verdict is recorded on the workflow when the graph returns.
        </p>
      ) : null}

      {model ? (
        <p className="datum text-[11px] text-muted-foreground">model {model}</p>
      ) : null}

      <ToolboxBoundary called={assessment?.toolCalls ?? callsFromRows(rows)} />
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────

interface ToolRowData {
  key: string;
  name: string;
  finished: boolean;
  arguments?: Record<string, unknown>;
  result?: string;
  failed?: boolean;
}

interface NodeRowData {
  key: string;
  node: string;
  finished: boolean;
  startedAt?: string;
  finishedAt?: string;
  /** The trace line, once the node has finished. */
  detail?: string;
  data?: Record<string, unknown>;
  tools: ToolRowData[];
}

/**
 * Fold the event stream into one row per node visit, tools beneath.
 *
 * A finish with no matching start still produces a row — a watcher who joined
 * late should see the node, not a gap.
 */
function rowsFromEvents(events: readonly ReasoningTraceEvent[]): NodeRowData[] {
  const rows: NodeRowData[] = [];

  const openNode = (node: string) =>
    [...rows].reverse().find((row) => row.node === node && !row.finished);

  for (const event of events) {
    const key = `${event.runId ?? ''}:${event.seq}`;

    switch (event.kind) {
      case ReasoningTraceKind.NODE_STARTED:
        if (!isReasoningNode(event.node)) break;
        rows.push({
          key,
          node: event.node,
          finished: false,
          startedAt: event.occurredAt,
          data: event.data,
          tools: [],
        });
        break;

      case ReasoningTraceKind.NODE_FINISHED: {
        const row = openNode(event.node);
        if (row) {
          row.finished = true;
          row.finishedAt = event.occurredAt;
          row.detail = event.detail;
          row.data = { ...row.data, ...event.data };
        } else {
          rows.push({
            key,
            node: event.node,
            finished: true,
            finishedAt: event.occurredAt,
            detail: event.detail,
            data: event.data,
            tools: [],
          });
        }
        break;
      }

      case ReasoningTraceKind.TOOL_STARTED: {
        const owner = rows[rows.length - 1];
        const tool: ToolRowData = {
          key,
          name: event.node,
          finished: false,
          arguments: asRecord(event.data?.arguments),
        };
        if (owner) owner.tools.push(tool);
        else rows.push({ key: `${key}:owner`, node: 'gather_evidence', finished: false, tools: [tool] });
        break;
      }

      case ReasoningTraceKind.TOOL_FINISHED: {
        const owner = rows[rows.length - 1];
        const open = owner?.tools.slice().reverse().find((t) => t.name === event.node && !t.finished);
        const result = stringify(event.data?.result ?? event.detail);
        const failed = Boolean(event.data?.failed);

        if (open) {
          open.finished = true;
          open.result = result;
          open.failed = failed;
        } else {
          const tool: ToolRowData = {
            key,
            name: event.node,
            finished: true,
            arguments: asRecord(event.data?.arguments),
            result,
            failed,
          };
          if (owner) owner.tools.push(tool);
          else rows.push({ key: `${key}:owner`, node: 'gather_evidence', finished: true, tools: [tool] });
        }
        break;
      }

      default:
        break;
    }
  }

  return rows;
}

/**
 * The same rows from the durable record, for a page that missed the stream.
 *
 * `graphTrace` is a flat list: node lines, with tool lines indented beneath
 * the node that made them. `toolCalls` carries the structured version of the
 * same calls, joined here by name.
 */
function rowsFromRecord(record: DecisionRecord | undefined): NodeRowData[] {
  if (!record?.graphTrace?.length) return [];

  const calls = new Map((record.toolCalls ?? []).map((call) => [call.name, call]));
  const rows: NodeRowData[] = [];

  record.graphTrace.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;

    if (line.startsWith('tool:')) {
      const owner = rows[rows.length - 1];
      const match = /^tool:(\w+) -> (.*)$/.exec(line);
      const name = match?.[1] ?? line;
      const call = calls.get(name);
      const tool: ToolRowData = {
        key: `record:${index}`,
        name,
        finished: true,
        arguments: call?.arguments,
        result: call ? stringify(call.result) : match?.[2],
        failed: call?.failed,
      };
      if (owner) owner.tools.push(tool);
      return;
    }

    const node = line.split('(')[0].trim();
    if (!isReasoningNode(node)) return;

    rows.push({
      key: `record:${index}`,
      node,
      finished: true,
      finishedAt: record.occurredAt,
      detail: line,
      tools: [],
    });
  });

  return rows;
}

function callsFromRows(rows: readonly NodeRowData[]) {
  return rows.flatMap((row) =>
    row.tools
      .filter((tool) => tool.finished)
      .map((tool) => ({
        name: tool.name,
        arguments: tool.arguments,
        result: tool.result,
        failed: tool.failed,
      })),
  );
}

function modelFromEvents(events: readonly ReasoningTraceEvent[]): string | undefined {
  const finished = [...events]
    .reverse()
    .find((e) => e.kind === ReasoningTraceKind.NODE_FINISHED && e.node === 'classify');
  const model = finished?.data?.model;
  return typeof model === 'string' ? model : undefined;
}

// ── Rendering ────────────────────────────────────────────────────────

function NodeRow({ row }: { row: NodeRowData }) {
  const { label, result } = describeNode(row);
  const at = row.finishedAt ?? row.startedAt;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className={cn(
            'datum status-line text-[13px] font-medium',
            !row.finished && 'text-primary',
          )}
        >
          <Glyph
            kind={row.finished ? 'filled' : 'hollow'}
            className={row.finished ? undefined : 'animate-pulse'}
          />
          {label}
        </span>
        <span className="min-w-0 text-[13px] text-muted-foreground">{result}</span>
      </div>

      <span className="datum shrink-0 text-[11px] text-muted-foreground">
        {at ? logTime(at) : ''}
      </span>
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolRowData }) {
  const args = tool.arguments && Object.keys(tool.arguments).length > 0
    ? JSON.stringify(tool.arguments)
    : undefined;

  return (
    <li className="flex flex-col gap-0.5">
      <span
        className={cn(
          'datum status-line text-[12px]',
          !tool.finished && 'text-primary',
          tool.failed && 'text-destructive',
        )}
      >
        <Glyph
          kind={tool.failed ? 'slash' : tool.finished ? 'filled' : 'hollow'}
          className={tool.finished ? undefined : 'animate-pulse'}
        />
        <span aria-hidden="true">→</span> {tool.name}
        {!tool.finished ? <span className="text-muted-foreground"> · calling…</span> : null}
      </span>

      {args ? <span className="datum pl-4 text-[11px] text-muted-foreground">{args}</span> : null}

      {tool.finished && tool.result ? (
        <span className="max-w-[68ch] pl-4 text-[12.5px] text-muted-foreground">{tool.result}</span>
      ) : null}
    </li>
  );
}

/**
 * A node row in two parts: which node (and which pass), and what it produced.
 *
 * The trace line is parsed leniently and falls back to the raw text — a label
 * that changed shape upstream should still be readable, just less pretty.
 */
function describeNode(row: NodeRowData): { label: string; result: string } {
  const attempt = typeof row.data?.attempt === 'number' ? row.data.attempt : undefined;
  const label =
    row.node === 'classify' && attempt !== undefined ? `classify · pass ${attempt}` : row.node;

  if (!row.finished) {
    return {
      label,
      result:
        row.node === 'classify'
          ? 'the model is reading the operation…'
          : row.node === 'gather_evidence'
            ? 'choosing which network signal to check…'
            : row.node === 'escalate'
              ? 'handing the case to a stronger model…'
              : 'checking the verdict…',
    };
  }

  const line = row.detail ?? '';

  const classify = /-> (\w+) @ ([\d.]+)/.exec(line);
  if (row.node === 'classify' && classify) {
    const safety = row.data?.safetyCritical === true ? ' · safety-critical' : '';
    return { label, result: `${classify[1]} at ${classify[2]} confidence${safety}` };
  }

  const evidence = /facts=(\d+), tools=(\d+)/.exec(line);
  if (row.node === 'gather_evidence' && evidence) {
    const tools = Number(evidence[2]);
    return {
      label,
      result: `${evidence[1]} facts · ${tools === 0 ? 'no tool needed' : `${tools} tool${tools === 1 ? '' : 's'} chosen, unprompted`}`,
    };
  }

  const inner = /^\w+\((.*)\)/.exec(line);
  if (row.node === 'validate' && inner) {
    return { label, result: inner[1] === 'ok' ? 'verdict accepted' : inner[1] };
  }

  return { label, result: inner?.[1] ?? line };
}

/** The verdict block: the classification, then the model's words, verbatim. */
function Verdict({ record }: { record: DecisionRecord }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <Eyebrow>Verdict</Eyebrow>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Status
          kind={record.criticality === Criticality.HIGH ? 'filled' : 'hollow'}
          className={cn(
            'datum text-[15px] font-medium',
            record.criticality === Criticality.HIGH && 'text-primary',
          )}
        >
          {record.criticality ?? 'UNKNOWN'}
        </Status>

        <span className="datum text-[13px]">
          confidence{' '}
          <span className="text-muted-foreground">{confidence(record.criticalityConfidence)}</span>
        </span>

        {record.error ? (
          <Status kind="slash" className="text-[13px] text-destructive">
            fallback applied — {record.error}
          </Status>
        ) : null}
      </div>

      {record.reasoning ? (
        <blockquote className="max-w-[68ch] border-l pl-4 text-[15px] leading-relaxed">
          {record.reasoning}
        </blockquote>
      ) : null}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
