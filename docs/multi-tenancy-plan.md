# FlowGuard — Auth, Organizations & Industry Verticals

Planning document. Nothing here is built yet.

**Decisions taken:** httpOnly session cookie · Viewer / Operator / Admin ·
all three stages.

---

## What changes, and what does not

The survey result that shapes everything: **the vertical-specific surface is
much smaller than it looks.**

| Already tenant- and industry-agnostic | Needs work |
|---|---|
| `decide()` — pure criticality × congestion | `operations` + `decision_log` schemas (org key) |
| `CriticalOperationWorkflow` | Socket.IO fan-out (currently broadcasts to everyone) |
| CAMARA provider and toolbox | `operationWorkflowId()` (collides across orgs) |
| Decision log, metrics, policy page | `terminal/` — the only crane-specific module |
| The agent's prompts (one mentions cranes, illustratively) | Everything auth-related (does not exist) |

Only **two** Mongo schemas need an organization key. The simulator already
carries three verticals — `crane-lift`, `drone-contrast`,
`ambulance-telemedicine` — so the multi-industry idea is half-present already;
it just has no structure.

---

## Stage 1 — Authentication and organization scoping

Security-critical, so it lands first. Nothing after it is safe until it does.

### 1.1 Data model

Two new collections.

```
organizations   _id · slug · name · industry · createdAt
users           _id · organizationId · email · passwordHash · role · name
                     createdAt · lastLoginAt
```

`industry` is an enum on the organization — `CONTAINER_TERMINAL` |
`DRONE_OPERATIONS` | `EMERGENCY_DISPATCH` — and it is what selects the facility
adapter in Stage 3.

`role` is `VIEWER` | `OPERATOR` | `ADMIN`.

Passwords hash with **argon2id**, not bcrypt. Sessions live in Mongo via
`connect-mongo` so a restart does not sign everyone out mid-demo.

### 1.2 The four places tenancy leaks

These are the whole job. Each is a real defect if missed, and three of them are
silent.

**① Socket fan-out — the actual data leak.**
`socket-io.gateway.ts` currently calls `this.server.emit(...)`, which sends every
decision to every connected client. With two organizations, org A watches org B
work in real time.

Fix: authenticate the socket handshake from the session cookie, `join` the
client to a room named for its organization, and change the port signature:

```ts
abstract publish<T>(organizationId: string, event: LiveEventName, payload: T): void;
```

Making the org a required first argument is deliberate. It turns "did I remember
to scope this?" into a compile error at all five publish sites.

**② Workflow ids collide.**
`operation-{eventId}` → `operation-{organizationId}-{eventId}`. Two organizations
submitting the same business event id would otherwise adopt each other's running
workflow — and with it, each other's paid QoD session. Server-side only; the
agent never constructs these.

**③ Every query needs a tenant filter.**
Repository ports take an explicit `organizationId` parameter. It is more typing
than a request-scoped context, and that is the point: a missing tenant filter is
the worst bug class in a multi-tenant system, and explicit parameters make the
compiler catch it. Request-scoped providers hide the omission.

**④ The terminal's in-memory state is a singleton.**
`Map<moveId, ContainerMove>` becomes `Map<organizationId, Map<moveId, …>>`.
Currently every org would drive the same four container moves.

### 1.3 Two callers have no session, and that is fine

Worth being explicit, because it is the part that gets designed wrong:

- **The agent** posts to `/internal/decisions` with the internal token, not a
  cookie. So `organizationId` has to travel *in the payload* — which means it
  rides on `BusinessEvent` → workflow → `RecordDecisionDto`. That is a new
  cross-language contract field, and `CLAUDE.md`'s contract table needs the row.
- **Nokia webhooks** arrive with no session either, carrying only the
  correlation in the sink URL. The org must be resolved *from the operation*,
  never from a request context that will not exist.

### 1.4 New surface

```
server/src/auth/
├── auth.module.ts · auth.controller.ts · auth.service.ts
├── session.config.ts              express-session + connect-mongo, shared with Socket.IO
├── guards/session-auth.guard.ts   requires a signed-in user
├── guards/roles.guard.ts          + @Roles(Role.OPERATOR) decorator
├── decorators/current-user.ts
└── dto/                           login · change-password

server/src/organizations/          ports + adapter + schema, same shape as operations/
server/src/users/                  ports + adapter + schema
```

`POST /auth/login` · `POST /auth/logout` · `GET /auth/me`.

### 1.5 Tests that must exist before this is trustworthy

Not optional — these are the ones that catch silent cross-tenant bleed:

- a user of org A requesting org B's operation gets 404, not 403 *(404 avoids
  confirming the record exists)*
- a socket authenticated as org A never receives an org B event
- `decide()`-driven decisions land with the emitting workflow's organization
- an unauthenticated request to every dashboard route is rejected
- a Viewer's dispatch attempt is rejected at the guard, not the UI

---

## Stage 2 — The application shell

### 2.1 Sidebar

Replaces the top nav. The earlier argument against one was specifically that
five routes do not justify 260px — with organizations, users, devices and
settings, that no longer holds.

```
┌──────────────┬─────────────────────────────┐
│ FLOWGUARD    │                             │
│ Org name  ▾  │   page                      │
│ ──────────── │                             │
│ OPERATIONS   │                             │
│  Control     │                             │
│  History     │                             │
│ ──────────── │                             │
│ EVIDENCE     │                             │
│  Policy      │                             │
│  Thesis      │                             │
│ ──────────── │                             │
│ Impact       │                             │
│ ──────────── │                             │
│ ADMIN        │   (admins only)             │
│  Users       │                             │
│  Devices     │                             │
│  Settings    │                             │
│ ──────────── │                             │
│ name · role ▾│                             │
└──────────────┴─────────────────────────────┘
```

