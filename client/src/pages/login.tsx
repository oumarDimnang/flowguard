import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Eyebrow, Page } from '@/components/primitives';

/**
 * Sign in.
 *
 * A ruled form on warm paper rather than a centred card with a drop shadow —
 * the rest of the product has no cards and no shadows, and the first screen
 * should not be the exception.
 */
export function Login() {
  const { identity, loading, signIn } = useAuth();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (identity) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(describe(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen">
      <Page className="grid min-h-screen grid-cols-1 items-center lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-24">
        <div className="flex flex-col gap-8 py-16">
          <div className="flex flex-col gap-1.5">
            <span className="datum text-[15px] font-medium tracking-[var(--tracking-wordmark)]">
              FLOWGUARD
            </span>
            <p className="text-xs text-muted-foreground">
              per-lift connectivity decisions, on the record
            </p>
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6 border-t pt-8">
            <Field
              label="email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              autoFocus
            />
            <Field
              label="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />

            {/*
             * One message for a wrong email and a wrong password alike. Which
             * half was wrong is not something a login form should reveal, and
             * the server deliberately does not tell us either.
             */}
            {error ? (
              <p role="alert" className="border-l-2 border-l-destructive pl-3 text-[13px] text-destructive">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn-line self-start px-4 py-2"
              disabled={submitting || email.length === 0 || password.length === 0}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <aside className="hidden flex-col gap-4 border-l pl-16 lg:flex">
          <Eyebrow>Demo accounts</Eyebrow>
          <dl className="flex flex-col">
            {DEMO_ACCOUNTS.map((account) => (
              <div
                key={account.email}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-4 border-t py-2"
              >
                <dt className="datum text-[13px]">{account.email}</dt>
                <dd className="datum m-0 text-[11px] tracking-[0.06em] text-muted-foreground">
                  {account.role}
                </dd>
                <dd className="col-span-2 m-0 text-xs text-muted-foreground">{account.note}</dd>
              </div>
            ))}
            <div className="border-t" />
          </dl>
          <p className="text-xs text-muted-foreground">
            All demo accounts use the password <span className="datum">flowguard</span>.
          </p>
        </aside>
      </Page>
    </main>
  );
}

/**
 * Listed on screen because this is a seeded sandbox and the whole point of the
 * second organization is that a viewer can check it sees nothing.
 * Remove this panel before anything real.
 */
const DEMO_ACCOUNTS = [
  {
    email: 'ops@khalifa-port.test',
    role: 'OPERATOR',
    note: 'Khalifa Bin Salman Port — can dispatch',
  },
  {
    email: 'auditor@khalifa-port.test',
    role: 'VIEWER',
    note: 'the same data, read only',
  },
  {
    email: 'ops@gulf-aerial.test',
    role: 'OPERATOR',
    note: 'a different organization — sees none of it',
  },
];

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (next: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className="datum border-b bg-transparent pb-1 text-[15px] focus:border-b-primary focus:outline-none"
      />
    </label>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isUnauthenticated) return 'Invalid email or password.';
    if (err.status === 400) return 'Enter a valid email address and password.';
    return 'The server rejected the request. Try again.';
  }
  // No response at all is a different problem from bad credentials, and saying
  // so saves someone retyping a password that was never wrong.
  return 'Could not reach the server. Check that it is running.';
}
