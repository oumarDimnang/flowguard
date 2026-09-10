import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { api } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Loadable, SkeletonRows, SkeletonText, Status } from '@/components/primitives';
import { useContrastPair } from '@/features/thesis/use-contrast-pair';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import { CONTRAST_SCENARIO_ID, DecisionStep, NetworkAction, Role, type Operation } from '@/types';

/** Compare recorded operation inputs without treating missing data as evidence. */
export function Thesis() {
  const [params] = useSearchParams();
  const { pair, loading, congestionDiffers } = useContrastPair({
    a: params.get('a') ?? undefined,
    b: params.get('b') ?? undefined,
  });

  const congestionKnown = pair !== undefined
    && pair.restrained.congestion != null
    && pair.protectedOp.congestion != null;

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Thesis' }]}
        title="Criticality, not congestion"
        description="Compare recorded operation inputs and decisions to explore how business criticality affects connectivity allocation."
        meta={<RunContrast />}
      />

      <Loadable
        loading={loading}
        empty={pair === undefined}
        skeleton={<ContrastSkeleton />}
        whenEmpty={<NoPairYet />}
      >
      {pair ? (
        <>
          <ContrastTable
            restrained={pair.restrained}
            protectedOp={pair.protectedOp}
            congestionDiffers={congestionDiffers}
            congestionKnown={congestionKnown}
          />

          <div className="mt-10 grid grid-cols-1 gap-10 border-t pt-6 lg:grid-cols-2">
            <Reasoning operation={pair.restrained} />
            <Reasoning operation={pair.protectedOp} />
          </div>

          <p className="mt-10 max-w-[68ch] border-t pt-6 text-[17px] leading-snug">
            {!congestionKnown
              ? 'Congestion was not recorded for both operations, so matching network conditions cannot be confirmed.'
              : congestionDiffers
                ? 'These operations recorded different congestion levels, so this pair does not isolate the effect of business criticality.'
                : 'Both operations recorded the same congestion level. Compare their criticality and decisions above.'}
            {' '}The policy principle: criticality triggers action, and congestion never does on its own.
          </p>
        </>
      ) : null}
      </Loadable>
    </>
  );
}

const CONTRAST_GRID = 'grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-6 [&>*]:min-w-0 [&>*]:[overflow-wrap:anywhere]';

/** The comparison table's footprint, one placeholder row per input. */
function ContrastSkeleton() {
  return (
    <>
      <section className="border-t">
        <div className={cn(CONTRAST_GRID, 'items-baseline pt-3 pb-2')}>
          <Eyebrow className="col-span-2 sm:col-span-1">input</Eyebrow>
          <Eyebrow>left alone</Eyebrow>
          <Eyebrow>protected</Eyebrow>
        </div>
        <SkeletonRows rows={ROWS.length} layoutClassName={cn(CONTRAST_GRID, '[&>:first-child]:col-span-2 sm:[&>:first-child]:col-span-1')} columns={['8ch', '55%', '55%']} />
      </section>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <SkeletonText lines={['30%', '90%', '75%']} />
        <SkeletonText lines={['30%', '85%', '80%']} />
      </div>
    </>
  );
}

interface RowSpec {
  label: string;
  of: (operation: Operation) => string | undefined;
  /** Forced divergent even if the rendered values happen to match. */
  diverges?: boolean;
}

const ROWS: RowSpec[] = [
  { label: 'device', of: (o) => o.deviceId },
  { label: 'operation', of: (o) => o.operationName },
  { label: 'site', of: (o) => o.site },
  { label: 'device reachable', of: (o) => (o.deviceReachable == null ? undefined : o.deviceReachable ? 'yes' : 'no') },
  { label: 'congestion', of: (o) => o.congestion },
  { label: 'criticality', of: (o) => o.criticality, diverges: true },
  { label: 'action', of: (o) => o.action, diverges: true },
];

