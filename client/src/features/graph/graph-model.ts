import {
  AGENT_READ_TOOLS,
  AGENT_WRITE_TOOLS,
  DECISION_SEQUENCE,
  DecisionStep,
  type DecisionRecord,
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

export type NodeStatus = 'reached' | 'skipped' | 'unused';

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

export interface DecisionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Ordered ids of everything actually traversed — drives replay. */
  path: string[];
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
 */
export function buildDecisionGraph(records: readonly DecisionRecord[]): DecisionGraph {
  const byStep = new Map(records.map((r) => [r.step, r]));
  const assessment = byStep.get(DecisionStep.CRITICALITY_ASSESSED);

  const visited = parseGraphTrace(assessment?.graphTrace ?? []);
  const calls = assessment?.toolCalls ?? [];
  const called = new Map(calls.map((c) => [c.name, c]));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const path: string[] = [];

  // ── The deterministic rail ────────────────────────────────────────
  const present = DECISION_SEQUENCE.filter((step) => byStep.has(step));

  present.forEach((step, index) => {
    const record = byStep.get(step)!;
    nodes.push(railNode(step, record));
    path.push(step);

    const previous = present[index - 1];
    if (previous) edges.push({ from: previous, to: step, tone: 'rail' });
  });

  // ── The agent's reasoning ─────────────────────────────────────────
  if (assessment) {
    for (const [id, position] of Object.entries(AGENT_POSITIONS)) {
      const reached = visited.nodes.has(id);
      nodes.push(agentNode(id, position, reached, visited, assessment));
    }

    edges.push(...AGENT_TOPOLOGY);
    edges.push({ from: DecisionStep.CRITICALITY_ASSESSED, to: 'classify', tone: 'agent' });

    // Traversal order inside the graph, so replay walks it in sequence.
    path.splice(path.indexOf(DecisionStep.DECIDED), 0, ...visited.order);

    // ── Evidence ────────────────────────────────────────────────────
    for (const toolName of AGENT_READ_TOOLS) {
      const position = TOOL_POSITIONS[toolName];
      if (!position) continue;

      nodes.push(toolNode(toolName, position, called.get(toolName)));
      edges.push({
        from: 'gather_evidence',
        to: toolName,
        tone: called.has(toolName) ? 'agent' : 'off',
      });
    }

    nodes.push(writeSocket());
    edges.push({ from: 'gather_evidence', to: 'WRITE_TOOLS', tone: 'off' });
  }

  return {
    nodes,
    edges,
    path,
    agentDecisions: nodes.filter((n) => n.kind === 'agent' && n.status === 'reached').length +
      calls.length,
    deterministicSteps: present.length,
  };
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
  reached: boolean,
  visited: VisitedGraph,
  assessment: DecisionRecord,
): GraphNode {
  const confidence = assessment.criticalityConfidence?.toFixed(2);

  const detail = reached
    ? id === 'classify'
      ? `${visited.attempts} attempt${visited.attempts === 1 ? '' : 's'} · ${confidence ?? '—'}`
      : id === 'gather_evidence'
        ? `${assessment.toolCalls?.length ?? 0} tool call · unprompted`
        : 'verdict accepted'
    : 'not taken';

  return {
    id,
    name: id,
    kind: 'agent',
    status: reached ? 'reached' : 'skipped',
    detail,
    x: position.x,
    y: position.y,
    z: AGENT_Z,
    who: reached ? 'Agent' : 'Agent · branch not taken',
    meaning: reached
      ? AGENT_MEANING
      : 'A branch the reasoning graph could have taken and did not. It is drawn because an untaken option shown as untaken is evidence; one that was never drawn is not.',
    did: agentDescription(id, reached, assessment),
    payload: (visited.lines.get(id) ?? []).map((line, index) => ({
      key: `trace ${index + 1}`,
      value: line,
    })),
    at: reached ? assessment.occurredAt : undefined,
    confidence,
    alternatives: agentAlternatives(id, reached),
  };
}

function agentDescription(id: string, reached: boolean, assessment: DecisionRecord): string {
  if (!reached) {
    return id === 'escalate'
      ? `Would hand the case to a costlier model when confidence falls below the floor. Not taken — the agent reached ${assessment.criticalityConfidence?.toFixed(2) ?? 'its threshold'} and never needed one. Cost follows risk.`
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
): GraphNode {
  const called = call !== undefined;

  return {
    id: name,
    name,
    kind: 'tool',
    status: called ? 'reached' : 'unused',
    detail: called ? summariseResult(call) : 'read · not called',
    x: position.x,
    y: position.y,
    z: TOOL_Z,
    who: called ? 'Agent' : 'Agent · available, not called',
    meaning: called
      ? 'The model selected this read-only tool on its own while gathering evidence. Nothing in the prompt asked for it.'
      : 'Available in the toolbox on this run. The model chose not to call it.',
    did: called
      ? 'Returned a read-only signal the model then re-classified against.'
      : 'Nothing. It was an option the agent weighed and passed over.',
    payload: called
      ? [
          { key: 'arguments', value: JSON.stringify(call.arguments ?? {}) },
          { key: 'result', value: String(call.result ?? '—') },
          { key: 'failed', value: String(call.failed ?? false) },
        ]
      : [
          { key: 'access', value: 'read' },
          { key: 'called', value: 'false' },
        ],
  };
}

function summariseResult(call: ToolCall): string {
  const result = typeof call.result === 'string' ? call.result : JSON.stringify(call.result);
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
