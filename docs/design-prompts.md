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
> 10. **Density over air. This is the rule I most often have to repeat.**
>     FlowGuard is a shift tool for people who live in systems all day, not a
>     marketing page. Every page's primary content fits 1440×900 without
>     scrolling; anything below the fold is secondary detail, never the
>     headline. Regions sit side by side in a grid — a full-width band is
>     reserved for the one thing on the page that earns it. Row height comes
>     from the type, not from padding: a table row is 32–40px, not 64. Nothing
>     is vertically centred inside a container taller than its content. No
>     hero, no oversized display numbers, no section that breathes for its own
>     sake. If a layout feels roomy, it is wrong — an operator scanning this
>     daily wants more rows visible, not more air between them.
> 11. **One exception to rule 10:** the held-sessions readout on the Control
>     Room is a single very large numeral. It is the product's headline figure
>     and it is allowed the space. Nothing else on any page gets that
>     treatment.
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
> **The frame:** the app has a **fixed 240px left sidebar** carrying navigation,
> and every page renders in the column beside it. Design each page for that
> column — roughly 1200px of content width at a 1440px viewport — not for the
> full window. Do not draw a top navigation bar; there isn't one. Do not repeat
> the product name or the navigation inside the page.
>
> **Output format for every phase:** one self-contained static HTML file using
> Tailwind CSS v4 utility classes, with the tokens above declared in a `<style>`
> block on `:root` and `.dark`. No JavaScript frameworks — static markup showing
> the states I describe. Desktop-first at 1440×900, and the primary content must
> fit that height without scrolling. It must not break at 1024px wide.
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
> **A. Sidebar** — a fixed 240px left rail, hairline on its right edge, full
> height. There is no top navigation bar anywhere in this product.
>
> - top: `FLOWGUARD` and, under it, the signed-in user's organization —
>   `Khalifa Bin Salman Port`
> - navigation, grouped under small-caps mono labels, hairline between groups.
>   The active item is marked by a left rule in the accent and nothing else —
>   no pills, no fills, no icons:
>   - **Operations** — `Control Room`, `History`
>   - **Evidence** — `Policy`, `Thesis`
>   - `Impact` (its own ungrouped item)
>   - **Admin** — `Users` (hidden entirely below the `ADMIN` role)
> - footer, quiet and small, in this order:
>   - a `Run scenario ▾` control, shown only to `OPERATOR` and above
>   - a live indicator (socket connected / disconnected)
>   - server reachability and the API host
>   - the signed-in user's name and role, e.g. `Layla Al Mansoori` /
>     `operator`
>   - `sign out` and a light/dark toggle, side by side
>
> This product **does** have authentication: httpOnly session cookies, three
> roles (`VIEWER`, `OPERATOR`, `ADMIN`), and one organization per user. Design a
> **login page** too — email, password, submit, an error state for bad
> credentials, and a quiet list of demo accounts. It is the first screen anyone
> sees and it should look like the rest of the product, not like a template.
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
   whether it is running against real Nokia or the mock, so the sidebar's
   environment readout needs a small endpoint or an extra block on `/health`.

---

# Second series — the pages added after the first port

Same rules as Phase 0: paste the design language block above at the top of each
prompt, or refer back to it. Every identifier, rule name, device id, tool name
and enum value below is taken from the running system — keep them verbatim.

**Rule 10 applies to all of these and is the one that keeps getting missed.**
Where a prompt lists numbered regions it is naming the content, not prescribing
a vertical stack — lay them out in a grid so all of them are on screen at
1440×900. A page of full-width bands stacked down the viewport is a rejected
design, however good each band is on its own.

Two of these need backend work before they can be wired to live data, noted
under each. Design them anyway; the markup ports either way.

---

