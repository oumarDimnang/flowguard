# FlowGuard — Engineering Context

Full working context for this repository: what it is, what is built, why each
significant decision was made, and what will bite you. Written so a session with
no prior history can pick up work without re-deriving anything.

Last updated after the Langfuse and prompt-extraction work. 32 commits.

---

## 1. What this is

A GSMA MENA hackathon submission by team **PulseGrid**. Theme: **Smart Mobility
and Logistics Agents**.

FlowGuard is an AI agent that allocates premium 5G connectivity to industrial
operations only while they need it. It reads business events from facility
systems, judges how business-critical each one is, checks live network
conditions, requests Quality on Demand (and a network slice for the most
critical), then releases everything when the operation ends.

**The thesis, which everything else serves:** criticality triggers action;
congestion never does on its own. The same drone under the same HIGH congestion
gets nothing for routine mapping and a slice for a pipeline leak inspection.

**Why this is a 2026 project:** buying guaranteed network quality used to mean a
telco contract negotiation. CAMARA turned it into an API call. That is the only
reason this is buildable.

### The commercial framing

Not "an AI service provider". FlowGuard is a **connectivity decisioning layer**
that sits between operational systems and the programmable network. The AI is a
component; the product is the decision.

The strongest go-to-market angle is that operators (Nokia, Batelco, stc) have
built QoD and slicing and lack demand — FlowGuard creates the reason to buy
them. That is a channel play, not direct sales.

---

## 2. Repository layout

```
flowguard/
├── server/     NestJS 12 — public ingress, BFF, sole MongoDB writer
├── agent/      Python 3.12 — Temporal worker, LangGraph reasoning, CAMARA I/O
├── client/     React + Vite + Tailwind — NOT STARTED (4 .gitkeep files)
└── docs/
```

### Current state

| | Files | Tests | Notes |
|---|---|---|---|
| `server/` | 58 `.ts` | 12 passing | build clean, ruff/lint clean |
| `agent/` | 43 `.py` | 96 passing | ruff clean |
| `client/` | 0 | — | not started |

**Verified live** against a running Temporal dev server, not just unit-tested:
the drone contrast pair, false-claim detection via location, duplicate-event
idempotency, release surviving a missing completion signal, and both services
completing correctly with the other side down.

**Never run:** a real LLM. `LLM_PROVIDER=mock` everywhere so far, which means
the offline keyword classifier — not a model — produced every result to date.
This is the single most important gap.

---

## 3. Architecture and why

```
client → server → Temporal → agent → Nokia CAMARA APIs
                     ↑                      │
                     └── webhooks ← server ─┘
```

### The agent has no inbound port

`agent/` is a pure Temporal worker: it connects *outbound* to the task queue and
polls. Nokia's webhooks terminate at NestJS and arrive as Temporal **signals**.
This removes the internal REST API, the relay endpoints, and the agent's entire
attack surface. One TLS surface, one tunnel on demo day.

### Why Temporal rather than LangGraph owning the loop

Of the seven steps in the loop, exactly one is an LLM call — the rest are
network I/O, a pure function and a wait. That is a durable workflow, not an
agent loop.

More decisively: FlowGuard's business case is *release*, not allocation. A
stranded QoD session is bounded by its mandatory `duration` TTL, but **a slice
attachment has no TTL at all** — nothing expires it. If the release never runs,
the device stays attached indefinitely. Temporal's `try/finally` plus retry
policy makes that structural rather than aspirational.

LangGraph's checkpointer only makes a graph *resumable*; something must still
come back and re-invoke it. Temporal owns the clock.

### Why LangGraph is still here

It runs the criticality assessment *inside* a Temporal activity, and it does
real work: confidence-based evidence gathering and model escalation. It is also
the component that makes "an AI agent layer that orchestrates CAMARA APIs"
literally true rather than a generous reading.

**Hard rule:** LangGraph never appears in workflow code, and it has **no
checkpointer**. Temporal owns durability; a second persistence layer inside an
activity that is retried as a whole would be actively wrong.

