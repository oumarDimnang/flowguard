/**
 * DI token for the shared session middleware.
 *
 * Lives in its own file so the realtime gateway can inject it without importing
 * the auth module — which would create a cycle, since auth needs realtime to
 * announce nothing and realtime needs auth to identify sockets.
 */
export const SESSION_MIDDLEWARE = 'FLOWGUARD_SESSION_MIDDLEWARE';
