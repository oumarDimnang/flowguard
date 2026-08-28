# FlowGuard

**AI-controlled connectivity for critical business operations.**

FlowGuard is an AI agent that sits between a facility's operational systems and a programmable 5G network. It observes business events, judges how *business-critical* each one is, checks live network conditions, and then programs the network — requesting Quality on Demand or attaching a Network Slice — for only that device, for only that operation's duration, releasing it the moment the operation ends.

Built on [Nokia Network as Code](https://networkascode.nokia.io/) and the CAMARA network APIs.

---

## The problem

Modern industrial, healthcare, and logistics operations depend on wireless connectivity for safety-critical tasks, but today's networks treat connectivity as static infrastructure. That leaves businesses with a costly binary:

- **Always-on premium 5G** — wasteful, since most operations only need it a fraction of the day.
- **Standard connectivity** — risks degraded performance at exactly the moment a critical operation is underway.

That gap has real consequences: a remote crane lift, a drone locating a possible gas leak, an emergency telemedicine consultation.

## The idea

**Criticality triggers action. Congestion never does, on its own.**

That single distinction is what separates FlowGuard from a congestion monitor:

| Event | Congestion | Criticality | Decision |
|---|---|---|---|
| Drone 3 — routine mapping | HIGH | low | **no QoD** |
| Drone 3 — pipeline leak inspection *(5 min later)* | HIGH | HIGH | **QoD activated** |

Same device, same network conditions, opposite outcomes. The agent reasons about the *operation*, not just the signal.

## How it works

A closed loop, run per operation:

```
observe → understand → predict → allocate → monitor → release
```

1. A facility system reports a business event (crane, drone, camera, vehicle).
2. The agent assesses how business-critical it is.
3. It checks **Device Status** — is the device reachable and behaving normally?
4. It checks **Congestion Insights** — is the network at risk in that area?
5. It decides: no action, **Quality on Demand**, or QoD **+ Network Slice** attachment.
6. It monitors the operation and **releases** the enhanced connectivity automatically once it completes.

Every step is written to a decision log, so there is an explainable trail for why connectivity was activated or released.

## Network APIs used

All four are CAMARA APIs accessed through Nokia Network as Code:

| API | Role |
|---|---|
| **Congestion Insights** | Current and forecast network conditions in the operation's area — the risk signal. |
| **Device Status** | Confirms the device is reachable before any network intervention is requested. |
| **Quality on Demand** | Requests temporary, guaranteed network quality for that device and duration. |
| **Network Slice** | For the highest-criticality workloads, attaches the device to a dedicated slice. |

## Architecture

Three services, each with one clear responsibility.

```
┌─────────────────────────────────────────────────────┐
│  client/   React + Vite + Tailwind                  │
│  Operations dashboard · decision trace · metrics    │
└──────────────┬───────────────────────▲──────────────┘
               │ REST          WebSocket│
┌──────────────▼───────────────────────┴──────────────┐
│  server/   NestJS — public ingress, BFF             │
│  Business events · Nokia webhooks · MongoDB Atlas   │
└──────────────┬───────────────────────▲──────────────┘
               │ internal HTTP         │ decision events
┌──────────────▼───────────────────────┴──────────────┐
│  agent/   Python · LangGraph · FastAPI              │
│  Criticality reasoning · owns all Nokia API calls   │
└──────────────┬──────────────────────────────────────┘
               │
      Congestion Insights · Device Status
      Quality on Demand · Network Slice
```

- **`client/`** renders live operations and the reasoning trail. Talks only to the server.
- **`server/`** is the only service exposed to the internet. It accepts business events, terminates every Nokia webhook, relays them inward, and is the sole writer to MongoDB.
- **`agent/`** runs the decision loop and performs every network API call. Internal only.

## Repository layout

```
flowguard/
├── client/                        React + Vite + Tailwind — operations dashboard
│   └── src/
│       ├── api/                       REST + WebSocket clients
│       ├── components/                operations grid, decision trace, metrics
│       ├── hooks/                     live data subscriptions
│       └── types/                     shared DTOs
│
├── server/                        NestJS — BFF, public ingress, MongoDB owner
│   ├── src/
│   │   ├── config/                    environment schema and validation
│   │   ├── events/                    business event ingress
│   │   ├── simulator/                 facility-system simulator
│   │   │   └── scenarios/             scripted, reproducible demo runs
│   │   ├── agent-bridge/              the only module that talks to the agent
│   │   ├── webhooks/                  the only public sink for Nokia callbacks
│   │   ├── operations/                read model for the dashboard
│   │   ├── decision-log/              append-only audit trail
│   │   ├── metrics/                   impact metric computation
│   │   ├── realtime/                  WebSocket fan-out
│   │   └── database/                  MongoDB Atlas connection
│   └── test/
│
├── agent/                         Python — LangGraph agent, owns Nokia NaC
│   ├── src/flowguard_agent/
│   │   ├── api/                       internal HTTP surface
│   │   ├── graph/                     the decision state machine
│   │   │   └── nodes/                 assess · check · query · decide · allocate · monitor · release
│   │   ├── network/                   network provider interface (mock ↔ Nokia)
│   │   ├── policy/                    criticality taxonomy and decision rules
│   │   ├── llm/                       language model client
│   │   └── emit/                      pushes decision events to the server
│   └── tests/
│
└── docs/
```

## Stack

| Layer | Technology |
|---|---|
| Dashboard | React · Vite · Tailwind CSS |
| API / BFF | NestJS |
| Agent | Python · LangGraph · LangChain |
| Language model | GPT-5.6 Luna |
| Database | MongoDB Atlas |
| Network | Nokia Network as Code (CAMARA APIs) |

## Status

**Scaffolding only.** This repository currently contains the folder structure and this README. No services have been initialised and no functionality has been implemented yet.

## Team

**PulseGrid** — Nahla Nabil · Manal Albalushi · Oumar Dimnang