### The agency boundary — the most important design decision

```
READS   (device status, congestion, location)  → the agent chooses
WRITES  (create QoD, attach slice, release)    → deterministic code only
```

The model decides *what is true* and *what to look at*. `policy/rules.py`
decides *what to do*. A language model must never be the thing that commits a
network slice for a suspended 40-tonne load.

This is enforced by **absence**: `tools/network_tools.py` exposes four read
tools and no write tool, so the model has no way to allocate regardless of what
it decides. `test_toolbox_exposes_no_write_capability` fails the build if
anyone adds one.

---

## 4. Cross-language contracts

Nothing enforces these at compile time. A mismatch surfaces as a workflow that
starts and then sits unclaimed on a task queue, or a signal that silently goes
nowhere.

| Contract | Server | Agent |
|---|---|---|
| Workflow type | `temporal.constants.ts` → `WORKFLOW_TYPES` | `shared/constants.py` |
| Signal names | `SIGNALS` | `@workflow.signal(name=...)` |
| Task queue | `TEMPORAL_TASK_QUEUE` | `TEMPORAL_TASK_QUEUE` |
| Enum values | `common/domain/enums.ts` | `shared/models.py` |
| Decision payload | `RecordDecisionDto` | `activities/emit.py` |
| Business event | `events/domain/business-event.ts` | `BusinessEvent.from_wire()` |

`INTERNAL_API_TOKEN` must be byte-identical in both `.env` files or the agent's
decision events get 401'd and the dashboard silently stays empty.

**Wire format is camelCase** (it originates in TypeScript). Python reconstructs
via `from_wire()` classmethods rather than deserialising directly, which keeps
the Python side idiomatic.

---

## 5. Hard-won facts

Each of these cost real time to discover. Do not re-derive them.

### Nokia / CAMARA

- **QoS profile is `DOWNLINK_M_UPLINK_L`**, verified against this account's
  playground. **Not `QOS_L`** — that is the TypeScript SDK's name and this API
  rejects it. Note the asymmetry: medium down, *large up*. That is the shape a
  camera-heavy industrial asset needs, and the opposite of a consumer plan.
- **Auth is the RapidAPI key alone.** `x-rapidapi-key` + `x-rapidapi-host`
  headers. No OAuth bearer, despite `NaC Authorization Server` being in the
  catalogue.
- **Base URL is regional:** `https://network-as-code.p-eu.apihub.nokia.io`.
- **Congestion levels are `"Low" | "Medium" | "High"`** with exactly that
  casing. CAMARA also emits `"None"` for an uncongested cell — mapped to `LOW`
  in the provider, since the policy vocabulary starts at Low.
- **Congestion requires a subscription before queries return anything.** It is a
  bootstrap step, not a per-request call.
- **A slice takes minutes to provision** (create → AVAILABLE → activate →
  OPERATING). It cannot be created inside a decision window. Pre-provision it;
  only attach/detach per operation.
- **Slice modification is unsupported.** Create and delete only.
- **QoD is asynchronous** — `qosStatus` is `REQUESTED` before `AVAILABLE`.
- **`duration` is mandatory** and doubles as a TTL backstop.
- Nokia ships **two incompatible SDK generations**; most tutorials show the old
  one. We use direct HTTP instead — see §6.
- Nokia has an **MCP server**. Deliberately not used — see §6.

### Toolchain

- **NestJS 12 packages are ESM-only** (`"type": "module"`, no CJS build). Jest's
  CommonJS runtime cannot require them — hence Vitest.
- **`unplugin-swc` is mandatory with Vitest**, not optional: the default esbuild
  transform does not emit decorator metadata, and Nest's constructor injection
  reads exactly that. Without it every provider resolves to `undefined`.
- **TypeScript 6, not 7.** `@nestjs/cli@12` pins `~6.0.2`. TS 6 also requires an
  explicit `rootDir` and rejects `baseUrl`.
- **`@nestjs/terminus` has no v12 release** — peers stop at `^11`. Health is
  hand-rolled.
