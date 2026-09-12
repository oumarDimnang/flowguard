import {
  AGENT_READ_TOOLS,
  AGENT_WRITE_TOOLS,
  DECISION_SEQUENCE,
  DecisionStep,
  ReasoningTraceKind,
  isReasoningNode,
  type DecisionRecord,
  type ReasoningTraceEvent,
  type ToolCall,
} from '@/types';

/**
 * Who made a node happen.
 *
 * The distinction the whole visualisation exists to show: the model chooses
 * what to look at, deterministic code chooses what to do.
 */
export type NodeKind =
  /** A durable workflow step. Identical every run. */
  | 'deterministic'
  /** A reasoning-graph node the model routed through itself. */
  | 'agent'
  /** A read-only CAMARA tool. */
  | 'tool'
  /** The empty write socket. Not a node so much as an absence. */
  | 'write';

/**
 * `pending` is the live case: a node that has started and not yet finished —
 * the workflow step the agent is currently inside, the graph node the model is
 * currently in, the tool call waiting on the network. Drawn lit and breathing
 * faster than a reached node, so a watcher can see where the run is *now*.
 */
export type NodeStatus = 'reached' | 'pending' | 'skipped' | 'unused';

export interface GraphNode {
  id: string;
  name: string;
  kind: NodeKind;
  status: NodeStatus;
  /** One line under the sphere. */
  detail: string;
  x: number;
  y: number;
  z: number;

  /** Inspector content. */
  who: string;
  meaning: string;
  did: string;
  payload: { key: string; value: string }[];
  at?: string;
  confidence?: string;
  /** Branches this node could have taken and did not. */
  alternatives?: { name: string; why: string }[];
}

export interface GraphEdge {
  from: string;
  to: string;
  /** `rail` and `agent` are lit; `off` is a dormant hairline. */
  tone: 'rail' | 'agent' | 'off';
}

/**
 * One node the run actually reached, and the edge it arrived on.
 *
 * The edge has to be carried rather than inferred from the previous step,
 * because the traversal is not a line: the two evidence tools were both called
 * *from* gather_evidence, not one from the other. Inferring predecessors from
 * adjacency lit the first tool and left the second dark.
 */
export interface WalkStep {
  id: string;
  /** The node this step was reached from. Absent for the first. */
  from?: string;
}

export interface DecisionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Everything actually traversed, in order — drives replay and lighting. */
  walk: WalkStep[];
  agentDecisions: number;
  deterministicSteps: number;
}

/**
 * Fixed positions.
 *
 * Hand-placed, not computed. Fifteen nodes in a topology known at build time —
 * a physics layout would settle differently on every load, and this scene has
 * to look identical every time it is shown.
 *
 * Depth carries nesting: the workflow rail at z 0, the reasoning it delegates
 * to at −300, and the evidence that reasoning fetched at −520.
 */
const RAIL_Z = 0;
const AGENT_Z = -300;
const TOOL_Z = -520;

const RAIL_X: Record<string, number> = {
  [DecisionStep.DEVICE_CHECKED]: -440,
  [DecisionStep.CONGESTION_CHECKED]: -300,
  [DecisionStep.CRITICALITY_ASSESSED]: -150,
  [DecisionStep.DECIDED]: 0,
  [DecisionStep.ALLOCATED]: 150,
  [DecisionStep.QOS_STATUS_CHANGED]: 300,
  [DecisionStep.RELEASED]: 440,
};

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  classify: { x: -260, y: -170 },
  gather_evidence: { x: -110, y: -290 },
  validate: { x: -10, y: -130 },
  escalate: { x: -470, y: -330 },
};

const TOOL_POSITIONS: Record<string, { x: number; y: number }> = {
  verify_device_location: { x: -110, y: -470 },
  retrieve_device_location: { x: -400, y: -560 },
  check_device_status: { x: -400, y: -480 },
  check_network_congestion: { x: -400, y: -400 },
};

const WRITE_SOCKET = { x: 260, y: -480 };

