# Evidence

Sourcing for every claim in the README and pitch deck. Nothing here is
asserted without a citation; where a number is a demo-time computation rather
than an external fact, that's stated explicitly instead.

## The flagship case: public-safety connectivity under mass congestion

- **9/11 communications failure.** First responders in New York City lost the
  ability to coordinate because public cellular congestion swamped the shared
  network. The **9/11 Commission Report** formally investigated this
  communications breakdown and found it contributed to preventable loss of
  life.
- **FirstNet.** Congress's response: a dedicated public-safety network built
  with AT&T, funded at **$6.5B over 25 years**, whose defining feature is
  *priority and preemption* — a guaranteed connectivity "fast lane" for
  responders during exactly the moments networks are most congested (mass
  gatherings, disasters, high-profile events). It is active today, serving
  **7M+ users across 30,000+ public-safety agencies** in the US.
- **The FlowGuard angle.** FirstNet solves this by building a second physical
  network. FlowGuard proposes solving the same problem in software, using
  CAMARA's Quality on Demand and Network Slicing on top of the network that
  already exists — no new infrastructure required.

## Secondary case: industrial operations (crane/port)

- **Remote crane control latency requirements.** ~20–75ms for control
  signals, ~200ms end-to-end, per Konecranes, Ericsson, and 5G-ACIA
  industrial-connectivity standards.
- **Certified systems fail safe, not dangerous.** When those thresholds are
  breached, IEC 60947-5-5-certified crane systems auto-stop — the risk is
  operational and financial (downtime), not a documented pattern of unsafe
  behaviour. We looked specifically for a documented injury or accident
  caused by network-congestion-related crane control loss and found none —
  stated here rather than left silently unexamined.
- **Konecranes private-5G field trial**: 8 network-related emergency stops on
  a single crane over 2 months — the only concrete incident-rate data found,
  and it is one vendor's internal pilot, not an industry-wide figure.
- **Port downtime cost**: $10,000–$20,000/hour on average, up to $50,000/hour
  with cascading delays (industry-reported figures for unplanned crane
  downtime).

## Corroborating evidence: unplanned downtime is expensive broadly

- **ABB 2025 survey** of 3,600 industry decision-makers: 83% estimated
  unplanned downtime costs of at least $10,000/hour, many estimating
  significantly more. Unlike the Konecranes figure, this is a broad,
  large-sample industrial survey, not one vendor's pilot — it corroborates
  that operational disruption is expensive across industries generally, not
  only in ports.

## Reproducible demo metrics

`GET /metrics` (`server/src/metrics/metrics.service.ts`) computes these
live from the recorded decision log — not a hardcoded or estimated number.
Reset the database and replay the scenario set (see below) to regenerate:

```bash
cd server && npm run start:dev &
cd agent && uv run flowguard-worker &
curl -X POST http://localhost:3000/simulator/scenarios/stadium-incident/run
curl -X POST http://localhost:3000/simulator/scenarios/crane-lift/run
curl -X POST http://localhost:3000/simulator/scenarios/drone-contrast/run
curl -X POST http://localhost:3000/simulator/scenarios/ambulance-telemedicine/run
# wait for all operations to complete, then:
curl http://localhost:3000/metrics
```

The two headline figures are `premiumReductionPct` (share of operations left
on standard connectivity — the "42%" claim) and
`criticalOperationsProtectedPct` (share of HIGH-criticality operations that
received enhanced connectivity — the "97%" claim). Whatever `GET /metrics`
returns from a clean run of the scenario set above is the number to cite —
if it drifts from 42%/97%, cite the actual figure, not the original
estimate.

## Agentic-AI design objection — pre-empted

A worry worth stating explicitly, because judges may raise it: does
congestion-triggering-QoD look like plain automation rather than "real"
agentic AI? FlowGuard's answer is architectural, not rhetorical — see
[`CLAUDE.md`](../CLAUDE.md) §3, "The agency boundary." The LLM's job is
narrow but genuine: interpreting free-text business events with no fixed
schema, and autonomously deciding *when to gather more evidence* (e.g.
calling Location Verification to check a claim, as demonstrated live —
`test_congestion_signal_attaches_a_slice_that_was_not_ready_yet` and the
live-run logs show the agent choosing this tool with no prompting). The
final network action is a pure, deterministic function (`decide()`),
never a model call — because a language model must never be the thing
that commits a network slice for a suspended load or a mass-casualty
response. That separation is what makes the decision trail auditable, and
it's a cleaner answer to "is this really agentic" than most competing
architectures that let a model call the write APIs directly.
