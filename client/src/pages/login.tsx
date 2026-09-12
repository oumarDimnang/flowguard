import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';

import { AuthFrame } from '@/auth/auth-frame';
import { useAuth } from '@/auth/auth-context';
import { describeAuthError, looksLikeEmail } from '@/auth/describe-error';
import { FormAlert, PasswordField, SubmitButton, TextField } from '@/auth/form-fields';
import { Eyebrow } from '@/components/primitives';

/** Sign in. See AuthFrame for why this is a ruled form and not a card. */
export function Login() {
  const { identity, loading, signIn } = useAuth();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (identity) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    // Only what stops a pointless round trip. The server owns the real rules.
    const problems: typeof fieldErrors = {};
    if (!looksLikeEmail(email)) problems.email = 'Enter a valid email address.';
    if (password.length === 0) problems.password = 'Enter your password.';
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      // One message for a wrong email and a wrong password alike. Which half
      // was wrong is not something a login form should reveal, and the server
      // deliberately does not tell us either.
      setError(describeAuthError(err, 'Invalid email or password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setFieldErrors({});
    setError(undefined);
  };

  return (
    <AuthFrame
      heading="Sign in"
      footer={
        <>
          <span>Accounts are created by an administrator.</span>
          <Link to="/demo" className="link-rule ml-auto text-foreground">
            Demo
          </Link>
        </>
      }
      aside={<DemoAccounts onPick={fill} />}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
        <TextField
          label="email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          autoFocus
          disabled={submitting}
          error={fieldErrors.email}
        />
        <PasswordField
          label="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={submitting}
          error={fieldErrors.password}
        />

        {error ? <FormAlert>{error}</FormAlert> : null}

        <SubmitButton busy={submitting} busyLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}

const DEMO_PASSWORD = 'flowguard';

/**
 * Listed on screen because this is a seeded sandbox. Remove this panel before
 * anything real.
 */
const DEMO_ACCOUNTS = [
  {
    email: 'admin@flowguard.test',
    role: 'ADMIN',
    note: 'all organizations and accounts',
  },
  {
    email: 'ops@khalifa-port.test',
    role: 'OPERATOR',
    note: 'Khalifa Bin Salman Port',
  },
  {
    email: 'auditor@khalifa-port.test',
    role: 'VIEWER',
    note: 'Khalifa Bin Salman Port · read only',
  },
  {
    email: 'ops@gulf-aerial.test',
    role: 'OPERATOR',
    note: 'Gulf Aerial Survey',
  },
];

function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  return (
    <>
      <Eyebrow>Demo accounts</Eyebrow>
      <div className="flex flex-col">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account.email)}
            className="btn-bare grid grid-cols-[minmax(0,1fr)_5.5rem] items-baseline gap-x-4 border-t py-2 text-left hover:text-primary"
            title="Fill the form with this account"
          >
            <span className="datum text-[13px]">{account.email}</span>
            <span className="datum text-[11px] tracking-[0.06em] text-muted-foreground">
              {account.role}
            </span>
            <span className="col-span-2 text-xs text-muted-foreground">{account.note}</span>
          </button>
        ))}
        <div className="border-t" />
      </div>
      <p className="text-xs text-muted-foreground">
        All demo accounts use the password <span className="datum">{DEMO_PASSWORD}</span>. Click
        one to fill the form.
      </p>
    </>
  );
}