/**
 * The reasoning graph's topology.
 *
 * Static on purpose, and this is the one part that is not derived from the
 * data: `graphTrace` records the path *taken*, never the paths *available*. So
 * the node set mirrors the graph compiled in
 * `agent/src/flowguard_agent/graph/assessment_graph.py`, and only which nodes
 * are lit comes from the trace.
 *
 * Showing `escalate` as present-but-unlit is the point — an untaken branch
 * rendered as untaken is far more convincing than one that was never drawn.
 */
const AGENT_TOPOLOGY: GraphEdge[] = [
  { from: 'classify', to: 'gather_evidence', tone: 'agent' },
  { from: 'classify', to: 'validate', tone: 'agent' },
  { from: 'classify', to: 'escalate', tone: 'off' },

  // The loops back. Both of these are real `add_edge` calls in
  // assessment_graph.py and both were missing here, which drew the two nodes
  // that exist precisely *to* re-run classification as dead ends — the exact
  // opposite of what the graph does.
  { from: 'gather_evidence', to: 'classify', tone: 'agent' },
  { from: 'escalate', to: 'classify', tone: 'off' },
];

const DETERMINISTIC_MEANING =
  'A durable workflow step. It runs identically on every operation, replays from history if the worker restarts, and is covered by table-driven tests.';

const AGENT_MEANING =
  'The model chose this. It judged its own confidence and picked which evidence to fetch. Nobody scripted this path; it can differ run to run.';

/**
 * Build the scene from one operation's decision trail.
 *
 * Three sources, and it matters which is which: the seven workflow steps and
 * their payloads come from the records; which reasoning nodes were visited
 * comes from `graphTrace`; the set of nodes that *could* have been visited is
 * static, because nothing in the data records a road not taken.
 *
 * A fourth, optional, for the live page: the reasoning trace as it streams
 * in. Until the CRITICALITY_ASSESSED record lands, those events are the only
 * account of what the agent is doing, and they light the same nodes the
 * record will. Once the record exists it wins — it is the audited version,
 * and the events were only ever a preview of it.
 */
export function buildDecisionGraph(
  records: readonly DecisionRecord[],
  live: readonly ReasoningTraceEvent[] = [],
): DecisionGraph {
  const byStep = new Map(records.map((r) => [r.step, r]));
  const assessment = byStep.get(DecisionStep.CRITICALITY_ASSESSED);

  const view = assessment
    ? viewFromRecord(assessment)
    : live.length > 0
      ? viewFromLive(live)
      : undefined;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const walk: WalkStep[] = [];

  // ── The deterministic rail ────────────────────────────────────────
  //
  // The recorded steps, plus the assessment step while the agent is still
  // inside it: the reasoning has to hang off something, and a step that is
  // running is not the same thing as one that never happened.
  const assessing = view !== undefined && assessment === undefined;
  const present = DECISION_SEQUENCE.filter(
    (step) => byStep.has(step) || (assessing && step === DecisionStep.CRITICALITY_ASSESSED),
  );

  present.forEach((step, index) => {
    const record = byStep.get(step);
    nodes.push(record ? railNode(step, record) : railPendingNode(step));

    const previous = present[index - 1];
    walk.push({ id: step, from: previous });
    if (previous) edges.push({ from: previous, to: step, tone: 'rail' });
  });

  // ── The agent's reasoning ─────────────────────────────────────────
  if (view) {
    for (const [id, position] of Object.entries(AGENT_POSITIONS)) {
      nodes.push(agentNode(id, position, view));
    }

    edges.push(...AGENT_TOPOLOGY);
    edges.push({ from: DecisionStep.CRITICALITY_ASSESSED, to: 'classify', tone: 'agent' });

    // The reasoning walk, spliced in ahead of DECIDED so replay runs in order.
    //
    // Tools hang off gather_evidence rather than off each other, which is what
    // the trace actually says: it made both calls, in parallel as far as the
    // graph is concerned, before handing back to classify. A tool still
    // waiting on the network is on the walk too — its edge is lit because the
    // call was made, whether or not it has answered yet.
    const reasoning: WalkStep[] = [];

    view.visited.order.forEach((id, index) => {
      reasoning.push({
        id,
        from: index === 0 ? DecisionStep.CRITICALITY_ASSESSED : view.visited.order[index - 1],
      });

      if (id === 'gather_evidence') {
        for (const call of view.calls) {
          if (TOOL_POSITIONS[call.name]) reasoning.push({ id: call.name, from: id });
        }
        for (const name of view.inFlightTools) {
          if (TOOL_POSITIONS[name]) reasoning.push({ id: name, from: id });
        }
      }
    });

    const insertAt = walk.findIndex((step) => step.id === DecisionStep.DECIDED);
    walk.splice(insertAt < 0 ? walk.length : insertAt, 0, ...reasoning);

    // ── Evidence ────────────────────────────────────────────────────
    const called = new Map(view.calls.map((c) => [c.name, c]));

    for (const toolName of AGENT_READ_TOOLS) {
      const position = TOOL_POSITIONS[toolName];
      if (!position) continue;

      const inFlight = view.inFlightTools.has(toolName);
      nodes.push(toolNode(toolName, position, called.get(toolName), inFlight));
      edges.push({
        from: 'gather_evidence',
        to: toolName,
        tone: called.has(toolName) || inFlight ? 'agent' : 'off',
      });
    }

    nodes.push(writeSocket());
    edges.push({ from: 'gather_evidence', to: 'WRITE_TOOLS', tone: 'off' });
  }

  return {
    nodes,
    edges,
    walk,
    agentDecisions:
      nodes.filter((n) => n.kind === 'agent' && (n.status === 'reached' || n.status === 'pending'))
        .length + (view?.calls.length ?? 0),
    deterministicSteps: present.filter((step) => byStep.has(step)).length,
  };
}

