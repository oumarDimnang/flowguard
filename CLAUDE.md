# FlowGuard — Engineering Context

Working context for this repository: what it is, how it is put together, why the
significant decisions were made, and what will bite you. Written so someone with
no prior history can pick up work without re-deriving anything.

---

## 1. What this is

FlowGuard allocates premium 5G connectivity to industrial operations only while
they need it. It reads business events from facility systems (a crane starting a
lift, a drone switching from survey to emergency inspection), judges how
business-critical each one is, checks live network conditions, requests Quality
on Demand — and a network slice for the most critical — then releases everything
when the operation ends.

It sits between an organisation's operational systems and the programmable
network, using GSMA Open Gateway **CAMARA** APIs through **Nokia Network as
Code**.

**The invariant everything else serves:** criticality triggers action;
congestion never does on its own. The same drone under the same HIGH congestion
gets nothing for routine mapping and a slice for a pipeline leak inspection. If
a change breaks that property, the change is wrong.

---

## 2. Repository layout and current state

```
flowguard/
├── server/     NestJS 12 — public ingress, BFF, sole MongoDB writer
├── agent/      Python 3.12 — Temporal worker, LangGraph reasoning, CAMARA I/O
├── client/     React + Vite + Tailwind — NOT STARTED (4 .gitkeep files)
└── docs/
```

| | Files | Tests | Notes |
|---|---|---|---|
| `server/` | 58 `.ts` | 13 passing | build clean, lint clean |
| `agent/` | 45 `.py` | 115 passing | ruff clean |
| `client/` | 0 | — | not started |

**Verified against a running Temporal dev server**, not only unit-tested: the
drone contrast pair, false-claim detection via location, duplicate-event
idempotency, release surviving a missing completion signal, and each service
completing correctly with the other side down.

**Server and agent have now completed a real run together** (2026-09-03,
first time — see §10 for how long this was blocked): `temporal server
start-dev`, `npm run start:dev`, and `uv run flowguard-worker` all up
simultaneously, Mongo Atlas reachable, a `crane-lift` scenario triggered via
`POST /simulator/scenarios/crane-lift/run`, classified `HIGH` by a real
OpenRouter model, and the full decision trail (`DEVICE_CHECKED` →
`CONGESTION_CHECKED` → `CRITICALITY_ASSESSED` → `DECIDED` → `ALLOCATED` →
`QOS_STATUS_CHANGED` → `RELEASED`) persisted to Mongo and readable back via
`GET /decision-log/:operationId`. Workflow completed with `action:
QOD_AND_SLICE`, `rule: SAFETY_CRITICAL_CONGESTED_SLICE`, `released: true`.

The `drone-contrast` pair was then run live through the same stack, not just
time-skipped: `drone-3-routine` classified `LOW` and decided `NONE` (no
allocation, nothing more in its trail); `drone-3-leak`, same device, 30
seconds later, classified `HIGH` and ran the full `ALLOCATED` →
`QOS_STATUS_CHANGED` → `RELEASED` cycle. The core invariant (§1 — criticality
triggers action, congestion never does on its own) is now demonstrated with
real infrastructure end to end, not only asserted by a unit test.

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
inbound attack surface — one TLS surface, one tunnel to expose.

### Why Temporal rather than LangGraph owning the loop

Of the seven steps in the loop, exactly one is an LLM call; the rest are network
I/O, a pure function and a wait. That is a durable workflow, not an agent loop.

More decisively: the value proposition is *release*, not allocation. A stranded
QoD session is bounded by its mandatory `duration` TTL, but **a slice attachment
has no TTL at all** — nothing expires it. If the release never runs, the device
stays attached indefinitely. Temporal's `try/finally` plus retry policy makes
that structural rather than aspirational.

LangGraph's checkpointer only makes a graph *resumable*; something must still
come back and re-invoke it. Temporal owns the clock.

### Why LangGraph is still here

