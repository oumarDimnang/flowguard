import { useState } from 'react';
import { Navigate } from 'react-router';

import { ApiError } from '@/api/client';
import { api } from '@/api/endpoints';
import { AuthFrame } from '@/auth/auth-frame';
import { useAuth } from '@/auth/auth-context';
import { describeAuthError, fieldFor, looksLikeEmail } from '@/auth/describe-error';
import {
  ChoiceField,
  FormAlert,
  PasswordField,
  SubmitButton,
  TextField,
  type Choice,
} from '@/auth/form-fields';
import { Eyebrow } from '@/components/primitives';
import { useResource } from '@/hooks/use-resource';
import { Industry } from '@/types';

/** Mirrors the floor in server/src/auth/dto/register.dto.ts. */
const PASSWORD_MIN = 12;

type Field = 'name' | 'email' | 'password' | 'confirm' | 'organizationName' | 'industry';
type Errors = Partial<Record<Field, string>>;

/**
 * How each industry reads on the form. The server says which exist; this
 * only says what they mean to someone who has not read the adapters.
 */
const INDUSTRY_COPY: Record<Industry, Omit<Choice<Industry>, 'value'>> = {
  [Industry.CONTAINER_TERMINAL]: {
    label: 'Container terminal',
    note: 'Quay cranes and container moves. Criticality from load, route and what is underneath.',
  },
  [Industry.DRONE_OPERATIONS]: {
    label: 'Drone operations',
    note: 'Survey and inspection fleets. The same aircraft is routine or urgent by mission.',
  },
  [Industry.EMERGENCY_DISPATCH]: {
    label: 'Emergency dispatch',
    note: 'Ambulances and first responders.',
  },
};

/**
 * Sign up.
 *
 * Creates an organization and makes the registrant its first admin. That is
 * the whole shape: there is no field for joining an existing organization,
 * because with no invitation mechanism a sign-up form is the one thing that
 * must never be able to place a stranger inside a tenant.
 */
export function Register() {
  const { identity, loading, register } = useAuth();
  const industries = useResource((signal) => api.auth.industries(signal), []);

  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    organizationName: '',
    industry: undefined as Industry | undefined,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (identity) return <Navigate to="/" replace />;

  const set = <K extends keyof typeof values>(key: K) => (next: (typeof values)[K]) =>
    setValues((v) => ({ ...v, [key]: next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    const problems = validate(values);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        organizationName: values.organizationName.trim(),
        industry: values.industry!,
      });
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setErrors({ email: 'An account already exists for that email. Sign in instead.' });
      } else if (err instanceof ApiError && err.status === 400 && err.messages.length > 0) {
        // The server's own validation, one message per field where it names one.
        const byField: Errors = {};
        const loose: string[] = [];
        for (const message of err.messages) {
          const field = fieldFor(message) as Field | undefined;
          if (field && !byField[field]) byField[field] = message;
          else loose.push(message);
        }
        setErrors(byField);
        if (loose.length > 0) setError(loose.join(' '));
      } else {
        setError(describeAuthError(err, 'Could not create the account.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const choices: Choice<Industry>[] = (industries.data?.industries ?? []).map((industry) => ({
    value: industry,
    ...(INDUSTRY_COPY[industry] ?? { label: industry, note: '' }),
  }));

  return (
    <AuthFrame
      heading="Create an organization"
      footer={{ prompt: 'Already have an account?', label: 'Sign in', to: '/login' }}
      aside={<WhatThisCreates />}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
        <TextField
          label="your name"
          value={values.name}
          onChange={set('name')}
          autoComplete="name"
          autoFocus
          disabled={submitting}
          error={errors.name}
        />
        <TextField
          label="email"
          type="email"
          value={values.email}
          onChange={set('email')}
          autoComplete="email"
          disabled={submitting}
          error={errors.email}
        />
        <PasswordField
          label="password"
          value={values.password}
          onChange={set('password')}
          autoComplete="new-password"
          disabled={submitting}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters. Length is the only rule.`}
        />
        <PasswordField
          label="confirm password"
          value={values.confirm}
          onChange={set('confirm')}
          autoComplete="new-password"
          disabled={submitting}
          error={errors.confirm}
        />

        <div className="border-t" />

        <TextField
          label="organization"
          value={values.organizationName}
          onChange={set('organizationName')}
          autoComplete="organization"
          disabled={submitting}
          error={errors.organizationName}
          hint="The facility this account operates. You become its first admin."
        />
        <ChoiceField
          label="industry"
          choices={choices}
          value={values.industry}
          onChange={set('industry')}
          disabled={submitting}
          loading={industries.loading && choices.length === 0}
          error={
            errors.industry ??
            (industries.error ? 'Could not load the industry list. Is the server running?' : undefined)
          }
        />

        {error ? <FormAlert>{error}</FormAlert> : null}

        <SubmitButton busy={submitting} busyLabel="Creating…" disabled={choices.length === 0}>
          Create organization
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}

function validate(values: {
  name: string;
  email: string;
  password: string;
  confirm: string;
  organizationName: string;
  industry: Industry | undefined;
}): Errors {
  const errors: Errors = {};
  if (values.name.trim().length === 0) errors.name = 'Enter your name.';
  if (!looksLikeEmail(values.email)) errors.email = 'Enter a valid email address.';
  if (values.password.length < PASSWORD_MIN) {
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (values.confirm !== values.password) errors.confirm = 'The two passwords differ.';
  if (values.organizationName.trim().length === 0) {
    errors.organizationName = 'Enter the organization name.';
  }
  if (!values.industry) errors.industry = 'Choose an industry.';
  return errors;
}

/**
 * What the button actually does, stated before it is pressed. An account that
 * creates a tenant is a bigger thing than an account that joins one, and the
 * form should not look like the smaller thing.
 */
function WhatThisCreates() {
  const steps = [
    ['organization', 'A new tenant, isolated by construction. Its operations, decisions and live events belong to it alone.'],
    ['admin', 'You, with the ADMIN role: everything an operator can do, plus the people page.'],
    ['nobody else', 'No one can join from outside. Invites do not exist yet, and until they do neither does a way in.'],
  ] as const;

  return (
    <>
      <Eyebrow>What this creates</Eyebrow>
      <dl className="flex flex-col">
        {steps.map(([term, detail]) => (
          <div key={term} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 border-t py-2">
            <dt className="datum text-[13px]">{term}</dt>
            <dd className="m-0 max-w-[48ch] text-xs text-muted-foreground">{detail}</dd>
          </div>
        ))}
        <div className="border-t" />
      </dl>
      <p className="max-w-[52ch] text-xs text-muted-foreground">
        A new organization starts with the standard facility for its industry, so there is
        something to dispatch the moment you sign in.
      </p>
    </>
  );
}