## Phase 8 — Analysis

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Analysis**. Everything else in this product shows
> either *now* (Control Room) or *one operation* (Decision Trail). This page is
> the only one that shows *pattern*, and its job is to make the product's
> central claim checkable at a glance rather than asserted.
>
> Four regions, hairline-separated, laid out as a **two-by-two grid** that fits
> one screen: the decision matrix and the held-over-time chart share the top
> row, the rule bars and the latency distribution share the bottom. The matrix
> gets the visual weight — it is the argument — but not extra height. Nothing
> here scrolls.
>
> **1. Decision matrix — the headline.** A 3×3 grid: rows are criticality
> `HIGH` / `MEDIUM` / `LOW` (top to bottom), columns are congestion `Low` /
> `Medium` / `High` (left to right). Each cell holds a count and the action that
> dominates it. Use this real data:
>
> - HIGH × Low → 0, HIGH × Medium → 0, HIGH × High → 7 `QOD_AND_SLICE`
> - MEDIUM × Low → 0, MEDIUM × Medium → 0, MEDIUM × High → 4 `QOD`
> - LOW × Low → 0, LOW × Medium → 0, LOW × High → 4 `NONE`
>
> The whole argument is that the **LOW row reads NONE straight across**
> regardless of which congestion column it sits in. Make that legible without a
> caption doing the work — the reader should see it before they read anything.
> Empty cells must still be drawn, and must not look like an error. Annotate in
> the margin: "congestion rises left to right and changes nothing along the
> bottom row."
>
> **2. Sessions held over time.** A step chart, x = time, y = number of premium
> sessions held concurrently. The line must return to zero after every
> operation — a sawtooth, not a staircase. That return is the product. Label the
> y-axis in whole sessions (no decimals), mark the peak, and put a hairline at
> y=0 that the line visibly touches. Around 20 samples over 40 minutes.
>
> **3. Rules fired.** Horizontal bars, one per policy rule, longest first.
> **Show all eight rules including the ones with a count of zero** — a rule that
> has never fired is information, not an empty row to hide. Real names and
> counts:
>
> ```
> SAFETY_CRITICAL_CONGESTED_SLICE        7
> ROUTINE_NO_ACTION                      4
> MEDIUM_CRITICALITY_HIGH_CONGESTION     4
> GUARD_DEVICE_UNREACHABLE               4
> HIGH_CRITICALITY_CONGESTED             0
> HIGH_CRITICALITY_NETWORK_HEALTHY       0
> MEDIUM_CRITICALITY_NETWORK_HEALTHY     0
> SAFETY_CRITICAL_ALWAYS_PROTECT         0   (disabled in configuration)
> ```
>
> Mark the disabled one distinctly from the merely-unfired ones — hollow glyph
> versus zero-length bar. Each rule name links to the Policy page.
>
> **4. Decision latency.** A compact distribution of seconds from first network
> read to decision, with a labelled hairline at 30s marked "twistlock interlock
> opens regardless". Values cluster at 6–12s, one outlier at 19s. The point is
> that the whole distribution sits left of the line. Keep it short — this is a
> quarter of the page, not a chart that needs its own screen.
>
> Page header: "Analysis", with `19 decisions · 11 protected · 42.1% left on
> standard connectivity` as marginal meta.
>
> **Backend note for the port:** the matrix and the rule counts need a cross-tab
> the `/metrics` endpoint does not compute yet, and the time series has to be
> derived from `ALLOCATED`/`RELEASED` timestamps in the decision log. Design
> against the numbers above; I will build the aggregation.

---

## Phase 9 — Network

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Network**. This is the CAMARA side of the product,
> which currently has no home in the interface — you can only see network state
> one operation at a time. A judge who says "show me the network" should land
> here.
>
> **Layout:** two columns. Held sessions and the slice on the left (the left
> column is wider); congestion and endpoint status stacked in the right column.
> Call receipts sit collapsed along the bottom as a single ruled row that opens
> on demand. All of it above the fold when collapsed.
>
> **1. Held right now.** A table of active Quality on Demand sessions: session
> id (`mock-qod-crane-b-0001`), device (`crane-b`), status `REQUESTED` /
> `AVAILABLE` / `UNAVAILABLE` as a glyph plus the word, QoS profile
> `DOWNLINK_M_UPLINK_L`, requested duration and time remaining as a countdown in
> a fixed-width slot, and the attached slice id where there is one. Show two
> active rows and one that has just gone to `UNAVAILABLE`. Above the table, one
> line: "2 sessions · 1 slice attachment · held 00:41".
>
> **2. The slice.** `mock-urllc-slice-01`, state `OPERATING`, with the devices
> currently attached listed beneath it. Include a marginal note that a slice is
> pre-provisioned at bootstrap because provisioning takes minutes, and that only
> attach and detach happen per operation.
>
> **3. Congestion by device.** A compact list, device id against congestion
> level, using real values: `crane-a` High, `crane-b` High, `drone-3` High,
> `drone-9` High, `medic-12` High, `ambulance-7` Medium. Levels are exactly
> `Low` / `Medium` / `High` — that casing is the CAMARA contract, do not
> normalise it. Mark that congestion is an input to the decision and never a
> trigger on its own.
>
> **4. Endpoint status.** The five CAMARA APIs FlowGuard depends on, with the
> real REST path under each display name and a last-seen status. None of the
> catalogue names map onto their paths, which is itself worth showing:
>
> ```
> Device Reachability     POST /device-status/device-reachability-status/v1/retrieve
> Congestion Insights     POST /congestion-insights/v0/query
> Quality on Demand       POST /qod/v0/sessions
> Slice Device Attach     GET  /device-attach/v0/attachments
> Location Verification   POST /location-verification/v1/verify
> ```
>
> **5. Call receipts.** The last few raw request/response pairs, monospace,
> collapsed by default, in the blueprint-annotation style. These are the
> evidence that the integration is real rather than described.
>
> In the sidebar footer, beside the live indicator, an unmissable readout of
> which provider is answering: `mock` or `nokia`. Design both states.

