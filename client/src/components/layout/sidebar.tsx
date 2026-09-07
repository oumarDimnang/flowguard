import { useState } from 'react';
import { NavLink } from 'react-router';

import { API_URL } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Eyebrow, Status } from '@/components/primitives';
import { useHealth } from '@/hooks/use-health';
import { useSocketStatus } from '@/hooks/use-live-event';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from './routes';
import { ScenarioRunner } from './scenario-runner';

/**
 * The application's left rail.
 *
 * Replaces the previous top nav, which was the right call at five flat routes
 * and stopped being it once organizations, roles and an admin area arrived.
 *
 * Still no pills and no fills: small-caps mono group labels, hairlines between
 * groups, and the active item marked by a left rule in the accent — which keeps
 * the accent doing one job everywhere in the product, marking what is live.
 */
export function Sidebar() {
  const { identity, can } = useAuth();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r">
      <header className="flex flex-col gap-1 border-b px-5 py-4">
        <span className="datum text-[13px] font-medium tracking-[var(--tracking-wordmark)]">
          FLOWGUARD
        </span>
        <span className="truncate text-xs text-muted-foreground" title={identity?.organization.name}>
          {identity?.organization.name ?? '—'}
        </span>
      </header>

      <nav className="scroll-area min-h-0 flex-1 py-2">
        {NAV_GROUPS.map((group, index) => {
          const visible = group.routes.filter(
            (route) => !route.minimumRole || can(route.minimumRole),
          );
          if (visible.length === 0) return null;

          return (
            <div key={group.label ?? index} className={cn('py-2', index > 0 && 'border-t')}>
              {group.label ? <Eyebrow className="px-5 pt-1 pb-2">{group.label}</Eyebrow> : null}

              {visible.map((route) => (
                <NavLink
                  key={route.to}
                  to={route.to}
                  end={route.end}
                  className={({ isActive }) =>
                    cn(
                      'block border-l-2 border-l-transparent py-1.5 pr-5 pl-[1.125rem] text-[13px]',
                      isActive && 'border-l-primary font-medium text-primary',
                    )
                  }
                >
                  {route.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <SidebarFooter />
    </aside>
  );
}

/**
 * Instrumentation and identity.
 *
 * The health strip moved here from the berth header: it answers "is what I am
 * looking at current?", which is a question about the whole app rather than
 * about one berth.
 */
function SidebarFooter() {
  const { identity, signOut, can } = useAuth();
  const connected = useSocketStatus();
  const { report, reachable } = useHealth();

  return (
    <footer className="flex flex-col gap-3 border-t px-5 py-4">
      {can('OPERATOR') ? <ScenarioRunner /> : null}

      <div className="datum flex flex-col gap-1.5 text-[11px] text-muted-foreground">
        <Status kind={connected ? 'filled' : 'slash'}>
          <span className={connected ? 'text-primary' : undefined}>
            {connected ? 'live' : 'not live'}
          </span>
        </Status>

        <Status kind={!reachable ? 'slash' : report?.status === 'ok' ? 'filled' : 'hollow'}>
          {!reachable ? 'server unreachable' : (report?.status ?? 'checking')}
        </Status>

        <span className="truncate" title={API_URL}>
          {safeHost(API_URL)}
        </span>
      </div>

      <div className="flex flex-col gap-1 border-t pt-3">
        <span className="truncate text-[13px]" title={identity?.user.email}>
          {identity?.user.name ?? '—'}
        </span>
        <span className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
          {identity?.user.role.toLowerCase() ?? ''}
        </span>
        <div className="flex items-baseline gap-4 pt-1">
          <SignOut onSignOut={signOut} />
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

function SignOut({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn-bare text-[11px] text-muted-foreground"
      disabled={busy}
      onClick={() => void run()}
    >
      {busy ? 'signing out…' : 'sign out'}
    </button>
  );
}

/**
 * Light / dark.
 *
 * The only mount of `useTheme` in the app, which is what keeps it honest: the
 * hook owns `useState`, so a second instance would desync from this one. The
 * class it writes is already on `<html>` by the time React runs — index.html
 * sets it before the first paint.
 *
 * It sits beside sign-out because it is a preference set once, not a control
 * anyone reaches for mid-operation. It matters most on the decision graph,
 * where the two themes are not one palette inverted: dark is lit objects in a
 * void, light is solid objects on paper.
 */
function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      className="btn-bare text-[11px] text-muted-foreground"
      onClick={toggle}
      aria-pressed={dark}
    >
      {dark ? 'light mode' : 'dark mode'}
    </button>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