// ── What is known about the reasoning ───────────────────────────────

/**
 * The agent's reasoning as far as it is known right now.
 *
 * Built from the durable record once it exists, or from the live trace while
 * the model is still running. Both collapse to this one shape so the node
 * builders cannot tell which they were given — and the scene therefore looks
 * the same a second before the record lands as a second after.
 */
interface ReasoningView {
  visited: VisitedGraph;
  calls: ToolCall[];
  /** Tools whose call has started and not yet returned. Empty for a record. */
  inFlightTools: Set<string>;
  /** The graph node running right now, if any. Undefined for a record. */
  running: string | undefined;
  confidence?: string;
  /** When the reasoning was recorded, or the last live event's time. */
  at?: string;
}

function viewFromRecord(record: DecisionRecord): ReasoningView {
  return {
    visited: parseGraphTrace(record.graphTrace ?? []),
    calls: record.toolCalls ?? [],
    inFlightTools: new Set(),
    running: undefined,
    confidence: record.criticalityConfidence?.toFixed(2),
    at: record.occurredAt,
  };
}

/**
 * Replay the live events into the same shape `parseGraphTrace` produces.
 *
 * A node is visited when it starts, not when it finishes — that is the whole
 * point of watching live. Its trace line arrives on finish and is the very
 * line the durable `graphTrace` will carry, so the inspector reads the same
 * before and after the record lands.
 */
