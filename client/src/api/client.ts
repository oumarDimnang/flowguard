/**
 * Thin fetch wrapper for the FlowGuard server.
 *
 * Deliberately not a client library: four pages of read-mostly calls do not
 * justify one, and a wrapper this small stays readable when something fails on
 * stage at 400ms of latency.
 */

/**
 * Base URL of the NestJS server.
 *
 * Vite inlines every VITE_-prefixed variable into the browser bundle, so only
 * public values belong here. A base URL qualifies; an API key never would.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * A non-2xx response from the server.
 *
 * Carries the parsed body because Nest's exception filter returns useful
 * detail — a 400 from the ValidationPipe lists exactly which field was
 * rejected, and swallowing that turns a five-second fix into an afternoon.
 */
export class ApiError extends Error {
  // Declared and assigned rather than written as constructor parameter
  // properties: `erasableSyntaxOnly` is on, and that syntax emits runtime code.
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(status: number, url: string, body: unknown) {
    super(`${status} ${url}${detail(body) ? ` — ${detail(body)}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }

  /** 404 is an expected outcome for several routes, not necessarily a failure. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Not signed in, or the session was revoked. The app should show login. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Signed in, but this account's role does not permit the action. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** The thing being created already exists — a taken email on sign-up. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Throttled. `retryAfterSeconds` is the server's own figure when it gave one. */
  get isThrottled(): boolean {
    return this.status === 429;
  }

  /**
   * The validation messages from a 400, one per rejected field. Nest's
   * ValidationPipe returns them as an array; anything else is a single string.
   */
  get messages(): string[] {
    const body = this.body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (Array.isArray(message)) return message.map(String);
      if (typeof message === 'string') return [message];
    }
    return [];
  }
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/**
 * Notified when any request outside /auth comes back 401.
 *
 * A session lasts a week and can be revoked from the server side at any time.
 * Without this, an expired session shows up as every panel failing separately
 * — the auth context subscribes so the shell can send the user to the login
 * form instead. Returns an unsubscribe function.
 */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => {
    unauthenticatedListeners.delete(listener);
  };
}

function detail(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
  return undefined;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;

  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    signal,
    // The session lives in an httpOnly cookie on a different origin in
    // development, so it only travels when this is set. Without it every
    // request is anonymous and the whole app 401s.
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Read the body before checking status: the error detail is in there, and a
  // consumed-stream error while handling a failure is a miserable thing to
  // debug.
  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? safeJson(raw) : undefined;

  if (!response.ok) {
    // The auth routes answer 401 as part of their contract — bad credentials,
    // or "not signed in" on /auth/me — so those are not a lost session.
    if (response.status === 401 && !url.pathname.startsWith('/auth/')) {
      for (const listener of unauthenticatedListeners) listener();
    }
    throw new ApiError(response.status, url.pathname, parsed);
  }

  return parsed as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // A proxy error page or an HTML 502 — return the text so ApiError can show
    // something more useful than "Unexpected token <".
    return raw;
  }
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'POST' }),

  patch: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'PATCH' }),
};