It runs the criticality assessment *inside* a Temporal activity and does real
work: confidence-based evidence gathering and model escalation.

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
it decides. `test_toolbox_exposes_no_write_capability` fails the build if anyone
adds one.

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

`INTERNAL_API_TOKEN` must be byte-identical in both `.env` files, or the agent's
decision events are rejected with 401 and the dashboard silently stays empty.

**Wire format is camelCase** (it originates in TypeScript). Python reconstructs
via `from_wire()` classmethods rather than deserialising directly, which keeps
the Python side idiomatic.

The server's `ValidationPipe` runs with `forbidNonWhitelisted: true`, so adding a
field to an outbound payload without adding it to the DTO produces a 400, not a
silent drop.

---

## 5. Hard-won facts

Each of these cost real time to discover. Do not re-derive them.

### Nokia / CAMARA

- **QoS profile is `DOWNLINK_M_UPLINK_L`**, verified against this account's
  playground. **Not `QOS_L`** — that is the TypeScript SDK's name and this API
  rejects it. Note the asymmetry: medium down, *large up*. That is the shape a
  camera-heavy industrial asset needs, and the opposite of a consumer plan.
- **Auth is the RapidAPI key alone.** `x-rapidapi-key` + `x-rapidapi-host`
  headers. No OAuth bearer, despite `NaC Authorization Server` appearing in the
  catalogue.
- **Base URL is regional:** `https://network-as-code.p-eu.apihub.nokia.io`.
- **Congestion levels are `"Low" | "Medium" | "High"`** with exactly that
  casing. CAMARA also emits `"None"` for an uncongested cell — mapped to `LOW`
  in the provider, since the policy vocabulary starts at Low.
- **Congestion requires a subscription before queries return anything.** It is a
  bootstrap step, not a per-request call.
- **A slice takes minutes to provision** (create → AVAILABLE → activate →
  OPERATING). It cannot be created inside a decision window. Pre-provision it;
  only attach and detach per operation.
- **Slice modification is unsupported.** Create and delete only.
- **QoD is asynchronous** — `qosStatus` is `REQUESTED` before `AVAILABLE`.
- **`duration` is mandatory** and doubles as a TTL backstop.
- Nokia ships **two incompatible SDK generations**; most tutorials show the older
  one. This repo uses direct HTTP instead — see §6.
- Nokia has an **MCP server**. Deliberately not used — see §6.
- **All 5 CAMARA endpoint paths are verified against the sandbox** (as of
  2026-09-02, via `scripts/verify_nokia.py` with a real `NOKIA_API_KEY`):
  device reachability (`POST /device-status/device-reachability-status/v1/retrieve`),
  congestion query (`POST /congestion-insights/v0/query`), and slice device
  attach (`GET /device-attach/v0/attachments`), alongside the
  already-verified QoD path and location verification/retrieval. None of the
  catalogue's display names map mechanically to their REST paths — e.g.
  "Slice Device Attach" is `/device-attach/`, not `/slice-device-attach/`.

### LLM / LangGraph

- **`langchain-openrouter`'s `extra_body` kwarg is silently accepted at
  construction and rejected at call time.** `ChatOpenRouter(..., extra_body=
  {...})` builds without error, but the installed `openrouter` SDK's
  `send()`/`send_async()` has no `extra_body` parameter at all — it raises
  `TypeError: Chat.send_async() got an unexpected keyword argument
  'extra_body'` on the first real classification call, which is exactly why
  no test caught it before `LLM_PROVIDER=openrouter` was first exercised for
  real (2026-09-02). Use `model_kwargs={"models": [...]}` for the
  OpenRouter model-fallback list (no dedicated field, but `model_kwargs` is
  spread verbatim into the request) and the dedicated `openrouter_provider=
  {"sort": "latency"}` field for provider routing — not `extra_body`.
  Regression-covered in `tests/test_llm_client.py` by mocking `ChatOpenRouter`
  and asserting on its constructor kwargs, with no API key or network call.