In the instrument-record language: no pills and no fills. Small-caps mono group
labels, hairlines between groups, the active item marked by a left rule in the
accent. The org switcher only appears for users who belong to more than one
organization — which for most users means never.

The health strip and socket indicator move into the sidebar footer.

### 2.2 Login

Same design language, which means **not** a centred card with a drop shadow —
a ruled form on warm paper, wordmark above it, one line of context beneath.
This is now real authentication, so it is a real form.

Failure states: wrong credentials, locked-out, and server-unreachable are three
different messages. "Invalid email or password" for the first two together —
never confirm which half was wrong.

### 2.3 Role-aware UI

Dispatch, Abort and Reset are **hidden** for Viewers, not disabled. A disabled
control invites the question "why can't I?"; an absent one does not. One quiet
line at the top of the work queue explains the account is read-only.

The guard is the real enforcement — the UI is only tidiness.

### 2.4 New routes

`/login` · `/admin/users` · `/admin/devices` · `/admin/settings`

---

## Stage 3 — Industry verticals

### 3.1 Where the seam goes

`terminal/` generalises into `facility/`, using the same ports-and-adapters
shape as the repositories and the orchestrator:

```
server/src/facility/
├── facility.controller.ts            generic: describe · list · dispatch · abort · reset
├── facility.registry.ts              Industry → adapter
├── ports/facility-system.port.ts
└── adapters/
    ├── container-terminal/           berth · container moves · twistlock gate
    ├── drone-operations/             flight plans · pre-flight gate
    └── emergency-dispatch/           cases · en-route gate   (later)
```

```ts
abstract class FacilitySystemPort {
  abstract readonly industry: Industry;
  abstract describe(organizationId: string): Promise<FacilityDescriptor>;
  abstract listJobs(organizationId: string): Promise<FacilityJob[]>;
  abstract dispatch(organizationId: string, jobId: string): Promise<FacilityJob>;
  abstract abort(organizationId: string, jobId: string): Promise<FacilityJob>;
  abstract reset(organizationId: string): Promise<FacilityJob[]>;
}
```

A `FacilityJob` carries an id, an asset, its current state, its **lifecycle**
(the ordered states for that industry), an optional **gate** (the crane's
twistlock, a drone's pre-flight hold), free-form attributes, and the
`operationId` once dispatched.

Nothing downstream of the business event changes. `decide()`, the workflow, the
CAMARA calls, the audit trail, the policy page and the safety boundary are all
already industry-agnostic.

### 3.2 The presentation stays specific

**Recommendation: do not build a generic job renderer.** The crane sequence
strip works precisely *because* it is specific — eight named physical stations
with the interlock called out. A component generic enough to render both a
container move and a flight plan would render both blandly, and the twistlock
hold is the best thing in the product.

So: the **port** is generic, the **panels** are per-industry, and they share the
primitives (`Glyph`, `Slot`, `Section`, `LogRow`, `SequenceStrip`). The client
picks the panel from the organization's industry.

```
client/src/features/facility/
├── container-terminal/   BerthHeader · MoveRow · TwistlockHold
└── drone-operations/     MissionHeader · FlightRow · PreflightHold
```

### 3.3 Drone operations, concretely

Built from the `drone-contrast` scenario you already have. Lifecycle:
`PLANNED → PREFLIGHT → TAKEOFF → TRANSIT → ON_STATION → RETURN → LANDED`, with
the gate at `PREFLIGHT` — the same argument as the twistlock, and the same
safety property: FlowGuard delays a launch at most, never prevents one.

Criticality attributes become mission type, payload, overflight of populated
area, and whether the flight is deferrable — which maps onto the same
`MockClassifier` keys the terminal already derives.

---

## Risks and things that will bite

1. **Nokia credentials are one shared sandbox key.** Fine for the demo; wrong
   for production. If per-org credentials ever happen, they must be looked up
   **in an activity, by org id — never passed as workflow arguments.** Temporal
   persists workflow inputs in history permanently, so a credential in a payload
   is a credential written to disk forever. Same rule `CLAUDE.md` already records
   for `PolicyConfig`, extended to secrets.
2. **Existing data has no organization.** The `operations` and `decision_log`
   collections are full of records from single-tenant runs. Wipe them rather
   than backfilling a fake org — they are demo data.
3. **Sharing the session middleware with Socket.IO is fiddly on Nest.** The
   engine needs the same middleware instance the HTTP server uses. Budget an
   afternoon; it is the one part of Stage 1 that is not mechanical.
4. **One Temporal task queue is fine.** The worker stays org-agnostic because
   the org id simply rides in the workflow payload. Per-org queues would only be
   needed for per-org credentials or isolation guarantees.
5. **Over-generalising the UI** — see 3.2. The main way Stage 3 goes wrong.

---

## Build order

| # | Work | Blocks |
|---|---|---|
| 1 | organizations + users schemas, seed script | everything |
| 2 | auth module, session store, `/auth/*` | 3 |
| 3 | guards + roles, applied to every dashboard route | 4 |
| 4 | org key on both schemas, explicit `organizationId` on every repository method | 5 |
| 5 | socket rooms + `publish(organizationId, …)` | — |
| 6 | org-scoped workflow ids, `organizationId` through `BusinessEvent` → emit | — |
| 7 | login page + sidebar shell + role-aware controls | — |
| 8 | `facility/` port, `terminal/` → `container-terminal` adapter | 9 |
| 9 | `drone-operations` adapter + its panel | — |

1–6 are Stage 1 and should land together; a half-scoped tenant boundary is worse
than none, because it looks finished.

**Cross-language contract additions** (`CLAUDE.md` §4 needs the rows):
`BusinessEvent.organizationId` and `RecordDecisionDto.organizationId`.
