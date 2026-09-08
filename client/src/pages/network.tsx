import { useMemo } from 'react';
import { Link } from 'react-router';

import { api } from '@/api/endpoints';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Skeleton, Slot, Status } from '@/components/primitives';
import { useActiveOperations } from '@/hooks/use-operations';
import { useOperationsHistory } from '@/hooks/use-operations-history';
import { useResource } from '@/hooks/use-resource';

import { cn } from '@/lib/utils';
import {
  CongestionLevel,
  QosStatus,
  holdsPremiumConnectivity,
  type Operation,
} from '@/types';

/**
 * The QoS profile every session is requested against.
 *
 * Verified against this account's playground, and note the asymmetry: medium
 * down, large up. That is the shape a camera-heavy industrial asset needs and
 * the opposite of a consumer plan, which is the single most convincing detail
 * in this whole page.
 */
const QOS_PROFILE = 'DOWNLINK_M_UPLINK_L';

/**
 * The five CAMARA APIs, with the path each display name actually resolves to.
 *
 * Listed rather than fetched. None of the catalogue's names map mechanically
 * onto their REST paths — "Slice Device Attach" is `/device-attach/`, not
 * `/slice-device-attach/` — and every one of these cost a probe to establish,
 * so the mapping is itself worth showing.
 */
const ENDPOINTS: readonly { name: string; method: string; path: string }[] = [
  {
    name: 'Device Reachability',
    method: 'POST',
    path: '/device-status/device-reachability-status/v1/retrieve',
  },
  { name: 'Congestion Insights', method: 'POST', path: '/congestion-insights/v0/query' },
  { name: 'Quality on Demand', method: 'POST', path: '/qod/v0/sessions' },
  { name: 'Slice Device Attach', method: 'GET', path: '/device-attach/v0/attachments' },
  { name: 'Location Verification', method: 'POST', path: '/location-verification/v1/verify' },
];

/**
 * What the network is doing, rather than what one operation did.
 *
 * Everything else in the product reaches the network one lift at a time. This
 * is the page for the question "so what is actually held right now", which is
 * the only question that matters when the bill arrives.
 */
export function Network() {
  // Two sources, because they answer different questions. What is held right
  // now can only come from the in-flight list; what the network looked like
  // has to come from history, since a finished operation is the only record
  // that a cell was ever congested.
  const active = useActiveOperations();
  const history = useOperationsHistory('all');
  const health = useResource((signal) => api.health.check(signal).catch(() => undefined), []);

  const held = useMemo(
    () => active.operations.filter(holdsPremiumConnectivity),
    [active.operations],
  );

  const slices = useMemo(
    () =>
      [...new Set(held.map((operation) => operation.sliceId))].filter(
        (sliceId): sliceId is string => sliceId !== undefined,
      ),
    [held],
  );

  const congestion = useMemo(() => byDevice(history.operations), [history.operations]);

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Network' }]}
        title="Network"
        description="Quality on Demand sessions, slice attachments and congestion, as the CAMARA APIs report them."
        meta={
          <>
            <Slot ch={2}>{held.length}</Slot> sessions ·{' '}
            <Slot ch={1}>{slices.length}</Slot> slice attachment
            {slices.length === 1 ? '' : 's'}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-7 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-7">
          <Held operations={held} loading={active.loading} />
          <Slice slices={slices} attached={held} />
        </div>

        <div className="flex min-w-0 flex-col gap-7">
          <Congestion rows={congestion} />
          <Endpoints reachable={health.data?.status === 'ok'} />
        </div>
      </div>
    </>
  );
}

// ── Held right now ──────────────────────────────────────────────────

const HELD_GRID = 'grid grid-cols-[minmax(0,1.3fr)_7rem_7rem_minmax(0,1fr)] gap-x-4';

function Held({
  operations,
  loading,
}: {
  operations: readonly Operation[];
  loading: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <Head title="Held right now" meta={`profile ${QOS_PROFILE}`} />

      <div>
        <div className={cn(HELD_GRID, 'eyebrow pb-2')}>
          <span>session</span>
          <span>device</span>
          <span>status</span>
          <span>slice</span>
        </div>

        {loading && operations.length === 0 ? <Skeleton width="70%" /> : null}

        {!loading && operations.length === 0 ? (
          <p className="border-t py-3 text-xs text-muted-foreground">
            Nothing held. That is the resting state, not an empty one — the count rises when a
            lift is protected and returns here the moment it lands.
          </p>
        ) : null}

        {operations.map((operation) => (
          <Link
            key={operation.operationId}
            to={`/operations/${operation.operationId}`}
            className={cn(HELD_GRID, 'datum items-baseline border-t py-2 text-xs hover:text-primary')}
          >
            <span className="truncate" title={operation.qodSessionId}>
              {operation.qodSessionId ?? '—'}
            </span>
            <span>{operation.deviceId}</span>
            <Status kind={operation.qosStatus === QosStatus.AVAILABLE ? 'filled' : 'hollow'}>
              {operation.qosStatus ?? 'REQUESTED'}
            </Status>
            <span className="truncate text-muted-foreground">{operation.sliceId ?? '—'}</span>
          </Link>
        ))}

        <div className="border-t" />
      </div>

      <p className="text-xs text-muted-foreground">
        Quality on Demand is asynchronous: a session is <span className="datum">REQUESTED</span>{' '}
        before the network confirms it as <span className="datum">AVAILABLE</span>. Every one
        carries a mandatory duration that expires it even if nothing releases it.
      </p>
    </section>
  );
}

