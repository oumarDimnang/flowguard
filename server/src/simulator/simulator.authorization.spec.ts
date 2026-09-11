import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { describe, expect, it, vi } from 'vitest';

import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Role } from '../common/domain/tenancy';
import { SimulatorController } from './simulator.controller';

// Keep the real controller metadata and guards, but avoid loading the service's
// database and Temporal dependencies. No application or HTTP server is started.
vi.mock('./simulator.service', () => ({
  SimulatorService: class SimulatorService {},
}));

function context(method: 'list' | 'run', request: object) {
  return new ExecutionContextHost(
    [request],
    SimulatorController,
    SimulatorController.prototype[method],
  );
}

function signedIn(role: Role) {
  return { session: { user: { organizationId: 'org-demo', role } } };
}

// Apply the same authentication-before-authorization order as AppModule.
// These are guard/route-metadata tests, not HTTP middleware integration tests.
function authorize(method: 'list' | 'run', request: object) {
  const reflector = new Reflector();
  const ctx = context(method, request);
  return new SessionAuthGuard(reflector).canActivate(ctx)
    && new RolesGuard(reflector).canActivate(ctx);
}

describe('Simulator route authorization', () => {
  it.each(['list', 'run'] as const)('rejects anonymous access to %s with 401', (method) => {
    expect(() => authorize(method, {})).toThrow(UnauthorizedException);
  });

  it('rejects a session without a signed-in user', () => {
    expect(() => authorize('run', { session: {} })).toThrow(UnauthorizedException);
  });

  it('rejects a viewer launching a scenario with 403', () => {
    expect(() => authorize('run', signedIn(Role.VIEWER))).toThrow(ForbiddenException);
  });

  it.each([Role.OPERATOR, Role.ADMIN])('allows %s to launch a scenario', (role) => {
    expect(authorize('run', signedIn(role))).toBe(true);
  });

  it.each([Role.VIEWER, Role.OPERATOR, Role.ADMIN])(
    'allows %s to inspect the scenario list',
    (role) => {
      expect(authorize('list', signedIn(role))).toBe(true);
    },
  );

  it('does not let request body fields grant operator access', () => {
    const request = {
      ...signedIn(Role.VIEWER),
      body: { role: Role.ADMIN, organizationId: 'another-org' },
    };
    expect(() => authorize('run', request)).toThrow(ForbiddenException);
  });
});
