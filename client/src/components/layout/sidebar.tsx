import { useState } from 'react';
import { NavLink } from 'react-router';

import { API_URL } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Mark, Wordmark } from '@/components/brand/logo';
import { Eyebrow, Glyph, Status } from '@/components/primitives';
import { useHealth, type HealthState } from '@/hooks/use-health';
import { useSocketStatus } from '@/hooks/use-live-event';
import { useSidebarCollapsed } from '@/hooks/use-sidebar';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from './routes';
import { ScenarioRunner } from './scenario-runner';

/** Open and folded widths. The fold is wide enough for the mark and nothing else. */
const OPEN_WIDTH = '15rem';
const RAIL_WIDTH = '3.25rem';

/**
 * The application's left rail.
 *
 * Replaces the previous top nav, which was the right call at five flat routes
 * and stopped being it once organizations, roles and an admin area arrived.
 *
 * Still no pills and no fills: small-caps mono group labels, hairlines between
 * groups, and the active item marked by a left rule in the accent — which keeps
 * the accent doing one job everywhere in the product, marking what is live.
 *
 * It folds to a rail. The width animates on the <aside>, and the two states
 * are two layers inside it that cross-fade: the full column keeps its open
 * width throughout so nothing reflows mid-motion, and the rail is absolutely
 * positioned over it. Whichever layer is hidden is also made `inert`, so a
 * folded sidebar cannot be tabbed into.
 */
export function Sidebar() {
  const { identity, can } = useAuth();
  const { collapsed, toggle } = useSidebarCollapsed();
  // Read once here and handed to both layers: useHealth polls per mount, and
  // the folded rail must not cost a second poller on top of the footer's.
  const connected = useSocketStatus();
  const health = useHealth();

  return (
    <aside
      // Sticky, so it stays put while the page scrolls beside it. Without
      // this it is a screen-tall box at the top of a taller document, and
      // scrolling carries it off with everything else.
      className="sticky top-0 h-screen shrink-0 self-start overflow-hidden border-r transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ width: collapsed ? RAIL_WIDTH : OPEN_WIDTH }}
      data-collapsed={collapsed || undefined}
    >
      {/* The open column. Pinned to its full width so text never wraps while the aside narrows. */}
      <div
        className={cn(
          'flex h-full flex-col transition-opacity duration-200 motion-reduce:transition-none',
          collapsed && 'pointer-events-none opacity-0',
        )}
        style={{ width: OPEN_WIDTH }}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Wordmark height={18} />
            <span className="truncate text-xs text-muted-foreground" title={identity?.organization.name}>
              {identity?.organization.name ?? '—'}
            </span>
          </div>
          <FoldButton collapsed={false} onClick={toggle} />
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

        <SidebarFooter connected={connected} health={health} />
      </div>

      {/* The rail: the mark, the two health glyphs, and the way back out. */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-between py-4 transition-opacity duration-200 motion-reduce:transition-none',
          !collapsed && 'pointer-events-none opacity-0',
        )}
        inert={!collapsed}
        aria-hidden={!collapsed}
      >
        <button
          type="button"
          className="btn-bare"
          onClick={toggle}
          aria-label="Open sidebar"
          title={identity?.organization.name}
        >
          <Mark height={22} />
        </button>

        <div className="flex flex-col items-center gap-3">
          <RailGlyphs connected={connected} health={health} />
          <FoldButton collapsed onClick={toggle} />
        </div>
      </div>
    </aside>
  );
}

/**
 * The fold control. A chevron drawn in the mono face, so it sits with the
 * rest of the rail's type rather than importing an icon set for one glyph.
 */
function FoldButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn-bare datum -mr-1 px-1 text-[15px] leading-none text-muted-foreground"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? '›' : '‹'}
    </button>
  );
}

/** The two health signals, as glyphs alone — the labels are one click away. */
function RailGlyphs({ connected, health: { report, reachable } }: HealthProps) {

  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <span title={connected ? 'live' : 'not live'} className={connected ? 'text-primary' : undefined}>
        <Glyph kind={connected ? 'filled' : 'slash'} />
      </span>
      <span title={!reachable ? 'server unreachable' : (report?.status ?? 'checking')}>
        <Glyph kind={!reachable ? 'slash' : report?.status === 'ok' ? 'filled' : 'hollow'} />
      </span>
    </div>
  );
}

/**
 * Instrumentation and identity.
 *
 * The health strip moved here from the berth header: it answers "is what I am
 * looking at current?", which is a question about the whole app rather than
 * about one berth.
 */
interface HealthProps {
  connected: boolean;
  health: HealthState;
}

function SidebarFooter({ connected, health: { report, reachable } }: HealthProps) {
  const { identity, signOut, can } = useAuth();

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