- **Langfuse is 4.x**, and `start_as_current_span` does **not** exist there —
  only `start_as_current_observation(as_type="span", ...)`. `start_span()` in
  `langfuse_setup.py` tries both.
- **Langfuse's LangChain callback needs the full `langchain` package**, not just
  `langchain-core`.

---

## 6. Decisions and rationale

Re-litigating these wastes time. Each was made for a reason.

**Direct HTTP instead of the Nokia SDK.** Two incompatible SDK generations
exist, and neither is guaranteed to target this account's regional API hub. The
REST contract was read from the account's own playground, so it is the thing
actually known to work. `httpx` was already a dependency.

**Own tool layer instead of Nokia's MCP server.** If the agent's tools come from
a remote server and that server is unreachable, the agent has *no tools* — not
degraded, absent. Our tools are backed by `NetworkProvider`, so the mock keeps
the full toolset offline. Nokia's MCP also fronts ~17 API families, almost
certainly including QoD writes, which would put allocation back in the model's
hands. MCP is the better long-term integration; not the right trade before a
demo.

**Pydantic at boundaries, dataclasses inside.** The provider previously used
`.get()` chains. `bool(body.get("reachable"))` returns `False` when the field is
absent — so a renamed field would have reported a healthy device as
*unreachable*, fired the guard clause, and left every operation unprotected with
nothing logged. A parse failure becoming a safety decision. Fields the decision
depends on are now required with no default; `extra="ignore"` keeps forward
compatibility.

**`decide()` is a pure function, never a model call.** Auditable, exhaustively
testable (36 tests cover the full space), reproducible. The model classifies
criticality; rules map that to an action.

**Prompts as Markdown in `prompts/templates/`.** They are the highest-leverage
text in the project, reviewed by people who do not read Python, and a prompt
change should produce a readable diff. Loaded via `importlib.resources` and
declared as wheel artifacts, or they vanish from an installed package.

**Emit is non-fatal; tracing is non-fatal.** A dashboard being down must not stop
the agent protecting a crane. Both log and continue after retries.

**Deterministic workflow IDs** (`operation-{eventId}`). Temporal rejects a
duplicate for a running execution, so a re-submitted business event cannot start
a second workflow holding a second paid session.

**Mock providers are demo mode, not stubs.** The hackathon guide says outright:
*"cache demo data; live API calls fail at the worst moment."* Congestion is
scripted, not random, because the contrast demo depends on two events seeing
identical conditions.

---

## 7. Key files

### `agent/`

| Path | What |
|---|---|
| `workflows/critical_operation.py` | the lifecycle; `finally: release` is the guarantee |
| `policy/rules.py` | `decide()` — the auditable decision |
| `graph/assessment_graph.py` | LangGraph: classify → gather evidence → escalate → validate |
| `graph/evidence.py` | which tool to call; heuristic + LLM implementations |
| `tools/network_tools.py` | the read-only toolbox — the safety boundary |
| `network/provider.py` | the mock ↔ Nokia swap point |
| `network/schemas.py` | Pydantic CAMARA payloads |
| `prompts/templates/*.md` | the criticality taxonomy and tool-selection prompt |
| `observability/temporal_interceptor.py` | one Langfuse trace per workflow run |
| `scripts/verify_nokia.py` | probes all five endpoints, reports which paths are wrong |

### `server/`

| Path | What |
|---|---|
| `temporal/` | the only place `@temporalio/client` is imported |
| `temporal/temporal.constants.ts` | the cross-language contract |
| `decision-log/decision-log.service.ts` | dedupe → append → project → publish |
| `webhooks/` | the single public Nokia sink; correlation carried in the sink URL |
| `simulator/scenarios/` | the three demo scenarios |

---

## 8. Running it

Everything below works with **no API keys** — mock network provider, offline
classifier.

```bash
temporal server start-dev --db-filename temporal.db     # :7233, UI on :8233
cd agent && uv run flowguard-worker
cd agent && uv run pytest                                # 96 tests
cd server && npm test                                    # 12 tests
```

