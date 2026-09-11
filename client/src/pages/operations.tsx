import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Slot } from '@/components/primitives';
import { OperationsTable } from '@/features/operations/operations-table';
import {
  HISTORY_FILTERS,
  useHistoryFilter,
  useOperationsHistory,
  type HistoryFilter,
} from '@/hooks/use-operations-history';
import { cn } from '@/lib/utils';

/**
 * Everything the system has ever decided on.
 *
 * Exists for a specific reason: `GET /operations/active` excludes terminal
 * statuses, so the moment a lift finishes it vanishes from the Control Room —
 * and with it, the only link to its decision trail. This page is what makes
 * "go back to the 40-tonne one and show me the reasoning again" possible.
 */
export function Operations() {
  const [filter, setFilter] = useHistoryFilter();
  const history = useOperationsHistory(filter);

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard · Control Room', to: '/' }, { label: 'Operations History' }]}
        title="Operations History"
        description="Every operation the system has decided on, newest first. Each row opens its decision trail."
        meta={
          history.hasData ? <>
            Khalifa Bin Salman Port — Berth 3 · <Slot ch={3}>{history.total}</Slot> operations
          </> : history.loading ? 'Loading history...' : 'History unavailable'
        }
      />

      {history.error ? (
        <div className="flex flex-wrap items-baseline gap-3 border-t py-3 text-sm">
          <p role="alert">
            {history.hasData
              ? 'Could not refresh operations history. Previously loaded results may be stale.'
              : 'Could not load operations history. Results are unavailable.'}
          </p>
          <button
            type="button"
            className="btn-line"
            onClick={history.reload}
            disabled={history.loading}
          >
            {history.loading ? 'Retrying...' : 'Retry history'}
          </button>
        </div>
      ) : null}

      {history.hasData ? <nav className="log-row border-t py-3">
        <Eyebrow className="pt-0.5">filter</Eyebrow>
        <div className="flex flex-wrap gap-x-7 text-[15px]">
          {(Object.keys(HISTORY_FILTERS) as HistoryFilter[]).map((key) => (
            <FilterButton
              key={key}
              label={HISTORY_FILTERS[key]}
              count={history.counts[key]}
              active={filter === key}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>
      </nav> : null}

      {!history.error || history.operations.length > 0 ? (
        <OperationsTable operations={history.operations} loading={history.loading} />
      ) : null}

      {history.hasData ? <p className="log-row pt-3">
        <span className="datum text-xs text-muted-foreground">
          <Slot ch={3}>{history.operations.length}</Slot> of <Slot ch={3}>{history.total}</Slot>
        </span>
        <span className="text-xs text-muted-foreground">
          Rows are appended live as decisions land.
        </span>
      </p> : null}
    </>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'btn-bare inline-flex items-baseline gap-2 border-b border-b-transparent pb-0.5',
        active && 'border-b-primary font-medium text-primary',
      )}
    >
      <Glyph kind={active ? 'filled' : 'hollow'} />
      <span>{label}</span>
      <span className="datum w-[2ch] text-right text-xs text-muted-foreground">{count}</span>
    </button>
  );
}
