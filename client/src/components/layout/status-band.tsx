import { useEffect, useRef, useState } from 'react';

import { Page, Status } from '@/components/primitives';
import { useHealth } from '@/hooks/use-health';
import { useSocketStatus } from '@/hooks/use-live-event';
import { logTime } from '@/lib/format';

/**
 * Persistent degraded-state banners.
 *
 * Deliberately not toasts. A toast fades, and both of these conditions persist
 * until something is fixed — a page that has silently stopped being live looks
 * exactly like a page where nothing is happening, which during a demo is the
 * worst possible ambiguity.
 *
 * Two severities, and they are genuinely different:
 *   disconnected — the API answers, the push channel does not. Data is stale.
 *   unreachable  — the API itself is gone. Nothing on screen can be trusted.
 */
export function StatusBands() {
  const connected = useSocketStatus();
  const { reachable } = useHealth();
  const staleSince = useStaleSince(connected);

  if (!reachable) return <UnreachableBand />;
  if (!connected) return <DisconnectedBand since={staleSince} />;
  return null;
}

function DisconnectedBand({ since }: { since: string | undefined }) {
  return (
    <div className="border-b border-b-foreground">
      <Page className="log-row log-row-actionable py-3">
        <span className="datum text-xs text-muted-foreground">{logTime(since)}</span>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Status kind="slash" className="font-semibold">
            LIVE UPDATES HAVE STOPPED
          </Status>
          <span>
            Socket disconnected. This page shows the last data received and will not change
            until the connection returns. Values below are stale.
          </span>
        </div>
        <span className="datum text-xs text-muted-foreground">reconnecting…</span>
      </Page>
    </div>
  );
}

function UnreachableBand() {
  return (
    <div className="border-b border-b-destructive">
      <Page className="log-row log-row-actionable py-3">
        <span className="datum text-xs text-muted-foreground">{logTime(new Date().toISOString())}</span>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Status kind="filled" className="font-semibold text-destructive">
            SERVER UNREACHABLE
          </Status>
          <span>
            The FlowGuard API is not answering. Nothing on this page can be trusted as current.
            The cranes are unaffected — FlowGuard never blocks a lift, so operations continue
            unprotected until the API returns.
          </span>
        </div>
        <span className="datum text-xs text-muted-foreground">retrying every 10 s</span>
      </Page>
    </div>
  );
}

/**
 * When the push channel was last known good.
 *
 * Recorded at the moment of disconnect rather than counted down from, because
 * an invented reconnect countdown is worse than no number at all.
 */
function useStaleSince(connected: boolean): string | undefined {
  const [since, setSince] = useState<string | undefined>(undefined);
  const wasConnected = useRef(connected);

  useEffect(() => {
    if (wasConnected.current && !connected) setSince(new Date().toISOString());
    if (connected) setSince(undefined);
    wasConnected.current = connected;
  }, [connected]);

  return since;
}