---

## Phase 10 — Agent

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Agent**. The product's claim is that a model chooses
> what to *look at* while deterministic code chooses what to *do*. Today that
> can only be argued from a single operation. This page shows the pattern across
> every run.
>
> **Layout:** the toolbox occupies the left third at full height — it is the
> point of the page and reads as a single column of tools with the empty write
> group beneath the read group. The right two thirds hold confidence, passes and
> models as a compact row, with recent choices as a dense log filling whatever
> is left. One screen.
>
> **1. The toolbox.** Two groups, and the contrast between them is the page.
> Read tools, with how many times the agent chose each:
>
> ```
> verify_device_location      9
> retrieve_device_location    2
> check_device_status         1
> check_network_congestion    0
> ```
>
> Then a **write tools** group containing nothing, rendered as a present-but-
> empty region rather than omitted — an empty socket, with the note "no write
> tool exists; a test fails the build if one is added". This should be the most
> arresting thing on the page.
>
> **2. Confidence.** A distribution of the model's self-reported confidence,
> 0 to 1, with a labelled threshold hairline at 0.80 marked "below this, the
> agent escalates to a stronger model". Almost every value sits at 0.98–0.99;
> two sit at 0.78 and 0.84. Show that honestly — the cluster against the wall is
> the finding.
>
> **3. Passes per assessment.** How often the agent was satisfied on the first
> reading versus went to gather evidence and re-classified. `1 pass: 8`,
> `2 passes: 11`, `3 passes: 0`. Beneath it: `escalations: 0`.
>
> **4. Models.** The pinned primary `openai/gpt-5.6-luna` and the configured
> fallback `openai/gpt-5.6-terra`, with a note that ids are pinned rather than
> floating because a safety-critical decision path has to be reproducible for
> audit.
>
> **5. Recent choices.** A dense log: timestamp in the margin, the tool the
> agent chose, the operation it chose it for, and the one-line result — e.g.
> `verify_device_location · drone-9 · CONTRADICTED, 24,542 m from the stated
> site`. One line per call, no padding between them. Mark contradictions
> distinctly. Show enough rows that the list reads as a record rather than a
> sample — twelve or more.
>
> **Backend note for the port:** these aggregates come from `toolCalls` and
> `graphTrace` on `CRITICALITY_ASSESSED` records, which are stored but not
> aggregated anywhere yet.

---

