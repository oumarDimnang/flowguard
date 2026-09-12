import { BrowserRouter, Route, Routes } from 'react-router';

import { AuthProvider } from '@/auth/auth-context';
import { AppShell, RequireAdmin, RequireOrganization } from '@/components/layout/app-shell';
import { Asset } from '@/pages/asset';
import { ControlRoom } from '@/pages/control-room';
import { Dashboard } from '@/pages/dashboard';
import { DecisionGraphPage } from '@/pages/decision-graph';
import { Demo } from '@/pages/demo';
import { LiveOperation } from '@/pages/live-operation';
import { Login } from '@/pages/login';
import { NotFound } from '@/pages/not-found';
import { OperationDetail } from '@/pages/operation-detail';
import { Operations } from '@/pages/operations';
import { Organizations } from '@/pages/organizations';
import { Policy } from '@/pages/policy';
import { Scenarios } from '@/pages/scenarios';
import { Thesis } from '@/pages/thesis';
import { Users } from '@/pages/users';

/**
 * Routes.
 *
 * `/login` and `/demo` are the only pages outside the shell. Everything else is
 * inside it, and the shell redirects anyone without a session — so a route
 * added later is protected by default rather than by remembering to protect
 * it. The demo is public because it reads nothing from the server: it replays
 * a recording bundled into the page.
 *
 * Pages that read an organization's operations sit under RequireOrganization,
 * for the one case where there is none: an admin before any organization
 * exists. The admin pages do not need one.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/demo" element={<Demo />} />

          <Route element={<AppShell />}>
            <Route element={<RequireOrganization />}>
              <Route index element={<Dashboard />} />
              <Route path="control-room" element={<ControlRoom />} />
              <Route path="operations" element={<Operations />} />
              <Route path="operations/:operationId" element={<OperationDetail />} />
              <Route path="operations/:operationId/graph" element={<DecisionGraphPage />} />
              <Route path="operations/:operationId/live" element={<LiveOperation />} />
              <Route path="assets/:deviceId" element={<Asset />} />
              <Route path="scenarios" element={<Scenarios />} />
              <Route path="thesis" element={<Thesis />} />
            </Route>

            <Route path="policy" element={<Policy />} />

            <Route element={<RequireAdmin />}>
              <Route path="admin/organizations" element={<Organizations />} />
              <Route path="admin/users" element={<Users />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
