import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { api } from '@/api/endpoints';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Status } from '@/components/primitives';
import { useContrastPair } from '@/features/thesis/use-contrast-pair';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import { CONTRAST_SCENARIO_ID, DecisionStep, NetworkAction, type Operation } from '@/types';

/**
 * The argument, in two columns.
 *
 * Same device, same SIM, same cell, same congestion, minutes apart — opposite
 * outcomes. Everything that matches is set quietly and marked as matching,
 * because the matching rows are what make the diverging ones mean something. If
 * six of eight inputs are identical, the difference cannot be explained by the
 * network.
 */
export function Thesis() {
  const [params] = useSearchParams();
  const { pair, loading, congestionDiffers } = useContrastPair({
    a: params.get('a') ?? undefined,
    b: params.get('b') ?? undefined,
  });

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Thesis' }]}
        title="Criticality, not congestion"
        description="The same device under the same network conditions, minutes apart. One operation is left on standard connectivity; the other is protected. Nothing about the network explains the difference — only what the job was."
        meta={<RunContrast />}
      />

      {loading && !pair ? (
        <p className="border-t py-6 text-muted-foreground">Looking for a contrast pair…</p>
      ) : null}

      {!loading && !pair ? <NoPairYet /> : null}

      {pair ? (
        <>
          <ContrastTable
            restrained={pair.restrained}
            protectedOp={pair.protectedOp}
            congestionDiffers={congestionDiffers}
          />

          <div className="mt-10 grid grid-cols-1 gap-10 border-t pt-6 lg:grid-cols-2">
            <Reasoning operation={pair.restrained} />
            <Reasoning operation={pair.protectedOp} />
          </div>

          <p className="mt-10 max-w-[68ch] border-t pt-6 text-[17px] leading-snug">
            The network was the same for both. The decision was not. That is the entire product:
            criticality triggers action, and congestion never does on its own.
          </p>
        </>
      ) : null}
    </>
  );
}

interface RowSpec {
  label: string;
  of: (operation: Operation) => React.ReactNode;
  /** Forced divergent even if the rendered values happen to match. */
  diverges?: boolean;
}

const ROWS: RowSpec[] = [
  { label: 'device', of: (o) => o.deviceId },
  { label: 'operation', of: (o) => o.operationName },
  { label: 'site', of: (o) => o.site ?? '—' },
  { label: 'device reachable', of: (o) => (o.deviceReachable === false ? 'no' : 'yes') },
  { label: 'congestion', of: (o) => o.congestion ?? '—' },
  { label: 'criticality', of: (o) => o.criticality ?? '—', diverges: true },
  { label: 'action', of: (o) => o.action ?? '—', diverges: true },
];

function ContrastTable({
  restrained,
  protectedOp,
  congestionDiffers,
}: {
  restrained: Operation;
  protectedOp: Operation;
  congestionDiffers: boolean;
}) {
  return (
    <section className="border-t">
      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-6 pt-3 pb-2">
        <Eyebrow>input</Eyebrow>
        <Eyebrow>left alone</Eyebrow>
        <Eyebrow>protected</Eyebrow>
      </div>

      {ROWS.map((row) => {
        const left = row.of(restrained);
        const right = row.of(protectedOp);
        const same = !row.diverges && String(left) === String(right);

        return (
          <div
            key={row.label}
            className={cn(
              'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-6 border-t py-2.5 text-[13px]',
              same && 'text-muted-foreground',
            )}
          >
            <span className="datum text-xs">
              {row.label}
              {same ? <span className="ml-2 text-[10px] tracking-[0.08em]">MATCHES</span> : null}
            </span>
            <span className={cn('datum', !same && 'font-medium text-primary')}>{left}</span>
            <span className={cn('datum', !same && 'font-medium text-primary')}>{right}</span>
          </div>
        );
      })}

      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-6 border-t border-b py-2.5 text-xs">
        <span className="datum text-muted-foreground">trail</span>
        <Link to={`/operations/${restrained.operationId}`} className="datum">
          {restrained.operationId} ↗
        </Link>
        <Link to={`/operations/${protectedOp.operationId}`} className="datum">
          {protectedOp.operationId} ↗
        </Link>
      </div>

      {congestionDiffers ? (
        <p className="log-row pt-3">
          <Eyebrow>caveat</Eyebrow>
          <span className="max-w-[68ch] text-xs text-muted-foreground">
            These two ran under different congestion, so the comparison is weaker than it looks.
            Run the contrast scenario for a pair observed under identical conditions.
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
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      await api.simulator.run(CONTRAST_SCENARIO_ID);
    } finally {
      setRunning(false);
    }
  };

  return (
    <button type="button" className="btn-line px-3.5 py-1.5" onClick={() => void run()} disabled={running}>
      {running ? 'Running…' : 'Run contrast scenario'}
    </button>
  );
}
