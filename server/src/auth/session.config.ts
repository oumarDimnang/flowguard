import MongoStore from 'connect-mongo';
import session from 'express-session';
import type { RequestHandler } from 'express';

import type { Role } from '../common/domain/tenancy';

/** Seven days. Long enough that a demo never signs itself out mid-run. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What a session carries.
 *
 * The organization id is the organization this session is operating in, and it
 * is read from the session on every request — never taken from a header, a
 * query parameter or a request body. That is the whole tenant boundary.
 *
 * For an operator or viewer it is always their own organization, re-read from
 * the account on refresh. For an admin it is the organization they chose to
 * open, and changes only through the admin-only switch route. Absent when an
 * admin has no organization to open.
 */
export interface SessionUser {
  id: string;
  organizationId?: string;
  email: string;
  name: string;
  role: Role;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

/** The cookie name. Exported so logout can clear exactly the cookie login set. */
export const SESSION_COOKIE = 'fg_session';

export interface SessionOptions {
  secret: string;
  mongoUri: string;
  /** Enables Secure cookies. Must be true behind HTTPS, false on localhost. */
  secure: boolean;
}

/**
 * The session middleware, built once and shared.
 *
 * Returned rather than applied so the *same instance* can be given to both
 * Express and the Socket.IO engine. Two instances would each parse the cookie
 * with their own store handle and the socket would authenticate against state
 * the HTTP side never sees.
 */
export function createSessionMiddleware(options: SessionOptions): RequestHandler {
  return session({
    name: SESSION_COOKIE,
    secret: options.secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: options.mongoUri,
      collectionName: 'sessions',
      // Let Mongo expire sessions rather than sweeping them ourselves.
      ttl: MAX_AGE_MS / 1000,
      touchAfter: 24 * 60 * 60,
    }),
    cookie: {
      // The point of the whole choice: script on the page cannot read this,
      // so an XSS bug cannot walk away with a session.
      httpOnly: true,
      // 'lax' still sends the cookie on top-level navigation, which keeps a
      // pasted dashboard link working, while blocking cross-site form posts.
      sameSite: 'lax',
      secure: options.secure,
      maxAge: MAX_AGE_MS,
      path: '/',
    },
  });
}
