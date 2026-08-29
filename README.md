# FlowGuard

**AI-controlled connectivity for critical business operations.**

FlowGuard is an AI agent that sits between a facility's operational systems and a programmable 5G network. It observes business events, judges how *business-critical* each one is, checks live network conditions, and then programs the network — requesting Quality on Demand or attaching a Network Slice — for only that device, for only that operation's duration, releasing it the moment the operation ends.

Built on [Nokia Network as Code](https://networkascode.nokia.io/) and the GSMA Open Gateway CAMARA APIs.

**Theme:** Smart Mobility and Logistics Agents · **Team:** PulseGrid

---

## The problem

Modern industrial, healthcare, and logistics operations depend on wireless connectivity for safety-critical tasks, but today's networks treat connectivity as static infrastructure. That leaves a costly binary:

- **Always-on premium 5G** — wasteful, since most operations only need it a fraction of the day.
- **Standard connectivity** — risks degraded performance at exactly the moment a critical operation is underway.

A remote-operated crane needs sub-30 ms latency and pushes ~30 Mbps *upstream* per camera. When a ship berths and three hundred devices attach to the same cell, that link degrades — and the operator emergency-stops with a 40-tonne load suspended.

## The thesis

> **Criticality triggers action. Congestion never does, on its own.**

| Event | Congestion | Criticality | Decision |
|---|---|---|---|
| Drone 3 — routine mapping | HIGH | LOW | **no allocation** |
| Drone 3 — pipeline leak inspection *(5 min later)* | HIGH | HIGH | **QoD + slice** |

Same device, same network conditions, opposite outcomes. That contrast is the demo, and it is asserted as a test.

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
│  client/    React · Vite · Tailwind        (not started)  │
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
| `server/` | **built** — 58 files, 12 tests passing |
| `agent/` | **built** — 43 files, 96 tests passing |
| `client/` | **not started** |
| Nokia sandbox | account active; QoD and Slice paths verified, 3 paths pending |
| Real LLM | not yet run — everything so far uses the offline classifier |

Verified live against a running Temporal server: the drone contrast pair, false-claim detection, duplicate-event idempotency, and release surviving a missing completion signal.

## Running it

Nothing below requires an API key — the agent runs fully offline against a mock network provider and an offline classifier.

**1. Temporal**
```bash
temporal server start-dev --db-filename temporal.db
```

**2. Agent worker**
```bash
cd agent && uv run flowguard-worker
```

**3. Fire a scenario**
```bash
temporal workflow start --task-queue flowguard --type CriticalOperationWorkflow --workflow-id op-1 --input-file docs/examples/crane-lift.json
```

Watch it at **http://localhost:8233**.

**Tests**
```bash
cd agent && uv run pytest
```
```bash
cd server && npm test
```

The server additionally needs a MongoDB Atlas URI in `server/.env`. See `.env.example` in each service.

## Documentation

[`CLAUDE.md`](CLAUDE.md) — full engineering context: architecture decisions and their rationale, cross-language contracts, hard-won API details, and known gaps.

## Team

**PulseGrid** — Nahla Nabil · Manal Albalushi · Oumar Dimnang
