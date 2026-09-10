# Authenticated demo runbook

This guide uses the dashboard to run the stadium contrast pair through the
server, Temporal, the agent, and the decision log. It assumes dependencies are
already installed and the services are configured for the team's mock demo.
The mock network and offline classifier need no external API access, but the
server still needs its configured MongoDB and Temporal services.

## Prepare the session

1. Keep the existing Temporal, server, and agent processes running. Do not start
   duplicate instances. If the dashboard is not running and its dependencies
   are already installed, run `npm run dev` from `client/` in another terminal.
2. Open the dashboard at the URL printed by Vite (normally
   `http://localhost:5173`). Sign in with your own demo account through the UI.
3. Confirm the displayed organization and role. Running scenarios requires
   **OPERATOR or ADMIN**. A VIEWER can inspect results but cannot launch a run.
   Registration creates a separate organization; it does not join the team's
   existing organization. Use the intended account to see the intended data.
4. Confirm with the person maintaining the local setup that the agent uses the
   mock network and offline classifier before rehearsing. This guide does not
   require opening configuration files, sharing credentials, or reseeding data.

## Present the stadium contrast

1. Open **Scenarios** (`/scenarios`). Expand `stadium-incident` to show what it
   demonstrates: the same device and congestion, with different business needs.
2. Click **Run** once. The returned run ID and operation links describe
   **scheduled** work; acceptance does not mean every operation has started or
   completed. Each run generates fresh operation IDs.
3. Follow the scheduled operations in **Operations** (`/operations`). A link for
   a future step may not resolve until that step starts. The routine standby is
   scheduled immediately; the incident is scheduled 30 seconds later.
4. Compare their decision trails under the default mock setup:

   | Evidence | Routine standby | Declared incident |
   |---|---|---|
   | Device | `medic-12` | `medic-12` |
   | Congestion | HIGH | HIGH |
   | Criticality | LOW | HIGH |
   | Decision | NONE | QOD_AND_SLICE |
   | Release | No allocation to release | Look for RELEASED after allocation |

   The simulator schedules the incident's completion signal 25 seconds after
   its event is accepted. Assessment, queueing, and activity retries can take
   longer; follow the recorded trail rather than promising an exact end time.
5. Show the reasoning and rule in the operation detail/decision graph. Explain:
   the agent assesses criticality and gathers evidence; deterministic policy
   chooses the network action. Congestion alone never justifies allocation.
6. Show **Impact** (`/impact`) if useful. Its figures aggregate this organization's
   recorded decisions, including previous runs. They are not measured network
   performance, billing, or device-hours saved. Do not promise a fixed percentage
   from one contrast pair or clear existing team data to obtain one.

## If something goes wrong

| Symptom | Meaning and next step |
|---|---|
| Returned to login / HTTP 401 | The request has no valid session. Sign in through the dashboard. A bare terminal request does not inherit the browser session. |
| Operator-access message / HTTP 403 | The signed-in account lacks the required role. Use the intended OPERATOR or ADMIN account; keep the server guard in place. |
| Could not load scenarios | The list request failed. Check service availability and use **Retry loading**. This differs from a successful empty list. |
| Scheduling could not be confirmed | The response failed or was interrupted. Check Operations before retrying: the server may already have accepted the request. |
| Scheduled operation never appears | Scheduling uses server timers. A later event submission can fail or a server restart can interrupt the schedule. Acceptance alone does not prove workflow execution. |
| Workflow exists but the trail is empty | Decision emission may have failed. Check the workflow activity status and discuss the failure with the service owner; do not paste configuration or secret values into reports. |

The Temporal UI is normally at `http://localhost:8233`. For a server-created
operation, its workflow ID is `operation-{organizationId}-{operationId}`.

## REST and direct Temporal inputs are different

The dashboard already sends its session with REST requests. Relevant routes are
`POST /simulator/scenarios/stadium-incident/run`, `GET /operations`,
`GET /decision-log/:operationId`, and `GET /metrics`. These require a signed-in
session; launching also requires OPERATOR-or-higher access. Prefer the dashboard
for rehearsal rather than copying session cookies into a terminal.

[`examples/stadium-incident.json`](examples/stadium-incident.json) and
[`examples/crane-lift.json`](examples/crane-lift.json) contain business-event
bodies. The stadium file describes only the incident, not the two-event contrast.
For authenticated `POST /events`, the server obtains `organizationId` from the
session, so do not add that field to the REST body. Use a fresh event ID for a
new operation; the simulator handles this automatically.

Direct Temporal execution bypasses that server entry point. These files omit
`organizationId`, so starting them directly leaves the workflow without the
nonempty organization required by `/internal/decisions`, producing HTTP 400 on
emission. A workflow may still finish because emission failure is non-fatal.

Even supplying an organization in a separate direct-workflow input does not
register the dashboard's operation record: registration happens in the server's
EventsService, and decision ingestion only updates an existing operation.
Direct execution is therefore a workflow-debugging path, not the complete demo
path. Use the authenticated simulator to demonstrate the full system.