- **A real model has now run the assessment graph successfully**, against
  the exact `crane-lift` and `drone-contrast` scenario content
  (`openai/gpt-5.6-luna` via OpenRouter): it reproduced the drone-contrast
  thesis exactly (routine mapping → LOW, the same device's leak inspection
  five minutes later → HIGH/safety-critical), and independently chose to
  call `retrieve_device_location` as evidence for the leak inspection with
  no prompting to do so.

### Temporal

- **Mid-operation re-decision is implemented** (`_reassess_congestion` in
  `critical_operation.py`), triggered by `congestion_updated` signals during
  `_monitor()`. It escalates only, never de-escalates — revoking protection
  from an operation already under way is not a call this system makes on its
  own. The reachable trigger is **not** "congestion rose enough to newly
  justify a slice": `decide()` gates `QOD_AND_SLICE` purely on
  `safety_critical` (fixed at classification, congestion-independent) and
  `slice_available` (hardcoded `True` at the call site), so a safety-critical
  operation that clears the QoD threshold gets `QOD_AND_SLICE` immediately,
  never lingering at plain `QOD` waiting to escalate. The actually-reachable
  case is a slice the policy *already wanted* but that had not finished
  provisioning yet (slices take minutes — see Nokia facts above); each
  congestion signal is a natural tick to retry the attachment. Both the retry
  and the never-de-escalate guarantee are tested in
  `test_workflow.py`'s "Mid-operation re-decision" section.
- **A `congestion_updated` signal delivered during `_confirm_qos_available`
  is invisible to a baseline captured inside `_monitor()`.** If `_monitor`
  captures `self._latest_congestion` as its own starting point, a signal that
  already landed during the preceding QoD-confirmation wait looks like "no
  change" forever after — the baseline must be captured immediately after
  the allocate activity returns, before any further `await`, and threaded
  into `_monitor` as a parameter. Caught by
  `test_congestion_signal_attaches_a_slice_that_was_not_ready_yet` timing out
  before this fix.
