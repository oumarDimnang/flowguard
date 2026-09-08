import { BrowserRouter, Route, Routes } from 'react-router';

import { AuthProvider } from '@/auth/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { Analysis } from './pages/analysis';
import { Asset } from './pages/asset';
import { Network } from './pages/network';
import { Scenarios } from './pages/scenarios';
import { Users } from './pages/users';
import { ControlRoom } from '@/pages/control-room';
import { DecisionGraphPage } from '@/pages/decision-graph';
import { Impact } from '@/pages/impact';
import { Login } from '@/pages/login';
import { NotFound } from '@/pages/not-found';
import { OperationDetail } from '@/pages/operation-detail';
import { Operations } from '@/pages/operations';
import { Policy } from '@/pages/policy';
import { Register } from '@/pages/register';
import { Thesis } from '@/pages/thesis';

/**
 * Routes.
 *
 * `/login` and `/register` are the only pages outside the shell. Everything
 * else is inside it,
 * and the shell redirects anyone without a session — so a route added later is
 * protected by default rather than by remembering to protect it.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<AppShell />}>
            <Route index element={<ControlRoom />} />
            <Route path="operations" element={<Operations />} />
            <Route path="operations/:operationId" element={<OperationDetail />} />
            <Route path="operations/:operationId/graph" element={<DecisionGraphPage />} />
            <Route path="assets/:deviceId" element={<Asset />} />
            <Route path="network" element={<Network />} />
            <Route path="analysis" element={<Analysis />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="admin/users" element={<Users />} />
            <Route path="policy" element={<Policy />} />
            <Route path="thesis" element={<Thesis />} />
            <Route path="impact" element={<Impact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