// ── The slice ───────────────────────────────────────────────────────

function Slice({
  slices,
  attached,
}: {
  slices: readonly string[];
  attached: readonly Operation[];
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <Head title="Network slice" meta={slices.length > 0 ? 'attached' : 'none attached'} />

      {slices.length === 0 ? (
        <p className="border-t py-3 text-xs text-muted-foreground">
          No device is attached to a slice. The slice itself stays provisioned regardless — see
          below.
        </p>
      ) : (
        slices.map((sliceId) => (
          <div key={sliceId} className="flex flex-col gap-1 border-t py-2.5">
            <span className="datum status-line text-[13px] text-primary">
              <Glyph kind="filled" />
              {sliceId}
            </span>
            <span className="datum pl-4 text-xs text-muted-foreground">
              {attached
                .filter((operation) => operation.sliceId === sliceId)
                .map((operation) => operation.deviceId)
                .join(' · ')}
            </span>
          </div>
        ))
      )}

      <p className="border-t pt-2.5 text-xs text-muted-foreground">
        A slice is created and activated once at bootstrap, because provisioning runs to minutes
        and cannot happen inside a decision window. Only the attach and the detach are
        per-operation — and unlike a QoD session,{' '}
        <span className="text-foreground">an attachment has no expiry at all</span>. Nothing in
        the network reclaims it, which is why release runs on every exit path.
      </p>
    </section>
  );
}

// ── Congestion ──────────────────────────────────────────────────────

function Congestion({ rows }: { rows: { deviceId: string; level: CongestionLevel }[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <Head title="Congestion" meta="as the decisions observed it" />

      {rows.length === 0 ? (
        <p className="border-t py-3 text-xs text-muted-foreground">Nothing observed yet.</p>
      ) : (
        rows.map((row) => (
          <div
            key={row.deviceId}
            className="datum flex items-baseline justify-between gap-4 border-t py-1.5 text-xs"
          >
            <span>{row.deviceId}</span>
            <Status kind={row.level === CongestionLevel.HIGH ? 'filled' : 'hollow'}>
              {row.level}
            </Status>
          </div>
        ))
      )}

      <p className="border-t pt-2.5 text-xs text-muted-foreground">
        Levels are <span className="datum">Low</span> / <span className="datum">Medium</span> /{' '}
        <span className="datum">High</span> exactly — that casing is the CAMARA contract.
        Congestion is an input to the decision and never a trigger on its own.
      </p>
    </section>
  );
}

// ── Endpoints ───────────────────────────────────────────────────────

function Endpoints({ reachable }: { reachable: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <Head title="CAMARA endpoints" meta={reachable ? 'server ok' : 'server unreachable'} />

      {ENDPOINTS.map((endpoint) => (
        <div key={endpoint.path} className="flex flex-col gap-0.5 border-t py-2">
          <span className="text-[13px]">{endpoint.name}</span>
          <span className="datum text-[11px] break-all text-muted-foreground">
            {endpoint.method} {endpoint.path}
          </span>
        </div>
      ))}

      <p className="border-t pt-2.5 text-xs text-muted-foreground">
        All five verified against Nokia's sandbox with a live key, including creating and
        deleting a real QoD session. Slice attach was listed rather than created — a successful
        POST attaches a real device.
      </p>
    </section>
  );
}

// ── Shared ──────────────────────────────────────────────────────────

function Head({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t pt-3">
      <h2 className="text-[15px] font-medium">{title}</h2>
      {meta ? <Eyebrow>{meta}</Eyebrow> : null}
    </div>
  );
}

/**
 * The most recent congestion reading per device.
 *
 * Operations arrive newest first, so the first sighting of a device is its
 * latest. Devices that have never been decided on simply do not appear — there
 * is no congestion table to read them from, and inventing a row would be
 * inventing a measurement.
 */
function byDevice(operations: readonly Operation[]): { deviceId: string; level: CongestionLevel }[] {
  const seen = new Map<string, CongestionLevel>();

  for (const operation of operations) {
    if (operation.congestion && !seen.has(operation.deviceId)) {
      seen.set(operation.deviceId, operation.congestion);
    }
  }

  return [...seen.entries()]
    .map(([deviceId, level]) => ({ deviceId, level }))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

