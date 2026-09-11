import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { Page } from '@/components/primitives';
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBands />
        <main className="min-w-0 flex-1">
          <Page className="pt-6 pb-16">
            <Outlet />
          </Page>
        </main>
      </div>
    </div>
  );
}