function ContrastTable({
  restrained,
  protectedOp,
  congestionDiffers,
  congestionKnown,
}: {
  restrained: Operation;
  protectedOp: Operation;
  congestionDiffers: boolean;
  congestionKnown: boolean;
}) {
  return (
    <section className="border-t">
      <div className={cn(CONTRAST_GRID, 'items-baseline pt-3 pb-2')}>
        <Eyebrow className="col-span-2 sm:col-span-1">input</Eyebrow>
        <Eyebrow>left alone</Eyebrow>
        <Eyebrow>protected</Eyebrow>
      </div>

      {ROWS.map((row) => {
        const left = row.of(restrained);
        const right = row.of(protectedOp);
        const same = !row.diverges && left != null && right != null && left === right;

        return (
          <div
            key={row.label}
            className={cn(
              CONTRAST_GRID,
              'items-baseline border-t py-2.5 text-[13px]',
              same && 'text-muted-foreground',
            )}
          >
            <span className="datum col-span-2 text-xs sm:col-span-1">
              {row.label}
              {same ? <span className="ml-2 text-[10px] tracking-[0.08em]">MATCHES</span> : null}
            </span>
            <span className={cn('datum', !same && 'font-medium text-primary')}>{left ?? 'unknown'}</span>
            <span className={cn('datum', !same && 'font-medium text-primary')}>{right ?? 'unknown'}</span>
          </div>
        );
      })}

      <div className={cn(CONTRAST_GRID, 'items-baseline border-t border-b py-2.5 text-xs')}>
        <span className="datum col-span-2 text-muted-foreground sm:col-span-1">trail</span>
        <Link to={`/operations/${restrained.operationId}`} className="datum">
          {restrained.operationId} ↗
        </Link>
        <Link to={`/operations/${protectedOp.operationId}`} className="datum">
          {protectedOp.operationId} ↗
        </Link>
      </div>

      {!congestionKnown || congestionDiffers ? (
        <p className="log-row pt-3">
          <Eyebrow>caveat</Eyebrow>
          <span className="max-w-[68ch] text-xs text-muted-foreground">
            {!congestionKnown
              ? 'A congestion reading is missing. Unknown values are not evidence of matching conditions.'
              : 'Congestion differs between these operations. Run the contrast scenario and compare its recorded readings.'}
          </span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * The model's justification, read from the trail rather than the projection.
 *
 * `Operation.reasoning` is last-write-wins across decision steps, so by the
 * time an operation completes it holds the release message rather than the
 * assessment. The trail keeps each step's own text, and the assessment is the
 * one worth quoting here.
 */
function Reasoning({ operation }: { operation: Operation }) {
  const restrained = operation.action === NetworkAction.NONE;

  const trail = useResource(
    (signal) => api.decisionLog.byOperation(operation.operationId, signal),
    [operation.operationId],
  );

  const assessed = trail.data?.find((r) => r.step === DecisionStep.CRITICALITY_ASSESSED);
  const reasoning = assessed?.reasoning ?? operation.reasoning;

  return (
    <div className="flex flex-col gap-3">
      <Status kind={restrained ? 'hollow' : 'filled'} className="datum text-[13px] font-medium">
        <span className={restrained ? undefined : 'text-primary'}>
          {operation.action} · {clock(operation.startedAt)}
        </span>
      </Status>

      {reasoning ? (
        <blockquote className="m-0 max-w-[60ch] border-l pl-4 text-[15px] leading-relaxed">
          {reasoning}
        </blockquote>
      ) : (
        <p className="text-muted-foreground">No reasoning recorded.</p>
      )}
    </div>
  );
}

/**
 * Nothing to compare yet.
 *
 * Deliberately not a worked example. A page that shows a fabricated pair when
 * none has run is the exact failure this product argues against.
 */
function NoPairYet() {
  return (
    <div className="log-row border-t border-b py-6">
      <Eyebrow className="pt-1">no pair yet</Eyebrow>
      <div className="flex max-w-[68ch] flex-col gap-2">
        <p className="text-[15px]">
          No two operations on the same device have reached opposite decisions yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Run the contrast scenario, or dispatch <span className="datum">move-1</span> and then{' '}
          <span className="datum">move-2</span> from the Control Room — both are{' '}
          <span className="datum">crane-a</span> on the same SIM, and they are built to diverge.
        </p>
      </div>
    </div>
  );
}

function RunContrast() {
  const { can } = useAuth();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    setScheduled(false);
    try {
      await api.simulator.run(CONTRAST_SCENARIO_ID);
      setScheduled(true);
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.isUnauthenticated)) {
        setError(
          failure instanceof ApiError && failure.isForbidden
            ? 'Running a scenario requires operator access.'
            : 'Scheduling could not be confirmed. Check Operations before trying again.',
        );
      }
    } finally {
      setRunning(false);
    }
  };

  if (!can(Role.OPERATOR)) {
    return <span className="text-xs text-muted-foreground">Read only: operator access is required to run a contrast.</span>;
  }

  return (
    <div className="flex max-w-[42ch] flex-col items-start gap-2">
      <button type="button" className="btn-line px-3.5 py-1.5" onClick={() => void run()} disabled={running}>
        {running ? 'Scheduling...' : 'Run contrast scenario'}
      </button>
      {error ? <p role="alert" className="text-xs">{error}</p> : null}
      <p role="status" className="text-xs text-muted-foreground">
        {scheduled ? 'Contrast scheduled. Follow its progress in Operations.' : ''}
      </p>
    </div>
  );
}
