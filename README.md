# FlowGuard

**AI-controlled connectivity for critical operations.**

FlowGuard is an AI agent that sits between operational systems and a programmable 5G network. It observes business events, judges how *critical* each one is, checks live network conditions, and then programs the network — requesting Quality on Demand or attaching a Network Slice — for only that device, for only that operation's duration, releasing it the moment the operation ends.

Built on [Nokia Network as Code](https://networkascode.nokia.io/) and the GSMA Open Gateway CAMARA APIs.

**Theme:** Industrial & Enterprise AI Automation · **Team:** PulseGrid

---

## The problem

Critical operations increasingly depend on 5G connectivity, but networks don't understand when an ordinary business operation suddenly becomes mission-critical. Today, network quality is managed based on technical conditions such as congestion, while operational systems understand business context, such as whether a drone is mapping a site or investigating a gas leak. These two systems are disconnected. As a result, enterprises either over-provision high-priority connectivity, wasting resources, or risk critical applications running without enhanced network performance when it matters most. FlowGuard closes this gap by translating real-world operational events into real-time network actions.

**This isn't hypothetical.** On 9/11, first responders in NYC lost the ability to coordinate because public cellular congestion swamped the network they shared with everyone else — a failure the 9/11 Commission Report formally investigated. Congress's answer was FirstNet: a dedicated, $6.5B, 25-year public-safety network built specifically to give responders a priority "fast lane" during exactly the moments networks are most congested. It's real, active, and serves 7M+ users today.

FirstNet solved this by building an entire second physical network. FlowGuard solves the same underlying problem in software — on top of the network that already exists — using CAMARA's Quality on Demand and Network Slicing to grant that same priority fast lane the instant it's needed, and release it the instant it isn't. The same engine generalises directly to industrial operations (a remote-operated crane needs sub-30ms latency and fails safe — but expensively — when congestion breaches it) and healthcare (a paramedic escalating from routine transport to a live specialist consult). See [`docs/evidence.md`](docs/evidence.md) for sourcing on every claim above.

## The thesis

> **Criticality triggers action. Congestion never does, on its own.**

| Event | Congestion | Criticality | Decision |
|---|---|---|---|
| Paramedic — routine stadium standby | HIGH | LOW | **no allocation** |
| Paramedic — mass-casualty incident declared *(same device, minutes later)* | HIGH | HIGH | **QoD + slice** |

Same device, same network conditions, opposite outcomes. That contrast is the demo, and it is asserted as a test — reproduced again with a crane and a drone in [`docs/evidence.md`](docs/evidence.md), because the pattern isn't specific to one industry.

## How it works

```
observe → understand → predict → allocate → monitor → release
```

1. A facility system reports a business event (crane, drone, ambulance).
2. **Device Status** — is the device reachable? *(guard clause: never allocate to an absent device)*
3. **Congestion Insights** — is the network at risk in that area?
4. An LLM judges business criticality — the only step a model is involved in.
5. When the agent is unsure, or the claim is safety-critical, it **chooses which CAMARA read API would resolve the question** — typically Location Verification, to confirm the asset is actually where it claims to be.
6. A **deterministic policy** maps criticality × congestion → `NONE` / `QOD` / `QOD_AND_SLICE`.
7. **Quality on Demand** and, when escalated, **Slice Device Attach**.
8. The operation completes and connectivity is **released** — guaranteed by a durable workflow, even across a worker crash.

A model classifies. Rules decide. That separation is what makes the decision trail auditable.

## CAMARA APIs used

| API | Role |
|---|---|
| **Device Reachability Status** | guard clause — is the asset on the network? |
| **Congestion Insights** | risk signal — is the cell saturated? |
| **Quality on Demand** | the main lever — a temporary, guaranteed uplink |
| **Network Slicing** | pre-provisioned dedicated segment |
| **Slice Device Attach** | attach/detach per operation |
| **Location Verification** | agent-selected — does the asset's position support its claim? |
| **Location Retrieval** | agent-selected — where is the asset? |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  client/    React · Vite · Tailwind        (dashboard)    │
└──────────────┬───────────────────────▲───────────────────┘
               │ REST          WebSocket│
┌──────────────▼───────────────────────┴───────────────────┐
│  server/    NestJS — public ingress, BFF                  │
│  Business events · Nokia webhooks · MongoDB Atlas         │
└──────────────┬───────────────────────▲───────────────────┘
               │ start workflow        │ decision events
┌──────────────▼───────────────────────┼───────────────────┐
│  Temporal Server — durable history, timers, retries       │
└──────────────┬───────────────────────┼───────────────────┘
               │ task queue            │
┌──────────────▼───────────────────────┴───────────────────┐
│  agent/     Python worker — no inbound port               │
│  LangGraph reasoning · deterministic policy · CAMARA I/O  │
└──────────────┬───────────────────────────────────────────┘
               │
    Device Status · Congestion · QoD · Slice · Location
```

- **`client/`** renders live operations and the reasoning trail. Talks only to the server.
- **`server/`** is the only service exposed to the internet. It accepts business events, terminates every Nokia webhook, relays them inward as Temporal signals, and is the sole writer to MongoDB.
- **`agent/`** is a pure Temporal worker — it connects *outbound* to the task queue and has no inbound port at all. It runs the LangGraph reasoning and performs every CAMARA call.

## Stack

| Layer | Technology |
|---|---|
| Dashboard | React · Vite · Tailwind CSS |
| API / BFF | NestJS 12 · TypeScript 6 |
| Durable orchestration | Temporal |
| Agent | Python 3.12 · LangGraph · LangChain |
| Model gateway | OpenRouter |
| Database | MongoDB Atlas |
| Observability | Langfuse *(optional)* |
| Network | Nokia Network as Code (CAMARA) |

## Status

| | |
|---|---|
| `server/` | **built** — 58 files, 13 tests passing |
| `agent/` | **built** — 45 files, 115 tests passing |
| `client/` | **built** — authenticated dashboard, scenarios, operations, and decision trails |
| Nokia sandbox | all 5 CAMARA endpoint paths verified live |
| Real LLM | run and validated — OpenRouter model reproduces the criticality-not-congestion thesis exactly, including choosing to call Location Verification with no prompting |
| Server + agent + Temporal | run together live end-to-end, all four scenarios, real MongoDB Atlas persistence |

Verified live against a running Temporal server, with a real model, not only unit-tested: the stadium-incident and drone contrast pairs, false-claim detection via location, duplicate-event idempotency, mid-operation re-decision on congestion change, fail-open/fail-closed on assessment failure, and release surviving a missing completion signal.

## Running it

Nothing below requires an API key — the agent runs fully offline against a mock network provider and an offline classifier by default.

**1. Temporal**
```bash
temporal server start-dev --db-filename temporal.db
```

**2. Server** (needs `MONGODB_URI` in `server/.env` — see `.env.example`)
```bash
cd server && npm install && npm run start:dev
```

**3. Agent worker**
```bash
cd agent && uv sync && uv run flowguard-worker
```

**4. Open the dashboard and sign in**

With client dependencies installed, run `npm run dev` from `client/` and open
its displayed URL. Sign in to the intended organization with an **OPERATOR or
ADMIN** account, open **Scenarios**, and run `stadium-incident` once.

Follow the two scheduled operations and their decision trails in **Operations**.
The [authenticated demo runbook](docs/demo-runbook.md) covers expected results,
timing, and troubleshooting. Simulator launches and decision-log/metrics reads
require a session; a bare `curl` request does not inherit your browser login.

The files in `docs/examples/` are business-event bodies, not complete direct
Temporal demo inputs. They omit `organizationId`, which the server normally
adds from the session. Direct execution can fail decision emission with HTTP 400
and bypasses dashboard operation registration. See the
[REST versus Temporal explanation](docs/demo-runbook.md#rest-and-direct-temporal-inputs-are-different)
before using them for workflow debugging.

**Tests**
```bash
cd agent && uv run pytest
```
```bash
cd server && npm test
```

To run against live services (not required for the demo above): set `NETWORK_PROVIDER=nokia` + `NOKIA_API_KEY`, and `LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY` in `agent/.env`.

## Documentation

- [`docs/demo-runbook.md`](docs/demo-runbook.md) — authenticated stadium demo and troubleshooting.

- [`CLAUDE.md`](CLAUDE.md) — full engineering context: architecture decisions and their rationale, cross-language contracts, hard-won API details, and known gaps.
- [`docs/evidence.md`](docs/evidence.md) — sourcing for every claim in this README and the pitch deck, including how to regenerate the impact metrics.
- [`docs/cost-model.md`](docs/cost-model.md) — the always-on-vs-FlowGuard cost comparison.

## Team

**PulseGrid** — Nahla Nabil · Manal Albalushi · Oumar Dimnang
