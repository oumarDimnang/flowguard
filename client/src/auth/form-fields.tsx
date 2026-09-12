import { useId, useState } from 'react';

import { Eyebrow, Glyph, Select, SkeletonRows, type SelectOption } from '@/components/primitives';
import { cn } from '@/lib/utils';

/**
 * Form controls for sign-in and the admin forms.
 *
 * Underlined inputs, eyebrow labels, and an error that sits directly under
 * the field it belongs to — a form that lists every problem at the top makes
 * the reader map each one back to a field themselves. Every control is
 * labelled, every error is announced, and the whole thing works from the
 * keyboard alone.
 */

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  /** Rendered on the label's baseline, right-aligned. The password reveal. */
  trailing?: React.ReactNode;
  children: (ids: { inputId: string; describedBy: string | undefined }) => React.ReactNode;
}

function FieldShell({ label, error, hint, trailing, children }: FieldShellProps) {
  const inputId = useId();
  const messageId = useId();
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId}>
          <Eyebrow>{label}</Eyebrow>
        </label>
        {trailing}
      </div>

      {children({ inputId, describedBy })}

      {error ? (
        <p id={messageId} role="alert" className="border-l-2 border-l-destructive pl-2 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  'datum w-full border-b bg-transparent pb-1 text-[15px] focus:border-b-primary focus:outline-none disabled:text-muted-foreground aria-invalid:border-b-destructive';

export interface TextFieldProps {
  label: string;
  type?: 'text' | 'email';
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  autoFocus,
  disabled,
  error,
  hint,
}: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          type={type}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT}
        />
      )}
    </FieldShell>
  );
}

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  error?: string;
  hint?: string;
}

/** A password input with a reveal, because a hidden typo is the commonest login failure. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  hint,
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);

  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      trailing={
        <button
          type="button"
          className="btn-bare text-[11px] text-muted-foreground"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          disabled={disabled}
        >
          {shown ? 'hide' : 'show'}
        </button>
      }
    >
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT}
        />
      )}
    </FieldShell>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
}

export interface ChoiceFieldProps<T extends string> {
  label: string;
  choices: readonly Choice<T>[];
  value: T | undefined;
  onChange: (next: T) => void;
  disabled?: boolean;
  error?: string;
  /** Rendered instead of the choices while they load. */
  loading?: boolean;
}

/**
 * A radio group drawn as ruled rows with the status glyph, rather than a
 * select — there are two or three options, and a dropdown hides the thing the
 * reader is choosing between.
 */
export function ChoiceField<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled,
  error,
  loading,
}: ChoiceFieldProps<T>) {
  const groupId = useId();
  const messageId = useId();

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
      aria-describedby={error ? messageId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="p-0">
        <Eyebrow>{label}</Eyebrow>
      </legend>

      <div className="flex flex-col">
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Loading" className="contents">
            <SkeletonRows
              rows={2}
              layoutClassName="flex flex-col gap-2"
              rowClassName="border-t py-3"
              columns={['40%', '75%']}
              closing={false}
            />
          </div>
        ) : (
          choices.map((choice) => {
              const checked = choice.value === value;
              return (
                <label
                  key={choice.value}
                  className={cn(
                    'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 border-t py-2.5',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                    checked && 'text-primary',
                    disabled && 'cursor-not-allowed text-muted-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name={groupId}
                    value={choice.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(choice.value)}
                    className="sr-only"
                  />
                  <Glyph kind={checked ? 'filled' : 'hollow'} className="translate-y-px" />
                  <span className="text-[15px]">{choice.label}</span>
                  {choice.note ? (
                    <span className="col-start-2 text-xs text-muted-foreground">{choice.note}</span>
                  ) : null}
                </label>
              );
            })
        )}
        <div className="border-t" />
      </div>

      {error ? (
        <p id={messageId} role="alert" className="border-l-2 border-l-destructive pl-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly SelectOption[];
  /** Shown while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

/** A select with the same underline and label as the text fields. For lists too long for ChoiceField. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error}>
      {({ inputId, describedBy }) => (
        <Select
          id={inputId}
          value={value}
          onValueChange={onChange}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  );
}

/**
 * A problem with the whole submission, not one field: bad credentials, a
 * throttle, an unreachable server.
 */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-l-destructive pl-3 text-[13px] text-destructive">
      {children}
    </p>
  );
}

export interface SubmitButtonProps {
  children: React.ReactNode;
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
}

export function SubmitButton({ children, busy, busyLabel, disabled }: SubmitButtonProps) {
  return (
    <button type="submit" className="btn-line self-start px-4 py-2" disabled={busy || disabled}>
      {busy ? busyLabel : children}
    </button>
  );
}
