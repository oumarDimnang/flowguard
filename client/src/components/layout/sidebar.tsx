import { PlayCircleIcon } from '@phosphor-icons/react/PlayCircle';
import { SignOutIcon } from '@phosphor-icons/react/SignOut';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';

import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-context';
import { Mark, Wordmark } from '@/components/brand/logo';
import { Eyebrow, Select, ThemeToggler } from '@/components/primitives';
import { useResource } from '@/hooks/use-resource';
import { useSidebarCollapsed } from '@/hooks/use-sidebar';
import { cn } from '@/lib/utils';
import { Role } from '@/types';
import { NAV_GROUPS, ORGANIZATIONS_CHANGED } from './routes';
import { ScenarioRunner } from './scenario-runner';

/** One size for every icon in the rail, so they sit on the same line as the type. */
const ICON_SIZE = 16;

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
  const { collapsed, toggle, closeMobile } = useSidebarCollapsed();

  return (
    <aside
      // Sticky, so it stays put while the page scrolls beside it. Without
      // this it is a screen-tall box at the top of a taller document, and
      // scrolling carries it off with everything else.
      className="sticky top-0 h-screen max-md:relative max-md:h-[min(70dvh,36rem)] max-md:w-full! max-md:data-[collapsed]:h-14 shrink-0 self-start overflow-hidden border-r transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ width: collapsed ? RAIL_WIDTH : OPEN_WIDTH }}
      data-collapsed={collapsed || undefined}
    >
      {/* The open column. Pinned to its full width so text never wraps while the aside narrows. */}
      <div
        className={cn(
          'flex h-full flex-col max-md:w-full! transition-opacity duration-200 motion-reduce:transition-none',
          collapsed && 'pointer-events-none opacity-0',
        )}
        style={{ width: OPEN_WIDTH }}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Wordmark height={18} />
            {can(Role.ADMIN) ? (
              <OrganizationSwitcher />
            ) : (
              <span
                className="truncate text-xs text-muted-foreground"
                title={identity?.organization?.name}
              >
                {identity?.organization?.name ?? '—'}
              </span>
            )}
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
                    onClick={closeMobile}
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

        <SidebarFooter onNavigate={closeMobile} />
      </div>

      {/* The rail: the mark, the demo, and the way back out. */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-between py-4 max-md:flex-row max-md:px-5 transition-opacity duration-200 motion-reduce:transition-none',
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
          title={identity?.organization?.name}
        >
          <Mark height={22} />
        </button>

        <div className="flex flex-col items-center gap-3 max-md:flex-row">
          <Link
            to="/demo"
            onClick={closeMobile}
            className="text-muted-foreground hover:text-primary"
            aria-label="Demo"
            title="Demo — a recorded crane lift, step by step"
          >
            <PlayCircleIcon size={ICON_SIZE + 2} aria-hidden="true" />
          </Link>
          <FoldButton collapsed onClick={toggle} />
        </div>
      </div>
    </aside>
  );
}

/**
 * Which organization an admin is operating in.
 *
 * Reads as the plain line an operator sees in the same place, with a caret.
 * Refetches when an organization is created anywhere in the app, because the
 * sidebar stays mounted while pages come and go beneath it.
 */
function OrganizationSwitcher() {
  const { identity, openOrganization } = useAuth();
  const organizations = useResource((signal) => api.organizations.list(signal), []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const { reload } = organizations;
  useEffect(() => {
    window.addEventListener(ORGANIZATIONS_CHANGED, reload);
    return () => window.removeEventListener(ORGANIZATIONS_CHANGED, reload);
  }, [reload]);

  const current = identity?.organization;

  const open = async (organizationId: string) => {
    if (!organizationId || organizationId === current?.id) return;
    setBusy(true);
    setFailed(false);
    try {
      await openOrganization(organizationId);
    } catch {
      // The select stays on the organization that is actually open.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // The open one is listed even before the list has loaded, so the line is
  // never blank on first paint.
  const options = organizations.data
    ? organizations.data.map((organization) => ({ value: organization.id, label: organization.name }))
    : current
      ? [{ value: current.id, label: current.name }]
      : [];

  return (
    <Select
      variant="quiet"
      aria-label="Organization"
      value={current?.id}
      onValueChange={(organizationId) => void open(organizationId)}
      options={options}
      placeholder="No organization"
      disabled={busy}
      invalid={failed}
      title={failed ? 'Could not open that organization' : undefined}
    />
  );
}

/**
 * The fold control. A chevron drawn in the mono face rather than an icon, so
 * it reads as part of the rail's type.
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

/**
 * The demo, identity, and two preferences.
 *
 * Connection health is deliberately not repeated here. StatusBands raises a
 * band across the page the moment the API or the live channel drops, which is
 * the only time it is worth reading — a permanent "live · ok" line was one more
 * thing to read that almost never said anything.
 */
function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  const { identity, signOut, can } = useAuth();

  return (
    <footer className="flex flex-col gap-3 border-t px-5 py-4">
      <Link
        to="/demo"
        onClick={onNavigate}
        className="flex items-center gap-2 text-[13px]"
        title="A recorded crane lift, played step by step. No sign-in needed to share it."
      >
        <PlayCircleIcon size={ICON_SIZE} aria-hidden="true" />
        Demo
      </Link>

      {can(Role.OPERATOR) && identity?.organization ? <ScenarioRunner /> : null}

      <div className="flex items-end justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[13px]" title={identity?.user.email}>
            {identity?.user.name ?? '—'}
          </span>
          <span className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
            {identity?.user.role.toLowerCase() ?? ''}
          </span>
        </div>

        <div className="-mr-1.5 flex shrink-0 items-center">
          <ThemeToggler size={ICON_SIZE} />
          <SignOut onSignOut={signOut} />
        </div>
      </div>
    </footer>
  );
}

/** An icon-only control. The label is for screen readers and the tooltip. */
const ICON_BUTTON =
  'btn-bare flex size-7 items-center justify-center text-muted-foreground disabled:opacity-40';

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

  const label = busy ? 'Signing out…' : 'Sign out';

  return (
    <button
      type="button"
      className={ICON_BUTTON}
      disabled={busy}
      aria-busy={busy}
      aria-label={label}
      title={label}
      onClick={() => void run()}
    >
      <SignOutIcon size={ICON_SIZE} aria-hidden="true" />
    </button>
  );
}
