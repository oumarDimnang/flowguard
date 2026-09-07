# Claude Design prompt — the decision graph (v2, space)

Supersedes v1. The first attempt used flat ruled plates on warm paper, which
read as 2D and orbited badly — a rotated rectangle still looks like a
rectangle, and hairlines on a light ground give no depth cue at all.

Copy everything inside the block. It is self-contained.
Result goes in `client/design/08-decision-graph.html`.

---

> I need an **interactive 3D decision graph** — a dark, space-like scene where
> each node is a shaded sphere — for an operations dashboard called FlowGuard.
> It visualises one completed AI-agent workflow.
>
> A previous attempt used flat rectangular plates on a light background with
> hairline edges. It read as a flat diagram and the orbit was janky. This
> version should feel like looking into a volume.
>
> ## The idea the visuals have to carry
>
> Two kinds of node, and telling them apart at a glance is the entire point:
>
> - **Agent-decided** — a language model judged its own confidence, chose which
>   evidence to go and fetch, and decided whether to escalate to a costlier
>   model. Nobody scripted this; the path differs run to run.
> - **Deterministic** — a fixed durable workflow and a pure rule function.
>   Identical every run, exhaustively tested.
>
> The product's safety claim is that the model chooses *what to look at* while
> deterministic code chooses *what to do*. So the two kinds should look like
> different classes of object, not the same object in two colours:
>
> - **Deterministic spheres**: smaller, cooler, precise. Tight specular
>   highlight, crisp rim. Like machined navigation beacons on a rail.
> - **Agent spheres**: larger, warmer, softer. Diffuse halo, slow subtle
>   breathing pulse, faint orbital ring. Like stars.
> - **Untaken options**: unlit — a thin wireframe ring where a sphere would be,
>   no fill, no glow. Present but dark.
>
> ## Palette — deep space, warm rather than blue
>
> ```
> --void:       oklch(0.16 0.008 95);    /* background, warm near-black   */
> --void-deep:  oklch(0.11 0.006 95);    /* vignette / far falloff        */
> --ink:        oklch(0.88 0.012 93);    /* primary text                  */
> --ink-dim:    oklch(0.62 0.010 95);    /* secondary text                */
> --agent:      oklch(0.70 0.150 40);    /* clay — agent nodes, hot        */
> --agent-glow: oklch(0.62 0.170 42);
> --machine:    oklch(0.82 0.030 220);   /* cool white-blue — deterministic */
> --edge:       oklch(0.40 0.010 95);    /* dormant edges                  */
> --danger:     oklch(0.64 0.208 25);
> ```
>
> Fonts: **JetBrains Mono** for every identifier, payload and number;
> **IBM Plex Sans** for prose. Numbers use `font-variant-numeric: tabular-nums`.
>
> ## Technique — CSS 3D, no library
>
> Build it by hand with CSS 3D transforms. Spheres are the right primitive here
> precisely because they are rotationally symmetric: they look correct from
> every angle with no billboarding.
>
> A sphere is a `border-radius: 50%` div with a layered
> `radial-gradient` — an off-centre highlight, a mid tone, a darkened terminator
> edge — plus a `box-shadow` halo for the agent ones. That reads as a lit ball
> from any angle.
>
> **Structure, exactly:**
>
> ```
> .viewport   perspective: 1200px; perspective-origin: 50% 45%
>   .scene    transform: rotateX(var(--rx)) rotateY(var(--ry)); transform-style: preserve-3d
>     .node   transform: translate3d(x, y, z); transform-style: preserve-3d
>       .sphere
>       .label  transform: rotateY(calc(-1 * var(--ry))) rotateX(calc(-1 * var(--rx)))
> ```
>
> **Three things that silently flatten a 3D scene — avoid all of them:**
>
> 1. `filter` on any ancestor of a `preserve-3d` subtree. A blur or drop-shadow
>    on a wrapper creates a new stacking context and collapses everything to a
>    plane. Put filters on the sphere itself, never on a parent.
> 2. `opacity` below 1 on an ancestor. Same effect. Fade individual spheres, not
>    the group.
> 3. `overflow: hidden` on an ancestor. Same again. Let the scene overflow; mask
>    with a vignette overlay positioned *outside* the transformed subtree.
>
> **Orbit, so it does not judder:**
>
> - accumulate pointer deltas into `rx` / `ry` numbers; write them as CSS custom
>   properties on `.scene` inside a single `requestAnimationFrame`
> - never read layout (`getBoundingClientRect`, `offsetWidth`) during a drag
> - clamp `rx` to ±30°, `ry` to ±60°
> - ease toward the target rather than snapping — a small lerp each frame
> - use Pointer Events with `setPointerCapture` so the drag survives leaving
>   the element
> - dolly with wheel by changing `perspective`, clamped, not by scaling
>
> ## Depth cues — this is what makes it read as 3D
>
> All five, together:
>
> 1. **Parallax starfield.** Three layers of small dots at different z, so they
>    slide past each other as the scene turns. This single element sells the
>    depth more than anything else, because it moves differently from the graph.
> 2. **Atmospheric falloff.** Distant spheres are dimmer and less saturated.
> 3. **Depth of field.** A small blur on the furthest plane only — applied to
>    each sphere, never to a wrapper.
> 4. **Scale by distance**, handled naturally by `perspective`.
> 5. **A ground haze / vignette** darkening toward the edges of the viewport.
>
> ## Layout — three depths
>
> **z = 0 · the deterministic rail.** Seven spheres in a straight line, left to
> right, joined by a continuous lit filament. Small, cool, evenly spaced:
>
> | node | detail |
> |---|---|
> | `DEVICE_CHECKED` | reachable: true |
> | `CONGESTION_CHECKED` | congestion: High |
> | `CRITICALITY_ASSESSED` | HIGH · confidence 0.99 |
> | `DECIDED` | action QOD_AND_SLICE · rule SAFETY_CRITICAL_CONGESTED_SLICE |
> | `ALLOCATED` | session 0b3fdcd0 · slice attached |
> | `QOS_STATUS_CHANGED` | REQUESTED → AVAILABLE |
> | `RELEASED` | connectivity released |
>
> **z = −300 · the agent's reasoning**, floating behind and slightly above
> `CRITICALITY_ASSESSED`, as a loose cluster rather than a line. Four nodes.
> The path taken:
>
> ```
> classify (attempt 1) → gather_evidence → classify (attempt 2) → validate
> ```
>
> Draw `classify` **once**, with a curved edge looping back into it — the loop
> is the interesting thing. Label that edge `re-classify with evidence`. Also
> place `escalate`, connected but **unlit**: the model was confident at 0.99 and
> never needed a costlier one. Show the untaken branch as untaken; it is more
> convincing than hiding it.
>
> **z = −520 · the evidence**, further back, behind `gather_evidence`. The tool
> the agent chose for itself:
>
> - `verify_device_location` — lit, warm, with its result
>   `CONFIRMED: within 3000m of the stated location`
>
> Around it, three unlit rings — the read tools it had and did not call:
> `retrieve_device_location`, `check_device_status`, `check_network_congestion`.
>
> And, set apart, **an empty socket labelled `WRITE TOOLS · none exist`** — a
> dark ring with genuinely nothing inside it, no sphere, no glow. The model
> cannot allocate network capacity because no such tool is in its toolbox. In a
> field of lit spheres, an obviously empty orbital slot is the most striking
> object on screen, and it should be. Give it space around it.
>
> Connect the depths with visibly receding filaments so a viewer reads
> `CRITICALITY_ASSESSED` → reasoning → evidence as nesting.
>
> ## Motion — restrained, and meaningful
>
> - **Travelling pulses** along the traversed edges: a small bright dot moving
>   from node to node, continuously, slowly. This is the data flowing, and it
>   doubles as the path replay.
> - **Agent spheres breathe** — a very slow scale/opacity pulse, 4s or so.
>   Deterministic ones are perfectly still. Living versus machined.
> - **The scene drifts** a degree or two on its own when idle, so it never looks
>   frozen. Stops on interaction.
> - Everything respects `prefers-reduced-motion`: pulses and drift stop, the
>   scene stays fully usable.
>
> No particles, no lens flare, no starburst. The motion should read as
> instrumentation, not as a screensaver.
>
> ## Interaction
>
> - **Drag** to orbit. **Scroll** to dolly. A `reset view` control returns to
>   the default three-quarter angle.
> - **Hover**: the sphere brightens and its edges light along the path.
> - **Click** → selected, and an **inspector rail** slides in on the right — a
>   panel over the void, not a modal, never covering the graph. It shows:
>   - node name, in mono
>   - **who decided this** — the headline line: `agent` or `deterministic`, with
>     one sentence on what that means here
>   - what it did, in prose
>   - payload as a mono key/value list
>   - timestamp with milliseconds
>   - for agent nodes: confidence, model id `openai/gpt-5.6-luna`, and which
>     branches it did not take
> - **Keyboard**: arrows move between connected nodes, Enter selects, Escape
>   clears. Every node is a real focusable element with an accessible name.
> - **Replay** control that walks the traversed path, lighting each node in turn.
>
> Selecting `DECIDED` must state plainly that this branch was chosen by a pure
> function, not by the model, and name the rule.
>
> ## Header
>
> Operation `move-2-30377efc` · crane `crane-a` · container `MAEU7391024` —
> 40,100 kg, IMDG class 3, over an active walkway. Duration `0m 25s`. Two
> counts: **4 agent decisions**, **7 deterministic steps**.
>
> Keep the header restrained and typographic so the scene below carries the
> drama.
>
> ## Do not
>
> - no 3D library, no force-directed or physics layout — positions are fixed
> - no `filter`, `opacity < 1` or `overflow: hidden` on any ancestor of a
>   `preserve-3d` subtree
> - no canvas — spheres must be real DOM elements, focusable and selectable
> - no lens flare, no particle bursts, no animated gradient backgrounds
> - do not make agent and deterministic nodes look like the same object
> - do not put the inspector in a modal
>
> **Output**: one self-contained static HTML file, Tailwind CSS v4 utility
> classes, tokens on `:root` in a `<style>` block, and vanilla JavaScript for
> orbit, selection and replay. Desktop-first at 1440×900; must not break at
> 1024px.

---

## Notes for the port

The node set matches `DecisionStep` in
`server/src/decision-log/domain/decision-record.ts`. The reasoning path is what
`graphTrace` actually emitted on the recorded run. The four read tools are
`AGENT_READ_TOOLS` in `client/src/types/decision.ts`, where the write list is
genuinely empty and a test fails the build if that changes. `rule` and `modelId`
already reach the client.

**The untaken `escalate` branch is not in the data.** `graphTrace` records the
path taken, not the paths available — so plane B's node set is static, mirroring
the graph compiled in `agent/src/flowguard_agent/graph/assessment_graph.py`, and
only which nodes are *lit* comes from the trace. Same arrangement as the policy
page.

This page is the one deliberate exception to the Instrument Record language used
everywhere else. That is a defensible split — the ruled document pages are the
evidence, and this is the one screen whose job is to be looked at — but it does
mean it should live behind its own route rather than being embedded in a page
that is otherwise all hairlines and paper.