## Phase 11 — Scenarios

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Scenarios**. Right now these live in a dropdown, which
> is fine for triggering one and useless for presenting from. This page is what
> a demo is driven from, so each entry has to say what it proves before it says
> what it does.
>
> Seven entries, ruled apart, **two lines each at rest** — id and name on the
> first, what it demonstrates on the second, with the Run control right-aligned
> on the row. The steps and the expected outcome are revealed on expansion, not
> printed for all seven at once; seven scenarios each printing four lines is the
> tall page rule 10 forbids. All seven visible without scrolling. The real set:
>
> ```
> stadium-incident        Public-safety priority comms
>   2 steps · medic-12 · standby at 0s, mass-casualty at 30s
>   Expects: LOW → NONE, then HIGH → QOD_AND_SLICE at identical congestion
>
> drone-contrast          Criticality, not congestion
>   2 steps · drone-3 · routine mapping at 0s, leak inspection at 30s
>   Expects: the same device refused, then protected, minutes apart
>
> contested-lift          The agent gathers before it judges
>   1 step · crane-b · a job whose own account contradicts itself
>   Expects: 2 or more read tools chosen unprompted before classifying
>
> false-claim             The network contradicts the paperwork
>   2 steps · drone-3 at 0s, drone-9 at 20s, word-for-word identical filings
>   Expects: CONFIRMED → slice; CONTRADICTED at 24 km → downgraded to QOD
>
> asset-offline           The guard clause
>   1 step · crane-c, modem off the network
>   Expects: a two-step trail, GUARD_DEVICE_UNREACHABLE, nothing spent
>
> crane-lift              Cross-industry generalisation
>   1 step · crane-a · 40-tonne IMDG class 3 over an active walkway
>   Expects: HIGH → QOD_AND_SLICE, released on completion
>
> ambulance-telemedicine  Same logic, different industry
>   1 step · ambulance-7 · live stroke consultation in transit
>   Expects: HIGH under Medium congestion → QOD
> ```
>
> Show a running scenario in progress: one entry expanded with its steps ticking
> through, elapsed time in the margin, and the operations it has spawned linked
> by id. Also show the resting state and a completed state where the expectation
> is marked met.
>
> A `Run` control is `OPERATOR`-only. Design the disabled state a `VIEWER` sees,
> with the reason stated rather than implied.

---

## Phase 12 — Asset

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Asset**, showing everything one device has ever done.
> Reached by clicking a device id anywhere in the product. Use `crane-b`.
>
> **Layout:** a one-line header, then the operations table taking the left two
> thirds at full height with location history and totals stacked in the right
> third. The behaviour strip is a single ruled band under the header, no taller
> than 80px.
>
> Header: `crane-b`, asset type `CRANE`, SIM identity `+99999991002`,
> organization "Khalifa Bin Salman Port" — all on one line, with operations run,
> total time holding premium connectivity and current congestion as marginal
> meta on the right of that same line.
>
> **1. Operations.** A dense table, newest first: time, operation id,
> criticality, congestion, action, held duration, and a link to the decision
> trail. Around eight rows, mixed outcomes — some `NONE`, some `QOD`, some
> `QOD_AND_SLICE`.
>
> **2. Behaviour over time.** A small strip showing this asset's decisions
> plotted against time, so a reader can see whether it is consistently
> protected, consistently left alone, or genuinely mixed. Mixed is the
> interesting case and is what this asset shows.
>
> **3. Location verification history.** Every time the network was asked whether
> this asset was where its job claimed: timestamp, claimed site, distance from
> it, verdict `CONFIRMED` or `CONTRADICTED`. All confirmed for `crane-b`, at 0 m
> from the berth. Include a marginal note explaining that a contradiction
> downgrades the claim rather than blocking the operation.
>
> **4. Totals.** Sessions requested, slice attachments, total held time, and —
> stated plainly — how much of the shift this asset spent on standard
> connectivity. That last figure is the product working, not a gap in coverage.

---

## Phase 13 — Users (admin)

> Following the FlowGuard "Instrument Record" design language from Phase 0.
>
> Design a page called **Users**, visible only to `ADMIN`. FlowGuard is
> multi-tenant: every user belongs to exactly one organization and sees only
> that organization's operations.
>
> A table: name, email, role, organization, last signed in. Roles are exactly
> `VIEWER`, `OPERATOR`, `ADMIN` — show them ordered by privilege with a one-line
> description of what each can do (`VIEWER` reads, `OPERATOR` can dispatch work
> and run scenarios, `ADMIN` additionally manages users). Real rows:
>
> ```
> Layla Al Mansoori    ops@khalifa-port.test        OPERATOR   Khalifa Bin Salman Port
> Rashid Buhazza       auditor@khalifa-port.test    VIEWER     Khalifa Bin Salman Port
> Noora Al Sayegh      ops@gulf-aerial.test         OPERATOR   Gulf Aerial Survey
> ```
>
> Include an invite control and an inline role change with a confirmation step,
> since a role change alters what somebody can do to a live facility.
>
> Somewhere on the page, state the isolation property plainly rather than
> leaving it implied: a user in one organization cannot see another's
> operations, and that is enforced in the data layer rather than in the UI.
>
> **Backend note for the port:** `UsersService` and `OrganizationsService` exist
> but neither has an HTTP controller, so this page needs endpoints built before
> it can be wired. The sidebar already links to `/admin/users` and currently
> falls through to the not-found page.