function viewFromLive(events: readonly ReasoningTraceEvent[]): ReasoningView {
  const visited: VisitedGraph = { nodes: new Set(), order: [], lines: new Map(), attempts: 0 };
  const calls: ToolCall[] = [];
  const inFlightTools = new Set<string>();
  let running: string | undefined;
  let confidence: string | undefined;
  let at: string | undefined;

  for (const event of events) {
    at = event.occurredAt;

    switch (event.kind) {
      case ReasoningTraceKind.NODE_STARTED: {
        if (!isReasoningNode(event.node)) break;
        visited.nodes.add(event.node);
        if (visited.order[visited.order.length - 1] !== event.node) visited.order.push(event.node);
        if (event.node === 'classify') visited.attempts += 1;
        if (!visited.lines.has(event.node)) visited.lines.set(event.node, []);
        running = event.node;
        break;
      }

      case ReasoningTraceKind.NODE_FINISHED: {
        if (event.detail) visited.lines.get(event.node)?.push(event.detail);
        if (running === event.node) running = undefined;

        const score = event.data?.confidence;
        if (event.node === 'classify' && typeof score === 'number') confidence = score.toFixed(2);
        break;
      }

      case ReasoningTraceKind.TOOL_STARTED:
        inFlightTools.add(event.node);
        break;

      case ReasoningTraceKind.TOOL_FINISHED: {
        inFlightTools.delete(event.node);

        const call: ToolCall = {
          name: event.node,
          arguments: asRecord(event.data?.arguments),
          result: event.data?.result ?? event.detail,
          failed: Boolean(event.data?.failed),
        };
        calls.push(call);

        // The same indented line the durable trace carries under
        // gather_evidence, so the inspector's payload matches later.
        const result = typeof call.result === 'string' ? call.result : JSON.stringify(call.result);
        visited.lines.get('gather_evidence')?.push(`tool:${call.name} -> ${(result ?? '').slice(0, 80)}`);
        break;
      }

      default:
        break;
    }
  }

  return { visited, calls, inFlightTools, running, confidence, at };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// ── Trace parsing ───────────────────────────────────────────────────

interface VisitedGraph {
  nodes: Set<string>;
  /** Traversal order, with repeats collapsed for replay. */
  order: string[];
  /** Raw trace lines per node, for the inspector. */
  lines: Map<string, string[]>;
  attempts: number;
}

/**
 * Read the reasoning path out of `graphTrace`.
 *
 * The trace is a flat list of strings the agent emits, not a graph — lines look
 * like `classify(attempt=1, model=…) -> HIGH @ 0.99`, with tool calls indented
 * beneath the node that made them. The node name is whatever precedes the first
 * bracket.
 *
 * Deliberately forgiving: a trace line that does not parse is skipped rather
 * than throwing. A visualisation that refuses to render because one label
 * changed shape would be worse than one missing a node.
 */
export function parseGraphTrace(trace: readonly string[]): VisitedGraph {
  const nodes = new Set<string>();
  const order: string[] = [];
  const lines = new Map<string, string[]>();
  let attempts = 0;

  for (const raw of trace) {
    const line = raw.trim();
    if (line.length === 0) continue;

    // Indented `tool:` lines belong to the node above them, not to a node of
    // their own — the tools are rendered from `toolCalls`, which is structured.
    if (line.startsWith('tool:')) {
      const owner = order[order.length - 1];
      if (owner) lines.get(owner)?.push(line);
      continue;
    }

    const name = line.split('(')[0].trim();
    if (!name || !(name in AGENT_POSITIONS)) continue;

    if (name === 'classify') attempts += 1;

    nodes.add(name);
    if (order[order.length - 1] !== name) order.push(name);

    if (!lines.has(name)) lines.set(name, []);
    lines.get(name)!.push(line);
  }

  return { nodes, order, lines, attempts };
}

// ── Node builders ───────────────────────────────────────────────────

function railNode(step: DecisionStep, record: DecisionRecord): GraphNode {
  return {
    id: step,
    name: step,
    kind: 'deterministic',
    status: 'reached',
    detail: railDetail(record),
    x: RAIL_X[step] ?? 0,
    y: 0,
    z: RAIL_Z,
    who: 'Deterministic',
    meaning: DETERMINISTIC_MEANING,
    did: railDescription(record),
    payload: railPayload(record),
    at: record.occurredAt,
  };
}

/**
 * The assessment step while the agent is still inside it.
 *
 * Exists only on the live page, and only between the congestion read and the
 * verdict: the one interval where a workflow step is in progress and the
 * interesting part is happening one plane behind it.
 */
function railPendingNode(step: DecisionStep): GraphNode {
  return {
    id: step,
    name: step,
    kind: 'deterministic',
    status: 'pending',
    detail: 'running · the agent is inside this step',
    x: RAIL_X[step] ?? 0,
    y: 0,
    z: RAIL_Z,
    who: 'Deterministic',
    meaning: DETERMINISTIC_MEANING,
    did: 'Running the agent reasoning graph now. Its verdict is recorded on this step the moment the graph returns; until then, the nodes behind it are lighting up as the model reaches them.',
    payload: [],
  };
}

function railDetail(record: DecisionRecord): string {
  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return `reachable: ${record.deviceReachable ?? 'unknown'}`;
    case DecisionStep.CONGESTION_CHECKED:
      return `congestion: ${record.congestion ?? '—'}`;
    case DecisionStep.CRITICALITY_ASSESSED:
      return `${record.criticality ?? '—'} · confidence ${record.criticalityConfidence?.toFixed(2) ?? '—'}`;
    case DecisionStep.DECIDED:
      return record.rule ? `${record.action} · ${record.rule}` : (record.action ?? '—');
    case DecisionStep.ALLOCATED:
      return record.sliceId ? 'session · slice attached' : 'session created';
    case DecisionStep.QOS_STATUS_CHANGED:
      return `→ ${record.qosStatus ?? '—'}`;
    case DecisionStep.RELEASED:
      return 'connectivity released';
    default:
      return '';
  }
}

