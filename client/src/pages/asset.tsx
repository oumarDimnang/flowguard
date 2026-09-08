import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Skeleton, Slot, Status } from '@/components/primitives';
import { useOperationsHistory } from '@/hooks/use-operations-history';
import { clock, duration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CongestionLevel, Criticality, NetworkAction, type Operation } from '@/types';

const ASSET_GRID =
  'grid grid-cols-[5rem_minmax(0,1.4fr)_6rem_5rem_minmax(0,1fr)_5rem] gap-x-4';

/**
 * One device, everything it has ever done.
 *
 * The question this answers is "does this thing behave consistently", and the
 * interesting answer is *no, and correctly so* — a crane that is always
 * protected is a crane whose criticality is not being judged, and one that is
 * never protected is a crane the product is doing nothing for. A mixed column
 * is the system working.
 */
export function Asset() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const history = useOperationsHistory('all');

  const operations = useMemo(
    () => history.operations.filter((operation) => operation.deviceId === deviceId),
    [history.operations, deviceId],
  );

  const totals = useMemo(() => summarise(operations), [operations]);
  const latest = operations[0];

  return (
    <>
      <PageHeader
        trail={[
          { label: 'FlowGuard', to: '/' },
          { label: 'Operations', to: '/operations' },
          { label: 'Asset' },
        ]}
        title={deviceId ?? 'Asset'}
        description={
          latest
            ? `${latest.assetType}${latest.site ? ` · ${latest.site}` : ''}`
            : 'No operations recorded for this device.'
        }
        meta={
          <>
            <Slot ch={2}>{operations.length}</Slot> operations ·{' '}
            <Slot ch={2}>{totals.protectedCount}</Slot> protected ·{' '}
            {latest?.congestion ?? '—'} congestion
          </>
        }
      />

      {/* The behaviour strip. One mark per operation, oldest left, so a run of
          identical decisions is visible as a run rather than read as a list. */}
      <section className="flex flex-col gap-2 border-t pt-3 pb-5">
        <Eyebrow>behaviour · oldest first</Eyebrow>

        {operations.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing to plot yet.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-1">
            {[...operations].reverse().map((operation) => (
              <Link
                key={operation.operationId}
                to={`/operations/${operation.operationId}`}
                title={`${operation.operationId} · ${operation.criticality ?? '—'} · ${operation.action ?? '—'}`}
                className={cn(
                  'block w-2.5 border',
                  operation.action === NetworkAction.QOD_AND_SLICE && 'h-9 border-primary bg-primary',
                  operation.action === NetworkAction.QOD && 'h-6 border-primary bg-primary/60',
                  (operation.action === NetworkAction.NONE || !operation.action) &&
                    'h-3 border-border bg-transparent',
                )}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Tall marks took a slice, short ones a session, and flat ones were left on standard
          connectivity. A column that is all one height means criticality is not doing any work.
        </p>
      </section>

      <section className="border-t">
        <div className={cn(ASSET_GRID, 'eyebrow pt-3 pb-2')}>
          <span>time</span>
          <span>operation</span>
          <span>criticality</span>
          <span>congestion</span>
          <span>action</span>
          <span className="text-right">held</span>
        </div>

        {history.loading && operations.length === 0
          ? Array.from({ length: 5 }, (_, row) => (
              <div key={row} className={cn(ASSET_GRID, 'items-center border-t py-2.5')}>
                <Skeleton width="7ch" />
                <Skeleton width="80%" />
                <Skeleton width="7ch" />
                <Skeleton width="5ch" />
                <Skeleton width="70%" />
                <Skeleton width="5ch" className="justify-self-end" />
              </div>
            ))
          : null}

        {!history.loading && operations.length === 0 ? (
          <p className="border-t py-3 text-muted-foreground">
            No operations for <span className="datum">{deviceId}</span>. Either it has not been
            dispatched, or it belongs to another organization.
          </p>
        ) : null}

        {operations.map((operation) => (
          <Link
            key={operation.operationId}
            to={`/operations/${operation.operationId}`}
            className={cn(
              ASSET_GRID,
              'datum items-baseline border-t py-2.5 text-[13px] hover:text-primary',
            )}
          >
            <span className="text-xs text-muted-foreground">{clock(operation.startedAt)}</span>
            <span className="truncate font-medium">{operation.operationId}</span>

            <span className="status-line">
              <Glyph kind={operation.criticality === Criticality.HIGH ? 'filled' : 'hollow'} />
              {operation.criticality ?? '—'}
            </span>

            <span
              className={cn(
                operation.congestion === CongestionLevel.LOW && 'text-muted-foreground',
              )}
            >
              {operation.congestion ?? '—'}
            </span>

            <Status kind={operation.action === NetworkAction.NONE ? 'hollow' : 'filled'}>
              {operation.action ?? '—'}
            </Status>

            <span className="text-right">
              {operation.action === NetworkAction.NONE
                ? '—'
                : duration(operation.startedAt, operation.completedAt)}
            </span>
          </Link>
        ))}

        <div className="border-t" />
      </section>

      <section className="log-row pt-4">
        <Eyebrow className="pt-0.5">totals</Eyebrow>
        <dl className="datum grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">sessions requested</dt>
          <dd className="m-0">{totals.sessions}</dd>

          <dt className="text-muted-foreground">slice attachments</dt>
          <dd className="m-0">{totals.slices}</dd>

          <dt className="text-muted-foreground">left on standard</dt>
          <dd className="m-0">
            {totals.untouched} of {operations.length}
          </dd>
        </dl>
      </section>

      <p className="log-row pt-3">
        <Eyebrow className="pt-0.5">why</Eyebrow>
        <span className="max-w-[70ch] text-xs text-muted-foreground">
          The last figure is the product working, not a coverage gap. Every operation left on
          standard connectivity is one the network did not have to be programmed for, and the
          business case is the sum of them.
        </span>
      </p>
    </>
  );
}

function summarise(operations: readonly Operation[]) {
  return {
    sessions: operations.filter((operation) => operation.qodSessionId).length,
    slices: operations.filter((operation) => operation.sliceId).length,
    untouched: operations.filter((operation) => operation.action === NetworkAction.NONE).length,
    protectedCount: operations.filter(
      (operation) => operation.action && operation.action !== NetworkAction.NONE,
    ).length,
  };
}
