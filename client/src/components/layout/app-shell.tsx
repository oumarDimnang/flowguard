import { Link, Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { Page } from '@/components/primitives';
import { Role } from '@/types';
import { Sidebar } from './sidebar';
import { StatusBands } from './status-band';

/**
 * The application frame, behind authentication.
 *
 * Sidebar on the left, degraded-state bands above the routed page so a failure
 * displaces content rather than floating over it.
 *
 * Anyone not signed in is redirected to the login form, carrying where they
 * were trying to go — a pasted deep link should survive signing in rather than
 * dumping the user on the home page.
 */
export function AppShell() {
  const { identity, loading } = useAuth();
  const location = useLocation();

  // Render nothing until the first /auth/me resolves. Flashing the login form
  // at a user who is already signed in is worse than a blank moment.
  if (loading) return null;

  if (!identity) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Keyed on the organization: when an admin opens another one, every panel
  // remounts, refetches and resubscribes on the new socket, rather than showing
  // the previous organization's data under the new name.
  const scope = identity.organization?.id ?? 'none';

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />

      <div key={scope} className="flex min-w-0 flex-1 flex-col">
        <StatusBands />
        <main className="min-w-0 flex-1">
          <Page className="pt-6 pb-8">
            <Outlet />
          </Page>
        </main>
      </div>
    </div>
  );
}

/** Routes that read one organization's operations. */
export function RequireOrganization() {
  const { identity, can } = useAuth();

  if (identity?.organization) return <Outlet />;

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <h1 className="text-xl">No organization</h1>
      {can(Role.ADMIN) ? (
        <Link to="/admin/organizations" className="link-rule text-[13px]">
          Create an organization
        </Link>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          This account is not assigned to an organization.
        </p>
      )}
    </div>
  );
}

/** Admin-only routes. The server refuses them too; this saves a page of 403s. */
export function RequireAdmin() {
  const { can } = useAuth();
  return can(Role.ADMIN) ? <Outlet /> : <Navigate to="/" replace />;
}
