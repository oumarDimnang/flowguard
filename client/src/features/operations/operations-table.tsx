import { Link, useNavigate } from 'react-router';

import { Glyph, Skeleton, Status } from '@/components/primitives';
import { clock, duration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CongestionLevel, Criticality, NetworkAction, type Operation } from '@/types';
import { outcomePhrase, summaryHeadline } from './operation-summary';

const HISTORY_GRID =
  'grid grid-cols-[80px_minmax(150px,1fr)_88px_100px_68px_minmax(0,1.45fr)_64px_56px] gap-x-3';

const COLUMNS = [
  'time',
  'operation',
  'device',
  'criticality',
  'congestion',
  'outcome',
  'duration',
  'graph',
];

export interface OperationsTableProps {
  operations: readonly Operation[];
  loading?: boolean;
}

/**
 * Every operation decided on, newest first.
 *
 * This table is what keeps a finished operation reachable — the Control Room
 * shows only what is running, so without a row here a completed lift and its
 * decision trail become unreachable except by typing a URL.
 */
export function OperationsTable({ operations, loading }: OperationsTableProps) {
  return (
    <section className="border-t">
      <div className={cn(HISTORY_GRID, 'eyebrow pt-3 pb-2')}>
        {COLUMNS.map((column, index) => (
          <span key={column} className={index >= 6 ? 'text-right' : undefined}>
            {column}
          </span>
        ))}
      </div>

      {loading && operations.length === 0 ? <TableSkeleton /> : null}

      {!loading && operations.length === 0 ? (
        <div className="border-t py-3 text-muted-foreground">
          No operations match this filter.
        </div>
      ) : null}

      {operations.map((operation) => (
        <OperationRow key={operation.operationId} operation={operation} />
      ))}

      <div className="border-t" />
    </section>
  );
}

function OperationRow({ operation }: { operation: Operation }) {
  const navigate = useNavigate();
  // The phrase is the cell; the sentence is the tooltip and the detail page.
  const phrase = outcomePhrase(operation);
  const headline = summaryHeadline(operation);

  return (
    <Link
      to={`/operations/${operation.operationId}`}
      className={cn(HISTORY_GRID, 'datum items-baseline border-t py-3 text-[13px] hover:text-primary')}
    >
      <span className="text-xs text-muted-foreground">{clock(operation.startedAt)}</span>
      <span className="font-medium [overflow-wrap:anywhere]">{operation.operationId}</span>
      <span>{operation.deviceId}</span>

      <span className="status-line">
        <Glyph kind={operation.criticality === Criticality.HIGH ? 'filled' : 'hollow'} />
        {operation.criticality ?? '—'}
      </span>

      <span className={cn(operation.congestion === CongestionLevel.LOW && 'text-muted-foreground')}>
        {operation.congestion ?? '—'}
      </span>

      {/*
       * The action, and underneath it the same outcome in words.
       *
       * The bare enum is the row people misread: HIGH criticality with NONE
       * looks like a miss until you notice congestion was Low. Rather than
       * labelling only that one case, every row now says what it means — and
       * the second line is unconditional, so rows stay a uniform height
       * instead of jumping wherever a caveat applied.
       */}
      <span className="flex min-w-0 flex-col gap-0.5">
        <Status kind={operation.action === NetworkAction.NONE ? 'hollow' : 'filled'}>
          {operation.action ?? '—'}
        </Status>

        <span className="eyebrow truncate tracking-[0.06em] normal-case" title={headline}>
          {phrase}
        </span>
      </span>

      <span className="text-right">{duration(operation.startedAt, operation.completedAt)}</span>

      {/* Straight to the volume, skipping the trail. Rendered as a span rather
          than a nested anchor — a link inside a link is invalid markup and the
          inner one silently stops working. Navigation is handled on click. */}
      <span
        role="link"
        tabIndex={0}
        className="text-right hover:text-primary"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          navigate(`/operations/${operation.operationId}/graph`);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          navigate(`/operations/${operation.operationId}/graph`);
        }}
      >
        3D ↗
      </span>
    </Link>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} className={cn(HISTORY_GRID, 'items-center border-t py-3')} style={{ height: 20 }}>
          <Skeleton width="7ch" />
          <Skeleton width="80%" />
          <Skeleton width="7ch" />
          <Skeleton width="8ch" />
          <Skeleton width="5ch" />
          <Skeleton width="70%" />
          <Skeleton width="5ch" className="justify-self-end" />
          <Skeleton width="3ch" className="justify-self-end" />
        </div>
      ))}
    </>
  );
}
