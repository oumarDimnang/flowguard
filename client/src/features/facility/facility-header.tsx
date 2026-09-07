import { useAuth } from '@/auth/auth-context';
import { Eyebrow } from '@/components/primitives';
import type { FacilityDescriptor } from '@/types';

export interface FacilityHeaderProps {
  descriptor: FacilityDescriptor | undefined;
  onReset: () => void;
  resetting?: boolean;
}

/**
 * Where you are and what you are working on.
 *
 * Industry-neutral because the descriptor already carries its own vocabulary:
 * a berth says "vessel MV GULF TRADER · target 32 moves/hour", a fleet says
 * "area Ras Laffan corridor · target 18 sorties/day". The adapter names its own
 * units rather than the client guessing them.
 */
export function FacilityHeader({ descriptor, onReset, resetting }: FacilityHeaderProps) {
  const { can } = useAuth();

  return (
    <header className="grid grid-cols-1 items-end gap-8 pb-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Control Room</Eyebrow>
        <h1>{descriptor?.name ?? 'Facility'}</h1>
        <div className="flex flex-wrap gap-x-3 text-[15px]">
          <span className="datum">{descriptor?.context ?? '—'}</span>
          <span className="text-muted-foreground">·</span>
          <span>
            target <span className="datum">{descriptor?.throughputTarget ?? '—'}</span>{' '}
            {descriptor?.throughputLabel ?? ''}
          </span>
        </div>
      </div>

      {/* Reset releases anything still in flight, so it spends and un-spends
          network capacity — same gate as dispatch. */}
      {can('OPERATOR') ? (
        <button type="button" className="btn-line px-3.5 py-1.5" onClick={onReset} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset plan'}
        </button>
      ) : null}
    </header>
  );
}