function railDescription(record: DecisionRecord): string {
  switch (record.step) {
    case DecisionStep.DEVICE_CHECKED:
      return 'Confirmed the device is reachable on the network before any decision was attempted. The cheapest check, so it runs first.';
    case DecisionStep.CONGESTION_CHECKED:
      return 'Queried congestion insights for the serving cell. A risk signal, never a trigger on its own.';
    case DecisionStep.CRITICALITY_ASSESSED:
      return 'Ran the agent reasoning graph and recorded its verdict. The step is deterministic; what happens inside it is not.';
    case DecisionStep.DECIDED:
      return 'Evaluated eight named rules in order against the recorded inputs. The first match wins, and it is a pure function — the model has no part in this.';
    case DecisionStep.ALLOCATED:
      return 'Requested Quality on Demand and, where the rule called for it, attached a network slice for the duration of the operation.';
    case DecisionStep.QOS_STATUS_CHANGED:
      return 'Received the network callback. QoD is asynchronous: a session is REQUESTED before it is AVAILABLE.';
    case DecisionStep.RELEASED:
      return 'The operation finished. Session deleted, slice detached, holdings returned to zero — this is the half the business case depends on.';
    default:
      return '';
  }
}

function railPayload(record: DecisionRecord): { key: string; value: string }[] {
  const entries: [string, unknown][] = [
    ['criticality', record.criticality],
    ['confidence', record.criticalityConfidence],
    ['congestion', record.congestion],
    ['reachable', record.deviceReachable],
    ['action', record.action],
    ['rule', record.rule],
    ['model', record.modelId],
    ['qodSessionId', record.qodSessionId],
    ['qosStatus', record.qosStatus],
    ['sliceId', record.sliceId],
    ['error', record.error],
  ];

  return entries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
}

function agentNode(
  id: string,
  position: { x: number; y: number },
  view: ReasoningView,
): GraphNode {
  const running = view.running === id;
  const reached = view.visited.nodes.has(id);
  const status: NodeStatus = running ? 'pending' : reached ? 'reached' : 'skipped';
  const { attempts } = view.visited;

  const detail = running
    ? 'running now'
    : reached
      ? id === 'classify'
        ? `${attempts} attempt${attempts === 1 ? '' : 's'} · ${view.confidence ?? '—'}`
        : id === 'gather_evidence'
          ? `${view.calls.length} tool call · unprompted`
          : 'verdict accepted'
      : 'not taken';

  return {
    id,
    name: id,
    kind: 'agent',
    status,
    detail,
    x: position.x,
    y: position.y,
    z: AGENT_Z,
    who: running ? 'Agent · running' : reached ? 'Agent' : 'Agent · branch not taken',
    meaning: reached
      ? AGENT_MEANING
      : 'A branch the reasoning graph could have taken and did not. It is drawn because an untaken option shown as untaken is evidence; one that was never drawn is not.',
    did: agentDescription(id, reached, view.confidence),
    payload: (view.visited.lines.get(id) ?? []).map((line, index) => ({
      key: `trace ${index + 1}`,
      value: line,
    })),
    at: reached ? view.at : undefined,
    confidence: view.confidence,
    alternatives: agentAlternatives(id, reached),
  };
}

