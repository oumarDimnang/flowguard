import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, onUnauthenticated } from '@/api/client';
import { api } from '@/api/endpoints';
import { closeSocket } from '@/api/socket';
import { Role, roleAtLeast, type Identity, type RegisterRequest } from '@/types';

export interface AuthState {
  identity: Identity | undefined;
  /** True until the first /auth/me has resolved one way or the other. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates an organization with this account as its first admin, then signs in. */
  register: (request: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
  /** Role check for hiding controls. The server guard is the real enforcement. */
  can: (required: Role) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Who is signed in, for the whole app.
 *
 * On mount it asks the server rather than trusting anything local. The session
 * lives in an httpOnly cookie that JavaScript cannot read, so "am I signed in"
 * is a question only the server can answer — and a 401 from that call is the
 * expected negative answer, not an error worth showing.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    api.auth
      .me(controller.signal)
      .then(
        (found) => {
          if (!cancelled) setIdentity(found);
        },
        (err: unknown) => {
          // 401 means "not signed in", which is a normal state on first load.
          // Anything else is a real failure, and the app still has to render —
          // the unreachable-server band is what tells the user about it.
          if (!cancelled && !(err instanceof ApiError && err.isUnauthenticated)) {
            console.error('Could not resolve identity', err);
          }
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // A 401 from any data route means the session is gone — expired, or revoked
  // server-side. Drop the identity so the shell sends the user back to sign
  // in, rather than leaving a dashboard where every panel fails on its own.
  useEffect(
    () =>
      onUnauthenticated(() => {
        closeSocket();
        setIdentity(undefined);
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const found = await api.auth.login(email, password);
    // The socket authenticates from the cookie at handshake, so a connection
    // opened while signed out is anonymous and was rejected. Drop it; the next
    // subscriber opens a fresh one that now carries a session.
    closeSocket();
    setIdentity(found);
  }, []);

  const register = useCallback(async (request: RegisterRequest) => {
    const found = await api.auth.register(request);
    closeSocket();
    setIdentity(found);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Sign out locally even if the request failed — leaving someone looking
      // at another account's dashboard is worse than a stale server session,
      // which expires on its own.
      closeSocket();
      setIdentity(undefined);
    }
  }, []);

  const can = useCallback(
    (required: Role) => roleAtLeast(identity?.user.role, required),
    [identity],
  );

  const value = useMemo<AuthState>(
    () => ({ identity, loading, signIn, register, signOut, can }),
    [identity, loading, signIn, register, signOut, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth used outside AuthProvider');
  }
  return context;
}