The server additionally needs `MONGODB_URI` in `server/.env`.

To go live: set `NETWORK_PROVIDER=nokia` + `NOKIA_API_KEY`, and
`LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY`. Run
`scripts/verify_nokia.py` first — three endpoint paths are still inferred.

---

## 9. What is left

**Blocking, and owned by the team (all under an hour):**

1. **Set `OPENROUTER_API_KEY`.** Until this happens there is no AI in the AI
   agent layer — every result so far came from the keyword classifier. This is
   also the first real read on whether GPT-5.6 Luna's reasoning is good enough
   to render on screen.
2. **Run `scripts/verify_nokia.py`.** Confirms or corrects three inferred paths:
   device reachability, congestion query, slice attach.
3. **MongoDB Atlas cluster** (Frankfurt `eu-central-1`, *not* a Middle East
   region — MongoDB currently advises against both after June 2026 damage).
   Watch the IP allowlist; it is the most common way Atlas kills a demo.

**Engineering:**

4. **`client/`** — the dashboard. The last missing piece, and the guide says
   explicitly that judges want the reasoning trace on screen.
5. **Mid-operation re-decision.** `congestion_updated` signals arrive and are
   stored but do not re-trigger `decide()`. Correct for a crane on a fixed quay;
   leaves value on the table for a moving ambulance. Roughly an hour in
   `_monitor()`.
6. **Server ↔ agent never tested together** — blocked on MongoDB.

---

## 10. Hackathon constraints

**Mandatory**

| Requirement | Status |
|---|---|
| ≥1 CAMARA API via Nokia NaC | ✅ seven |
| AI agent layer orchestrating them | ⚠️ built, but no real model has run |
| Not user-triggered actions | ✅ no approve button exists |
| Original code | ✅ (guide approves Claude/Cursor/Copilot as coding tools) |
| One of seven themes | ✅ Smart Mobility and Logistics Agents |
| Agent built only with approved tools | ⚠️ see below |

**The tooling caveat.** The guide restricts the *AI agent component* to listed
tools. LangGraph, LangChain, OpenRouter and MongoDB Atlas are all listed.
**Temporal and Langfuse are not.** The user decided to proceed anyway.

The mitigation costs nothing and is true: describe the **AI agent layer as
LangGraph + LangChain + OpenRouter**, with Temporal as durable infrastructure
alongside the database. LangGraph genuinely is where the reasoning happens.
Langfuse is off by default and is dev tooling — do not name it in the agent-layer
description.

**Impact metrics** (42% premium reduction, 97% critical operations protected)
come from the team's own scenario set. Reproducible, but not a field trial. Own
that framing before someone extracts it.

---

## 11. Open decisions

**Fail open or closed?** If criticality assessment fails outright, assume HIGH
(protect, spend) or LOW (save, expose)? Currently `POLICY_FAIL_OPEN=true`.
Recommended answer: keep fail-open — a safety product that fails toward safety is
defensible, and the cost is bounded by the QoD TTL.

**Multi-tenancy.** None exists. One config, one queue, one database, one
credential set. Consistent with per-facility deployment, which matches how the
operator relationship actually works. Do not claim otherwise.

---

## 12. Pitch notes worth keeping

- **The crane is the best story and the weakest market case** — it is the most
  visceral example and the most likely to already have private 5G. Lead with it,
  pivot to the drone and ambulance under challenge: mobile assets a private
  network can never cover.
- **"Just build private 5G"** is the strongest objection. Concede it for NEOM,
  then note that a private network is a capital project covering one fixed site.
- **"Just use rules instead of AI"** — the rules *do* decide. The model reads
  free text from heterogeneous systems that share no schema. Concede that rules
  work fine for one facility with a fixed taxonomy.
- **Guaranteed capacity is finite, not merely expensive.** If every device holds
  a permanent guarantee, the guarantee is meaningless. Allocation by need is what
  makes the tier viable — a stronger frame than cost saving.
- **Location verification is adversarially independent.** An asset can lie in a
  JSON payload; it cannot lie to the network about which cell it is attached to.