function agentDescription(id: string, reached: boolean, confidence: string | undefined): string {
  if (!reached) {
    return id === 'escalate'
      ? `Would hand the case to a costlier model when confidence falls below the floor. Not taken — the agent reached ${confidence ?? 'its threshold'} and never needed one. Cost follows risk.`
      : 'Not traversed on this run.';
  }

  switch (id) {
    case 'classify':
      return 'Classified the operation and reported its own confidence. Where that confidence was low it asked for evidence and ran again with it in hand.';
    case 'gather_evidence':
      return 'Decided the classification needed grounding, and chose which read-only CAMARA signal would settle it. Nothing in the prompt named a tool.';
    case 'validate':
      return 'Checked the verdict against the schema and the confidence floor before returning it to the workflow.';
    default:
      return '';
  }
}

function agentAlternatives(id: string, reached: boolean): { name: string; why: string }[] {
  if (!reached) return [{ name: 'classify', why: 'the path actually taken' }];

  switch (id) {
    case 'classify':
      return [{ name: 'escalate', why: 'a costlier model — not needed at this confidence' }];
    case 'gather_evidence':
      return [{ name: 'no evidence', why: 'it could have returned the first verdict unchanged' }];
    default:
      return [];
  }
}

function toolNode(
  name: string,
  position: { x: number; y: number },
  call: ToolCall | undefined,
  inFlight = false,
): GraphNode {
  const called = call !== undefined;
  const chosen = called || inFlight;

  return {
    id: name,
    name,
    kind: 'tool',
    status: called ? 'reached' : inFlight ? 'pending' : 'unused',
    detail: called ? summariseResult(call) : inFlight ? 'calling · awaiting the network' : 'read · not called',
    x: position.x,
    y: position.y,
    z: TOOL_Z,
    who: called ? 'Agent' : inFlight ? 'Agent · calling now' : 'Agent · available, not called',
    meaning: chosen
      ? 'The model selected this read-only tool on its own while gathering evidence. Nothing in the prompt asked for it.'
      : 'Available in the toolbox on this run. The model chose not to call it.',
    did: called
      ? 'Returned a read-only signal the model then re-classified against.'
      : inFlight
        ? 'Waiting for the network to answer. The result goes back into classification the moment it arrives.'
        : 'Nothing. It was an option the agent weighed and passed over.',
    payload: called
      ? [
          { key: 'arguments', value: JSON.stringify(call.arguments ?? {}) },
          { key: 'result', value: String(call.result ?? '—') },
          { key: 'failed', value: String(call.failed ?? false) },
        ]
      : [
          { key: 'access', value: 'read' },
          { key: 'called', value: inFlight ? 'in flight' : 'false' },
        ],
  };
}

function summariseResult(call: ToolCall): string {
  const result =
    (typeof call.result === 'string' ? call.result : JSON.stringify(call.result)) ?? '—';
  return result.length > 40 ? `${result.slice(0, 40)}…` : result;
}

/**
 * The empty write socket.
 *
 * Not really a node — an absence, rendered as a dark ring with nothing in it.
 * In a field of lit spheres it is the most arresting object on screen, and it
 * should be: it is the visual form of the claim that the model cannot act.
 *
 * Built from `AGENT_WRITE_TOOLS`, which is empty and is kept empty by a test in
 * the agent that fails the build if a write tool is ever added.
 */
function writeSocket(): GraphNode {
  return {
    id: 'WRITE_TOOLS',
    name: 'WRITE TOOLS',
    kind: 'write',
    status: 'unused',
    detail: AGENT_WRITE_TOOLS.length === 0 ? 'none exist' : `${AGENT_WRITE_TOOLS.length} — investigate`,
    x: WRITE_SOCKET.x,
    y: WRITE_SOCKET.y,
    z: TOOL_Z,
    who: 'Nobody — by construction',
    meaning:
      'No tool in the model’s toolbox can allocate, attach or release network capacity. It cannot act on the network because no such mechanism exists for it to call — and a test fails the build if one is ever added.',
    did: 'Nothing. This socket is empty on purpose. Allocation happens on the rail, at DECIDED and ALLOCATED, by a rule, outside the model.',
    payload: [
      { key: 'write tools', value: String(AGENT_WRITE_TOOLS.length) },
      { key: 'read tools', value: String(AGENT_READ_TOOLS.length) },
      { key: 'allocation path', value: 'DECIDED (rule) → ALLOCATED (workflow)' },
    ],
  };
}
