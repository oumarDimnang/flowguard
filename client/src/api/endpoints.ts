import type {
  Identity,
  User,
  FacilityDescriptor,
  FacilityJob,
  CreateBusinessEvent,
  DecisionRecord,
  HealthReport,
  ImpactMetrics,
  Operation,
  OperationAccepted,
  OperationExecution,
  Paginated,
  PaginationQuery,
  Scenario,
  ScenarioRun,
} from '../types';
import { http } from './client';

/**
 * One function per server route.
 *
 * Grouped by the controller they hit, so a route added in NestJS has an obvious
 * home here. Nothing in this file holds state or caches — that is the hooks'
 * job.
 */

// ── Authentication ───────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string) =>
    http.post<Identity>('/auth/login', { body: { email, password } }),

  /** Destroys the session server-side, so it is revoked rather than forgotten. */
  logout: () => http.post<void>('/auth/logout'),

  /** Throws ApiError(401) when not signed in — that is the signal, not an error. */
  me: (signal?: AbortSignal) => http.get<Identity>('/auth/me', { signal }),
};

// ── Facility (the stand-in customer system) ──────────────────────────

/**
 * One set of routes for every industry.
 *
 * The server picks the adapter from the organization's industry, so a drone
 * operator and a container terminal hit identical URLs and get the same shape
 * back with a different lifecycle inside it.
 */
export const facility = {
  describe: (signal?: AbortSignal) => http.get<FacilityDescriptor>('/facility', { signal }),

  jobs: (signal?: AbortSignal) => http.get<FacilityJob[]>('/facility/jobs', { signal }),

  job: (jobId: string, signal?: AbortSignal) =>
    http.get<FacilityJob>(`/facility/jobs/${jobId}`, { signal }),

  /**
   * Issue the job instruction. Returns once the workflow has started, with the
   * job already at its first state — the rest arrives on the socket.
   */
  dispatch: (jobId: string) => http.post<FacilityJob>(`/facility/jobs/${jobId}/dispatch`),

  /**
   * Report the job halted with its load committed.
   *
   * Not a cancellation: connectivity is held through it. The reason is the
   * facility's own words and lands in the decision trail.
   */
  suspend: (jobId: string, reason: string) =>
    http.post<FacilityJob>(`/facility/jobs/${jobId}/suspend`, { body: { reason } }),

  /** Moving again, or the committed load has been landed. */
  resume: (jobId: string) => http.post<FacilityJob>(`/facility/jobs/${jobId}/resume`),

  abort: (jobId: string) => http.post<FacilityJob>(`/facility/jobs/${jobId}/abort`),

  /** Restore the plan. Releases anything still in flight. */
  reset: () => http.post<FacilityJob[]>('/facility/reset'),
};

// ── Operations (the dashboard read model) ────────────────────────────

export const operations = {
  active: (signal?: AbortSignal) => http.get<Operation[]>('/operations/active', { signal }),

  list: (query?: PaginationQuery, signal?: AbortSignal) =>
    http.get<Paginated<Operation>>('/operations', { query, signal }),

  get: (operationId: string, signal?: AbortSignal) =>
    http.get<Operation>(`/operations/${operationId}`, { signal }),

  /**
   * Temporal's own view, bypassing the projection.
   *
   * Worth surfacing in the UI: when the read model and the workflow disagree
   * the workflow is right, and being able to show that on demand is a stronger
   * answer than asserting the projection is trustworthy.
   */
  execution: (operationId: string, signal?: AbortSignal) =>
    http.get<OperationExecution>(`/operations/${operationId}/execution`, { signal }),
};

// ── Decision log (the audit trail) ───────────────────────────────────

export const decisionLog = {
  list: (query?: PaginationQuery, signal?: AbortSignal) =>
    http.get<Paginated<DecisionRecord>>('/decision-log', { query, signal }),

  /** Full trail for one operation, oldest first — the replay view. */
  byOperation: (operationId: string, signal?: AbortSignal) =>
    http.get<DecisionRecord[]>(`/decision-log/${operationId}`, { signal }),
};

// ── Events (what facility systems submit) ────────────────────────────

export const events = {
  submit: (event: CreateBusinessEvent) =>
    http.post<OperationAccepted>('/events', { body: event }),

  /** The signal that triggers release. */
  complete: (operationId: string) =>
    http.post<{ operationId: string; signalled: true }>(`/events/${operationId}/complete`),
};

// ── Simulator (the scripted, reproducible path) ──────────────────────

export const simulator = {
  scenarios: (signal?: AbortSignal) =>
    http.get<Scenario[]>('/simulator/scenarios', { signal }),

  run: (scenarioId: string) =>
    http.post<ScenarioRun>(`/simulator/scenarios/${scenarioId}/run`),
};

// ── Users (admin only) ───────────────────────────────────────────────

export const users = {
  /**
   * Everyone in the caller's organization. Scoped server-side from the session,
   * so there is no parameter here that could ask about another tenant.
   */
  list: (signal?: AbortSignal) => http.get<User[]>('/users', { signal }),
};

// ── Metrics and health ───────────────────────────────────────────────

export const metrics = {
  impact: (signal?: AbortSignal) => http.get<ImpactMetrics>('/metrics', { signal }),
};

export const health = {
  /**
   * Returns 503 with a full report when degraded, so a failing check arrives as
   * an ApiError whose `body` is the HealthReport rather than as a null.
   */
  check: (signal?: AbortSignal) => http.get<HealthReport>('/health', { signal }),

  live: (signal?: AbortSignal) => http.get<{ status: 'ok' }>('/health/live', { signal }),
};

export const api = {
  auth,
  users,
  facility,
  operations,
  decisionLog,
  events,
  simulator,
  metrics,
  health,
};
