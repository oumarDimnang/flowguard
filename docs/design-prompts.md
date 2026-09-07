# FlowGuard — Claude Design prompt series

Send these in order. **Phase 0 is the design language** — paste it at the top of
every later prompt, or send it once and refer back to it, so the four pages come
out as one system rather than four unrelated screens.

Every field name, container number, endpoint path and enum value below is real,
taken from the running backend. Keep them verbatim — the generated markup gets
ported onto typed data, and invented field names cost a translation pass.

---

## Phase 0 — Design language

> I'm designing an operations dashboard called **FlowGuard**. It sits in a
> container terminal and decides, per crane lift, whether that operation needs
> premium 5G connectivity — then releases it when the lift ends. The product's
> core claim is that every decision is *auditable*. The interface has to look
> like evidence, not like a gaming HUD.
>
> **Design language — "Instrument Record".** Follow these rules strictly; they
> are the point of the design:
>
> 1. **No cards.** Do not put content in bordered, shadowed boxes. Separate
>    regions with hairline rules (1px, border colour) and whitespace only. This
>    is the single most important rule.
> 2. **Warm paper ground**, not white and not dark-by-default.
> 3. **Tabular numerics.** Every number uses a monospace face with
>    `font-variant-numeric: tabular-nums`, so live values never jitter as they
>    change.
> 4. **Fixed readouts.** Live values sit in fixed-width slots. The layout must
>    never reflow when a number updates.
> 5. **Status by glyph + label, never colour alone.** A filled square, a hollow
>    square, a slash — plus a word. Assume the projector washes out colour.
> 6. **Marginal timestamps.** Time lives in its own narrow margin column,
>    log-style, not inline with prose.
> 7. **One accent colour only** — the clay/terracotta primary — used for the
>    active state and nothing else. Everything else is ink on paper.
> 8. **Type carries the hierarchy.** Size and weight, never background fills.
> 9. **Blueprint annotation for diagrams**: hairline leader lines and small-caps
>    callout labels instead of tooltips or legends.
>
> **Typography:** a clean sans for prose and headings; JetBrains Mono for all
> identifiers, numbers, timestamps, payloads and code.
>
> **Colour tokens — use these CSS custom properties, never hardcoded hex:**
>
> ```
> --background: oklch(0.9818 0.0054 95.0986);   /* warm paper */
> --foreground: oklch(0.3438 0.0269 95.7226);   /* warm ink */
> --primary:    oklch(0.6171 0.1375 39.0427);   /* clay — the only accent */
> --muted:      oklch(0.9341 0.0153 90.2390);
> --muted-foreground: oklch(0.6059 0.0075 97.4233);
> --border:     oklch(0.8847 0.0069 97.3627);   /* hairlines */
> --destructive: oklch(0.6368 0.2078 25.3313);
> --radius: 0.5rem;
> ```
>
> Also provide a dark variant under `.dark` using:
> `--background: oklch(0.2679 0.0036 106.6427)`,
> `--foreground: oklch(0.8074 0.0142 93.0137)`,
> `--primary: oklch(0.6724 0.1308 38.7559)`,
> `--border: oklch(0.3618 0.0101 106.8928)`.
>
> **Output format for every phase:** one self-contained static HTML file using
> Tailwind CSS v4 utility classes, with the tokens above declared in a `<style>`
> block on `:root` and `.dark`. No JavaScript frameworks — static markup showing
> the states I describe. Desktop-first at 1440px, but it must not break at
> 1024px.
>
> Reply with a short summary of the system (type scale, spacing scale, the
> status glyph set, and how you'll handle rules-instead-of-cards) before you
> generate any page. I'll then send the pages one at a time.

---

## Phase 1 — Control Room  (route `/`)

> Generate the **Control Room** — the main screen. Layout regions, top to bottom:
>
> **A. Berth header.** `Khalifa Bin Salman Port — Berth 3` · vessel
> `MV GULF TRADER` · target `32 moves/hour`. Beside it a compact system strip:
> `Mongo ok` · `Temporal ok` · `Realtime 1 client` · uptime. Use status glyphs.
>
> **B. Holdings readout — the most important element on the page.** A single
> large tabular number: *premium sessions held right now*. Show it reading `1`,
> with a smaller line beneath: `1 QoD · 0 slices`. This number rises when an
> operation is protected and must visibly return to `0` when it is released —
> design it so the return to zero reads as the point, not as an empty state.
>
> **C. Work queue — four container moves.** Each row is a rule-separated line,
> not a card:
>
> | id | crane | container | weight | flags | from → to |
> |---|---|---|---|---|---|
> | move-1 | crane-a | MSCU4823157 | 2,300 kg | — | BAY 22 ROW 04 TIER 82 → YARD A-12-3 |
> | move-2 | crane-a | MAEU7391024 | 40,100 kg | IMDG 3 · over walkway | BAY 22 ROW 06 TIER 84 → YARD H-04-1 |
> | move-3 | crane-b | CMAU2210896 | 28,400 kg | reefer | BAY 18 ROW 02 TIER 86 → REEFER STACK R-03-2 |
> | move-4 | crane-b | HLXU8845213 | 36,800 kg | twin-lift · over walkway | BAY 18 ROW 08 TIER 82 → YARD C-07-2 |
>
> Each row has a `Dispatch` action, and an `Abort` action once running.
>
> **D. The move sequence strip** — the physical crane sequence, shown inline on
> a dispatched row. Eight states in order:
> `QUEUED → GANTRY → TROLLEY → SPREADER → TWISTLOCK → HOISTING → LANDING → RELEASED`
>
> **The TWISTLOCK step is the hero moment.** On a real crane the PLC will not
> authorise a hoist until all four twistlock sensors confirm — so the move
> *pauses* there waiting for FlowGuard's decision. Design that hold explicitly:
> a visible pause with a countdown, resolving to one of two labelled outcomes:
>
> - `HOIST AUTHORISED — decision` (a decision arrived in time)
> - `HOIST AUTHORISED — timeout · lifted unprotected` (none arrived; the crane
>   lifts anyway)
>
> Both outcomes must be legible and neither should look like an error. The
> second one is a deliberate safety property — FlowGuard never blocks a crane —
> so show it plainly rather than hiding it.
>
> Show all four rows in different states simultaneously: move-1 `RELEASED`,
> move-2 held at `TWISTLOCK` mid-countdown, move-3 `QUEUED`, move-4 `HOISTING`.
>
> **E. Live decision feed.** A reverse-chronological log with timestamps in the
> margin. Entries are workflow steps:
> `DEVICE_CHECKED` · `CONGESTION_CHECKED` · `CRITICALITY_ASSESSED` · `DECIDED` ·
> `ALLOCATED` · `QOS_STATUS_CHANGED` · `RELEASED`. Each line carries the
> operation id (e.g. `move-2-30377efc`) and a one-line summary.
>
> Include a `Reset berth` control, and a socket-connected indicator.

---

## Phase 2 — Decision Trail  (route `/operations/:id`)

> Generate the **Decision Trail** — the "prove it" page for a single operation.
> Header: operation `move-2-30377efc`, crane `crane-a`, container
> `MAEU7391024`, workflow `operation-move-2-30377efc`, status `COMPLETED`.
>
> The body is a vertical trail of seven steps, each expandable. Timestamps in
> the margin. Rules between steps, no cards.
>
> 1. **DEVICE_CHECKED** — `reachable: true`, connectivity `DATA`
> 2. **CONGESTION_CHECKED** — congestion `High`, predicted, confidence `0.82`
> 3. **CRITICALITY_ASSESSED** — *the richest step; give it the most room:*
>    - verdict `HIGH` · confidence `0.94` · `safety-critical` · model
>      `openai/gpt-5.6-luna`
>    - **reasoning, rendered verbatim as readable prose** (this is the most
>      persuasive thing on the page, so set it properly — do not truncate it
>      into a tooltip):
>      *"This lift is safety-critical because the load is 40.1 tonnes and its
>      path crosses an active quay walkway. The operator is driving from the
>      control room on a live uplink video feed, and interrupting that feed
>      mid-lift cannot be undone safely."*
>    - **graph path** — the reasoning graph's route, showing it looped:
>      `classify → gather_evidence → classify → validate`
>    - **tool calls the agent chose**: `retrieve_device_location` (with its
>      arguments and result). Note it chose this itself; nothing prompted it.
>    - **beside the tool calls, the complete toolbox as a two-column diagram:**
>      READ — `verify_device_location`, `retrieve_device_location`,
>      `check_device_status`, `check_network_congestion`; and WRITE — *empty*.
>      Label it clearly: the model has no mechanism to allocate. Use blueprint
>      annotation here — hairline leaders, small-caps callouts. This is a
>      safety-boundary claim, so it should read as a specification drawing.
> 4. **DECIDED** — action `QOD_AND_SLICE`, rule `SAFETY_CRITICAL_CONGESTED_SLICE`
> 5. **ALLOCATED** — session `0b3fdcd0-dea0-46a6-acdd-78be028320af`, profile
>    `DOWNLINK_M_UPLINK_L`, duration `180s`
> 6. **QOS_STATUS_CHANGED** — `REQUESTED → AVAILABLE`
> 7. **RELEASED** — `qodReleased: true`, `sliceDetached: true`
>
> **Network receipts.** Steps 5 and 6 expand into the real HTTP exchange —
> method, path, request body, response body, latency. Present it as an
> instrument printout, not a syntax-highlighted code editor:
>
> ```
> POST /quality-on-demand/v1/sessions        340 ms
> POST /congestion-insights/v0/query          128 ms
> GET  /device-attach/v0/attachments          210 ms
> ```
>
> Add a `raw execution` toggle showing Temporal's own view of the workflow —
> workflowId, runId, status, startedAt, closedAt — labelled as the authoritative
> record that the projection is derived from.

---

## Phase 3 — The Contrast  (route `/thesis`)

> Generate **The Contrast** — a two-column comparison that makes one argument:
> *criticality triggers protection; congestion never does on its own.*
>
> Same crane, same SIM, same cell, same congestion reading, minutes apart —
> opposite outcomes.
>
> | | **move-1** | **move-2** |
> |---|---|---|
> | crane | crane-a | crane-a |
> | SIM | +99999991001 | +99999991001 |
> | container | MSCU4823157 | MAEU7391024 |
> | weight | 2,300 kg | 40,100 kg |
> | hazard | — | IMDG class 3 |
> | over walkway | no | yes |
> | congestion | **High** | **High** |
> | device reachable | true | true |
> | → criticality | **LOW** (0.92) | **HIGH** (0.94) |
> | → action | **NONE** | **QOD_AND_SLICE** |
>
> **Design the divergence.** Rows where the two sides are *identical* should be
> visually quiet and clearly marked as matching — that is the whole argument.
> The two rows where they differ should be unmistakable. Use the single accent
> colour only on the diverging rows.
>
> Beneath each column, the model's own reasoning in prose.
>
> Add a caption line stating the claim in one sentence, and a control to re-run
> the pair live.

---

## Phase 4 — Impact  (route `/impact`)

> Generate the **Impact** page. Real values from the running system:
>
> - total decisions `11`
> - premium granted `7`
> - critical operations protected `100%`
> - critical unprotected `0`
> - critical correctly withheld (network healthy) `1`
> - unnecessary allocation avoided `3`
> - by action — `NONE 4` · `QOD 1` · `QOD_AND_SLICE 6`
> - by criticality — `HIGH 7` · `MEDIUM 1` · `LOW 3`
>
> **The centrepiece is an input, not a claim.** A field where the viewer types
> *their own* cost of a stopped crane per hour (default `50000`), and the page
> expresses the protected operations in their money. Design it so the input is
> obviously editable and the derived figure obviously recalculates — the point
> is that the number is the viewer's assumption, not our assertion.
>
> Also express operations as **moves**: a quay crane runs 25–40 moves/hour, so
> roughly 90 seconds ≈ one move.
>
> **No pie charts and no donut charts.** If a distribution needs showing, use a
> ruled horizontal bar or a plain figure table. Keep the instrument-record
> discipline: numbers, rules, and restraint.
>
> Add one honest caveat line in the margin, set quietly: this counts operations
> protected while genuinely at risk — not accidents prevented.

---

## Phase 5 — Operations History  (route `/operations`)

> Generate the **Operations History** page — every operation the system has ever
> decided on, newest first. This is how a finished operation stays reachable:
> the Control Room only shows what is currently running, so without this page a
> completed lift and its decision trail become unreachable.
>
> A ruled table — rows separated by hairlines, no cards, no zebra striping.
> Timestamps in a margin column. All figures tabular monospace.
>
> Columns: time · operation id · device · criticality (with confidence) ·
> congestion · action · duration · released.
>
> These eleven rows are the real contents of the system after a demo run — keep
> them exactly, they reconcile with the Impact page:
>
> | time | operation | device | criticality | congestion | action | duration | released |
> |---|---|---|---|---|---|---|---|
> | 02:14:07 | move-2-30377efc | crane-a | HIGH 0.94 | High | QOD_AND_SLICE | 3m 04s | yes |
> | 02:11:52 | move-1-a7fe7e7b | crane-a | LOW 0.92 | High | NONE | — | — |
> | 01:58:20 | drone-3-leak | drone-3 | HIGH 0.91 | High | QOD_AND_SLICE | 2m 41s | yes |
> | 01:57:50 | drone-3-routine | drone-3 | LOW 0.88 | High | NONE | — | — |
> | 01:44:11 | crane-lift-a392-6b2f | crane-a | HIGH 0.94 | High | QOD_AND_SLICE | 3m 00s | yes |
> | 01:39:02 | ambulance-1-inbound | ambulance-1 | HIGH 0.96 | Medium | QOD_AND_SLICE | 4m 12s | yes |
> | 01:31:44 | move-4-c81a2d90 | crane-b | HIGH 0.89 | High | QOD_AND_SLICE | 2m 55s | yes |
> | 01:22:18 | move-3-f4e07b11 | crane-b | MEDIUM 0.71 | High | QOD | 2m 30s | yes |
> | 01:15:06 | survey-drone-2-map | drone-2 | LOW 0.85 | Medium | NONE | — | — |
> | 01:09:33 | inspect-riser-7 | drone-1 | HIGH 0.90 | **Low** | **NONE** | — | — |
> | 00:58:47 | gantry-reposition-b | crane-b | HIGH 0.87 | High | QOD_AND_SLICE | 2m 12s | yes |
>
> **Two rows deserve special treatment, and they are opposites:**
>
> - `move-1-a7fe7e7b` and `drone-3-routine` — LOW criticality under **High**
>   congestion, deliberately left alone. Correct restraint.
> - `inspect-riser-7` — **HIGH** criticality but **Low** congestion, also left
>   alone. The network was already fine, so nothing was needed. Mark this one
>   clearly; people read it as a miss when it is the system working.
>
> Add filter controls along the top as plain text toggles (not pill buttons):
> all · protected · left alone · safety-critical. Show the count for each.
>
> Every row clicks through to its decision trail. Include a footer line showing
> pagination state — `11 of 11`.

---

## Phase 6 — Policy  (route `/policy`)

> Generate **The Policy** page — the complete decision logic, on one screen.
>
> The argument this page makes: *a language model classifies how critical the
> job is; it never decides what the network does.* That second half is a pure
> function with eight named rules, evaluated in order, and it is exhaustively
> tested. This page shows all eight so nobody has to take that on trust.
>
> Present it as an **ordered evaluation sequence**, not a flat grid — the order
> is part of the logic. Number them. Use blueprint annotation: hairline leaders,
> small-caps labels, generous margins. It should read like a specification
> sheet, not a settings screen.
>
> | # | rule | fires when | action |
> |---|---|---|---|
> | 1 | `GUARD_DEVICE_UNREACHABLE` | device is not reachable | `NONE` |
> | 2 | `ROUTINE_NO_ACTION` | criticality is `LOW` — **at any congestion level** | `NONE` |
> | 3 | `SAFETY_CRITICAL_ALWAYS_PROTECT` | safety-critical **and** unconditional protection is enabled | `QOD_AND_SLICE` / `QOD` |
> | 4 | `MEDIUM_CRITICALITY_HIGH_CONGESTION` | criticality `MEDIUM` and congestion ≥ `High` | `QOD` |
> | 5 | `MEDIUM_CRITICALITY_NETWORK_HEALTHY` | criticality `MEDIUM` and congestion below `High` | `NONE` |
> | 6 | `HIGH_CRITICALITY_NETWORK_HEALTHY` | criticality `HIGH` and congestion below `Medium` | `NONE` |
> | 7 | `SAFETY_CRITICAL_CONGESTED_SLICE` | criticality `HIGH`, safety-critical, congested, slice available | `QOD_AND_SLICE` |
> | 8 | `HIGH_CRITICALITY_CONGESTED` | criticality `HIGH` and congestion ≥ `Medium` | `QOD` |
>
> **Rule 2 is the thesis — give it visual weight above all the others.** Set a
> pull-quote beside it: *"Congestion alone is never a reason to act."* It is the
> single rule that separates this product from a congestion monitor.
>
> **Rule 3 is off by default, and say so plainly in the margin** — the headline
> saving comes from *not* allocating when nothing is actually at risk. Show it
> greyed, marked `disabled`, with that reason next to it. An honest disabled
> rule is more convincing than eight active ones.
>
> Below the rules, a **thresholds** block, styled as editable configuration
> (these are environment values, changeable without a code edit — being able to
> flip one and re-run live is the point):
>
> ```
> qod_congestion_threshold          Medium
> medium_criticality_threshold      High
> enable_slice_escalation           true
> always_protect_safety_critical    false
> ```
>
> Finally, an **applied** state: a banner showing this page arrived from
> operation `move-2-30377efc`, with rule 7 `SAFETY_CRITICAL_CONGESTED_SLICE`
> lit in the accent colour and the others quiet. Show both states in the file —
> the neutral reference view and the applied view.
>
> No flowchart, no node graph. A numbered ordered list of conditions is more
> legible and more auditable than a diagram.

---

## Phase 7 — App shell & states

> Generate the **application frame and every non-happy state**. These get
> forgotten and then they are what everyone actually sees first.
>
> **A. Masthead** — not a sidebar. A single horizontal band with a hairline
> under it, full width preserved for content:
>
> - left: `FLOWGUARD` and a one-line descriptor
> - centre: six nav items as rule-separated text, not pills —
>   `Control Room · Operations · Policy · Thesis · Impact`
> - right, quiet and small:
>   - an environment readout: `nokia · gpt-5.6-luna` (and the alternate state,
>     `mock · offline`)
>   - a `Run scenario ▾` control listing `crane-lift`, `drone-contrast`,
>     `ambulance-telemedicine`
>   - a live indicator (socket connected / disconnected)
>   - a light/dark toggle
>   - an identity chip: `Terminal Supervisor · Berth 3` — context only, this
>     product has no login and the chip must not imply one
>
> **B. Empty state** — fresh system, nothing dispatched yet, holdings at `0`.
> This is the first thing anyone sees, so it must read as *ready*, not broken.
> Keep the berth header and the work queue fully present; only the decision feed
> and holdings are empty. Give the empty feed one quiet line telling the viewer
> to dispatch a move.
>
> **C. Disconnected** — the socket dropped. The page still renders its last
> known data, but it is no longer live, and that must be unmistakable: a
> persistent band stating live updates have stopped and when data was last
> received. Do not use a toast that fades; this state persists until fixed.
>
> **D. Server unreachable** — a different, more severe state than C. The API
> itself is not answering. Show what the viewer should check.
>
> **E. Loading** — first paint before data lands. Ruled placeholder lines that
> match the final row heights exactly, so nothing shifts when data arrives. No
> spinners, no shimmer.
>
> **F. Action failure** — dispatching a move that is already running returns a
> conflict; an unknown move returns not-found. Show an inline message on the
> affected row itself, not a floating toast.
>
> **G. 404** — an unknown route. One line, one link back. Keep it in the same
> typographic voice as everything else; do not make it cute.

---

## After Claude Design returns

Drop the generated files in `client/design/`:

```
01-control-room.html      04-impact.html
02-decision-trail.html    05-operations.html
03-thesis.html            06-policy.html
                          07-shell-and-states.html
```

They get read and ported onto the existing typed data layer
(`client/src/types`, `client/src/api`, `client/src/hooks`) — the field names
above already match it, so the port is mostly markup-to-JSX plus wiring hooks.

Two backend changes land during the port, both known and scoped:

1. **The policy rule name is not yet persisted.** `decide()` returns it, but the
   workflow folds it into a prose string instead of sending it as a field, so
   Phase 6's "applied" state cannot light up the fired rule yet. Fix touches the
   agent's emit, `RecordDecisionDto`, `DecisionRecord`, the Mongoose schema, and
   `MongoDecisionLogRepository.toDomain()` — four places on the server, and the
   mapper is the one that gets forgotten.
2. **Runtime provider config is not exposed.** Nothing tells the dashboard
   whether it is running against real Nokia or the mock, so the masthead
   environment readout needs a small endpoint or an extra block on `/health`.
