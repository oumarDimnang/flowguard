import { useState } from 'react';
import { Link } from 'react-router';

import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Loadable, SkeletonRows, Slot } from '@/components/primitives';
import { useResource } from '@/hooks/use-resource';
import { Role, type Scenario, type ScenarioRun } from '@/types';

/**
 * What each scenario is for, in one line.
 *
 * The server's own `description` is written for an API consumer and runs to
 * four sentences. This is the line a presenter says out loud, so it is kept
 * here rather than shipped in the payload — and keyed by id, so a scenario
 * added to the backend appears with its full description and no gap.
 */
const DEMONSTRATES: Record<string, string> = {
  'stadium-incident':
    'The same paramedic unit, the same congestion, thirty seconds apart — refused, then protected.',
  'drone-contrast':
    'The thesis in its original form: one drone, two jobs, opposite decisions.',
  'contested-lift':
    'A job whose own account contradicts itself. Watch the agent choose what to check.',
  'false-claim':
    'Two identical emergency filings. Only the network can tell them apart.',
  'asset-offline':
    'The cheapest check in the system, refusing to spend on an asset that is not there.',
  'crane-lift': 'The same logic in a container terminal rather than the air.',
  'ambulance-telemedicine': 'And again in an ambulance. The policy never changed.',
};

/** What the run should produce, as a claim it will confirm or falsify. */
const EXPECTS: Record<string, string> = {
  'stadium-incident': 'LOW → NONE, then HIGH → QOD_AND_SLICE at identical congestion',
  'drone-contrast': 'the same device left alone, then protected, minutes apart',
  'contested-lift': 'two or more read tools chosen unprompted before classifying',
  'false-claim': 'CONFIRMED → slice; CONTRADICTED at 24 km → downgraded to QOD',
  'asset-offline': 'a two-step trail, GUARD_DEVICE_UNREACHABLE, nothing spent',
  'crane-lift': 'HIGH → QOD_AND_SLICE, released on completion',
  'ambulance-telemedicine': 'HIGH under Medium congestion → QOD',
};

/**
 * The scripted runs, as something to present from.
 *
 * These lived in a sidebar dropdown, which is fine for triggering one and
 * useless for driving a demo: it says what each is called and nothing about
 * what it proves. Here every entry leads with the claim, so the page can be
 * read top to bottom as an argument rather than a menu.
 */
export function Scenarios() {
  const { can } = useAuth();
  const scenarios = useResource((signal) => api.simulator.scenarios(signal), []);
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const dispatchable = can(Role.OPERATOR);

  const run = async (scenarioId: string) => {
    setBusy(scenarioId);
    try {
      const result = await api.simulator.run(scenarioId);
      setRuns((previous) => ({ ...previous, [scenarioId]: result }));
      setOpen(scenarioId);
    } finally {
      setBusy(null);
    }
  };

  const list = scenarios.data ?? [];

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Scenarios' }]}
        title="Scenarios"
        description="Scripted, reproducible runs. Each one states what it should produce before you start it, so the run either confirms the claim or falsifies it."
        meta={
          <>
            <Slot ch={1}>{list.length}</Slot> scenarios ·{' '}
            {dispatchable ? 'operator' : 'read only'}
          </>
        }
      />

      {!dispatchable ? (
        <p className="log-row border-t border-b py-3">
          <Eyebrow className="pt-0.5">read only</Eyebrow>
          <span className="text-muted-foreground">
            Running a scenario dispatches real business events and can allocate paid network
            capacity, so it needs an operator account. Everything on this page is visible to
            you; only the run control is not.
          </span>
        </p>
      ) : null}

      <section className="border-t">
        <Loadable
          loading={scenarios.loading}
          empty={list.length === 0}
          skeleton={
            <SkeletonRows
              rows={7}
              layoutClassName="flex flex-col gap-2"
              rowClassName="border-t py-3"
              columns={['30%', '60%']}
              closing={false}
            />
          }
          whenEmpty={
            <p className="border-t py-3 text-xs text-muted-foreground">
              No scenarios are defined on the server.
            </p>
          }
        >
        {list.map((scenario) => (
          <ScenarioRow
            key={scenario.id}
            scenario={scenario}
            run={runs[scenario.id]}
            busy={busy === scenario.id}
            canRun={dispatchable}
            expanded={open === scenario.id}
            onToggle={() => setOpen((current) => (current === scenario.id ? null : scenario.id))}
            onRun={() => void run(scenario.id)}
          />
        ))}
        </Loadable>

        <div className="border-t" />
      </section>
    </>
  );
}

/**
 * One scenario: two lines at rest, its steps on demand.
 *
 * Seven scenarios each printing their full step list is four screens of page
 * for a set nobody reads exhaustively. The claim is what earns the permanent
 * row; the mechanics are one click away.
 */
function ScenarioRow({
  scenario,
  run,
  busy,
  canRun,
  expanded,
  onToggle,
  onRun,
}: {
  scenario: Scenario;
  run: ScenarioRun | undefined;
  busy: boolean;
  canRun: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const steps = scenario.steps ?? [];

  return (
    <article className="border-t py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4">
        <button
          type="button"
          onClick={onToggle}
          className="btn-bare flex min-w-0 flex-col items-start gap-0.5 text-left"
          aria-expanded={expanded}
        >
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="datum text-[13px] font-medium">{scenario.id}</span>
            <span className="text-[13px] text-muted-foreground">{scenario.name}</span>
          </span>
          <span className="text-[13px]">
            {DEMONSTRATES[scenario.id] ?? scenario.description}
          </span>
        </button>

        <div className="flex items-center gap-3">
          {run ? (
            <span className="datum text-[11px] text-primary">
              run {run.runId.slice(0, 8)}
            </span>
          ) : null}

          {canRun ? (
            <button
              type="button"
              onClick={onRun}
              disabled={busy}
              className="btn-line shrink-0"
            >
              {busy ? 'running…' : 'Run'}
            </button>
          ) : (
            <span className="datum text-[11px] text-muted-foreground">operator only</span>
          )}
        </div>
      </div>

      {expanded ? (
        <div className="log-row pt-3">
          <Eyebrow className="pt-0.5">expects</Eyebrow>
          <div className="flex flex-col gap-3">
            <p className="datum text-[13px]">{EXPECTS[scenario.id] ?? '—'}</p>

            <p className="max-w-[74ch] text-[13px] text-muted-foreground">
              {scenario.description}
            </p>

            <dl className="datum flex flex-col gap-1 text-xs">
              {steps.map((step, index) => (
                <div
                  key={step.event.key ?? index}
                  className="flex flex-wrap items-baseline gap-x-3"
                >
                  <dt className="w-[5ch] shrink-0 text-right text-muted-foreground">
                    {Math.round(step.atMs / 1000)}s
                  </dt>
                  <dd className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span>{step.event.device.id}</span>
                    <span className="text-muted-foreground">{step.event.operation}</span>
                  </dd>
                </div>
              ))}
            </dl>

            {run ? (
              <div className="flex flex-col gap-1 border-t pt-2.5">
                <Eyebrow>operations started</Eyebrow>
                {run.scheduled.map((entry) => (
                  <Link
                    key={entry.operationId}
                    to={`/operations/${entry.operationId}`}
                    className="datum inline-flex items-baseline gap-2 text-xs hover:text-primary"
                  >
                    <Glyph kind="filled" />
                    {entry.operationId}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