- **`WorkflowEnvironment`'s time-skipping only advances on `env.sleep(...)`**
  (or a call with nothing left to wait on, like `execute_workflow`), never on
  a plain `asyncio.sleep()` in the test itself — the latter just burns real
  wall-clock time while the workflow stays parked inside a Temporal timer
  (`_confirm_qos_available`'s 10-second wait, for instance). A test that
  needs to poll for an intermediate step *and* let a workflow timer resolve
  must poll with `await env.sleep(...)`, not `asyncio.sleep(...)`.
- **Config a workflow needs must be read by an activity, not live.**
  `PolicyConfig` used to be constructed bare (`PolicyConfig()`) at every
  `decide()` call site — `Settings.policy_always_protect_safety_critical`
  and `.policy_fail_open` were real, env-configurable fields that nothing
  ever consulted. The fix is `activities/policy_config.py`'s
  `get_policy_config`, called once near the top of `run()`; its *result* is
  what Temporal records in history, so a replay sees exactly what the
  original run saw rather than whatever `.env` says now. This is the same
  "no I/O in workflow code" rule already applied to every CAMARA read,
  just applied to configuration.

### Toolchain

- **NestJS 12 packages are ESM-only** (`"type": "module"`, no CJS build). Jest's
  CommonJS runtime cannot require them — hence Vitest.
- **`unplugin-swc` is mandatory with Vitest**, not optional: the default esbuild
  transform does not emit decorator metadata, and Nest's constructor injection
  reads exactly that. Without it every provider resolves to `undefined`.
- **TypeScript 6, not 7.** `@nestjs/cli@12` pins `~6.0.2`. TS 6 also requires an
  explicit `rootDir` and rejects `baseUrl`.
- **`@nestjs/terminus` has no v12 release** — peers stop at `^11`. Health is
  hand-rolled in `server/src/health/`.
- **Langfuse is 4.x**, where `start_as_current_span` does **not** exist — only
  `start_as_current_observation(as_type="span", ...)`. `start_span()` in
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
degraded, absent. These tools are backed by `NetworkProvider`, so the mock keeps
the full toolset available offline. Nokia's MCP also fronts ~17 API families,
almost certainly including QoD writes, which would put allocation back in the
model's hands. MCP is the better long-term integration; it is not the right
trade while the system must run without network access.

**Pydantic at boundaries, dataclasses inside.** The provider previously used
`.get()` chains. `bool(body.get("reachable"))` returns `False` when the field is
absent — so a renamed field would have reported a healthy device as
*unreachable*, fired the guard clause, and left every operation unprotected with
nothing logged. A parse failure becoming a safety decision. Fields the decision
depends on are now required with no default; `extra="ignore"` keeps forward
compatibility.

**`decide()` is a pure function, never a model call.** Auditable, exhaustively
testable (36 tests cover the full input space), reproducible. The model
classifies criticality; rules map that to an action.

**Prompts as Markdown in `prompts/templates/`.** They are the highest-leverage
text in the project, are reviewed by people who do not read Python, and a prompt
change should produce a readable diff. Loaded via `importlib.resources` and
declared as wheel artifacts — without that declaration they vanish from an
installed package.

**Emit is non-fatal; tracing is non-fatal.** Neither the dashboard nor Langfuse
may be able to fail an activity that is holding paid network capacity. Both log
and continue after retries are exhausted.

**Deterministic workflow IDs** (`operation-{eventId}`). Temporal rejects a
duplicate ID for a running execution, so a re-submitted business event cannot
start a second workflow holding a second paid session.

**Mock providers are a first-class mode, not stubs.** They let the entire loop
run offline and make results reproducible. Congestion is *scripted* rather than
random, because the contrast case depends on two events observing identical
network conditions — randomness would destroy the comparison.

---

## 7. Key files

### `agent/`

| Path | What |
|---|---|
| `workflows/critical_operation.py` | the lifecycle; `finally: release` is the guarantee |
| `policy/rules.py` | `decide()` — the auditable decision |
| `activities/policy_config.py` | reads `PolicyConfig`/fail-open once per run, recorded in history |
| `graph/assessment_graph.py` | LangGraph: classify → gather evidence → escalate → validate |
| `graph/evidence.py` | which tool to call; heuristic and LLM implementations |
| `tools/network_tools.py` | the read-only toolbox — the safety boundary |
| `network/provider.py` | the mock ↔ Nokia swap point |
| `network/schemas.py` | Pydantic CAMARA payloads |
| `prompts/templates/*.md` | criticality taxonomy and tool-selection prompt |
| `observability/temporal_interceptor.py` | one Langfuse trace per workflow run |
| `scripts/verify_nokia.py` | probes every endpoint, reports which paths are wrong |

### `server/`

| Path | What |
|---|---|
| `temporal/` | the only place `@temporalio/client` is imported |
| `temporal/temporal.constants.ts` | the cross-language contract |
| `decision-log/decision-log.service.ts` | dedupe → append → project → publish |
| `webhooks/` | the single public Nokia sink; correlation carried in the sink URL |
| `simulator/scenarios/` | scripted scenario definitions |

---

## 8. Conventions

**Adding a CAMARA API.** Add the method to `NetworkProvider` (ABC), then
`MockNetworkProvider`, then `NokiaNetworkProvider`, then a Pydantic model in
`network/schemas.py`. If it is a *read* the agent should be able to choose, add
a schema to `TOOL_SCHEMAS` and a branch in `NetworkToolbox._dispatch`. **Never
add a write to the toolbox** — a test enforces this.

**Adding a workflow step.** Activities are invoked **by name**, never imported,
which keeps LangChain and httpx out of the workflow sandbox. Add the constant to
`shared/constants.py`, register the activity in `worker.py`, and give it an
explicit timeout and retry policy. Anything non-deterministic goes in an
activity, never in workflow code.

**Adding a prompt.** Drop a `.md` file in `prompts/templates/`, add a name
constant in `prompts/registry.py`. Content contracts are tested in
`tests/test_prompts.py`.

**Adding a scenario.** `server/src/simulator/scenarios/scenario.definitions.ts`.
Scenario runs generate fresh event IDs, because reusing one trips the
idempotency guard and adopts the previous run's finished workflow.

**Adding a decision-log field.** Four places, not three — it is easy to stop
at the DTO/domain/schema triad and still lose the field silently:
`RecordDecisionDto` (validation), `DecisionRecord` (domain interface),
`DecisionRecordEntity` (Mongoose schema, `@Prop`-per-field — Mongoose drops
anything not declared here), **and**
`MongoDecisionLogRepository.toDomain()`. That last one is a hand-written
field-by-field mapper with no compiler check tying it to the other three —
adding `graphTrace`/`toolCalls` to the first three and skipping it produced a
record that saved to Mongo correctly but came back from every read path
(`findByOperation`, `findAll`, even `append()`'s own return value) with both
fields silently missing. Caught only by a live end-to-end check, not by
`decision-log.service.spec.ts`'s `FakeDecisionLogRepository`, which has no
mapper to forget in the first place.

**Testing approach.** `decide()` is pure, so its tests are exhaustive over the
input space. The graph is driven by stub classifiers with no model or network.
Workflow tests use Temporal's **time-skipping** `WorkflowEnvironment`, so a
three-minute operation runs in milliseconds and the release path can actually be
asserted rather than reasoned about.

---

## 9. Running it

Everything below works with **no API keys** — mock network provider, offline
classifier.

```bash
temporal server start-dev --db-filename temporal.db     # :7233, UI on :8233
cd agent && uv run flowguard-worker
cd agent && uv run pytest                                # 96 tests
cd server && npm test                                    # 12 tests
```

The server additionally needs `MONGODB_URI` in `server/.env`. Each service has a
`.env.example`.

To run against live services: set `NETWORK_PROVIDER=nokia` + `NOKIA_API_KEY`, and
`LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY`. All 5 endpoint paths are
verified (§5) — `scripts/verify_nokia.py` is still worth a run after any
account/region change, since the paths are unconfirmed by contract, only by
observation. A real OpenRouter model has also now run successfully end-to-end
through the assessment graph (§5, "LLM / LangGraph").

---

## 10. Known gaps

1. **`client/` does not exist.** The decision trail is reachable only via the
   REST API and worker logs.
2. **No multi-tenancy.** One config, one task queue, one database, one
   credential set. Consistent with per-facility deployment, which matches how the
   network operator relationship works.

### Open decision: fail open or closed?

If criticality assessment fails outright, should the system assume HIGH (protect,
spend) or LOW (save, leave exposed)? Currently `POLICY_FAIL_OPEN=true`. The
argument for keeping it: a safety-oriented system that fails toward safety is
defensible, and the cost of a wrong allocation is bounded by the QoD `duration`
TTL.

**Now actually implemented**, as of the same session that found it wasn't:
until 2026-09-03 `POLICY_FAIL_OPEN` was read into `Settings` and never
consulted anywhere — an `assess_criticality` failure surviving
`_REASONING_RETRY`'s two attempts simply failed the whole workflow, with no
policy applied and nothing decided. `run()` now catches that failure,
branches on `policy_fail_open` (HIGH/safety-critical if open, LOW if
closed), and still emits a normal, audited `CRITICALITY_ASSESSED` record —
with `error` set, so the fallback is visible rather than indistinguishable
from a real classification. Covered by
`test_criticality_assessment_failure_fails_open_by_default` and
`..._fails_closed_when_configured` in `test_workflow.py`.
