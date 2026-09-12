import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMemo, useState } from 'react';

import { ApiError } from '@/api/client';
import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-context';
import { describeAuthError, looksLikeEmail } from '@/auth/describe-error';
import {
  ChoiceField,
  FormAlert,
  PasswordField,
  SelectField,
  TextField,
  type Choice,
} from '@/auth/form-fields';
import { PageHeader } from '@/components/layout/page-header';
import {
  Drawer,
  DrawerClose,
  Eyebrow,
  Glyph,
  Loadable,
  Select,
  SkeletonRows,
  Slot,
} from '@/components/primitives';
import { EMPTY, useResource } from '@/hooks/use-resource';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Role, belongsToOrganization, type Organization, type User } from '@/types';

const GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5.5rem_minmax(0,1fr)_5.5rem] gap-x-4';

/** Shown in the filter; not an organization id. */
const ADMINS = 'admins';
const EVERYONE = 'all';

/** Every account in the system. New accounts are created in a drawer. Admin only. */
export function Users() {
  const users = useResource((signal) => api.users.list(signal), []);
  const organizations = useResource((signal) => api.organizations.list(signal), []);
  const [filter, setFilter] = useState(EVERYONE);

  const orgs = organizations.data ?? EMPTY;
  const names = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);

  const rows = useMemo(() => {
    const all = users.data ?? EMPTY;
    const shown =
      filter === EVERYONE
        ? all
        : filter === ADMINS
          ? all.filter((user) => user.role === Role.ADMIN)
          : all.filter((user) => user.organizationId === filter);

    // Admins first, then by organization, then by name.
    return [...shown].sort(
      (a, b) =>
        Number(a.role !== Role.ADMIN) - Number(b.role !== Role.ADMIN) ||
        (names.get(a.organizationId ?? '') ?? '').localeCompare(names.get(b.organizationId ?? '') ?? '') ||
        a.name.localeCompare(b.name),
    );
  }, [filter, names, users.data]);

  const replace = (user: User) =>
    users.setData((previous) => {
      const others = (previous ?? []).filter((u) => u.id !== user.id);
      return [...others, user];
    });

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<User | undefined>(undefined);

  const add = (user: User) => {
    users.setData((previous) => [...(previous ?? []), user]);
    setCreated(user);
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="Users"
        meta={
          <>
            <Slot ch={3}>{users.data?.length ?? 0}</Slot> accounts
          </>
        }
      />

      <section className="min-w-0">
          <div className="flex items-center justify-between gap-4 border-t pt-3 pb-2">
            <div className="flex min-w-0 items-baseline gap-4">
              <Eyebrow className="text-foreground">Accounts</Eyebrow>
              {created ? (
                <span className="truncate text-xs text-primary">
                  Created {created.email}
                  {created.organizationId ? ` · ${names.get(created.organizationId) ?? ''}` : ''}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="eyebrow">show</span>
                <Select
                  variant="inline"
                  aria-label="Show"
                  value={filter}
                  onValueChange={setFilter}
                  options={[
                    { value: EVERYONE, label: 'Everyone' },
                    { value: ADMINS, label: 'Admins' },
                    ...orgs.map((organization) => ({ value: organization.id, label: organization.name })),
                  ]}
                  className="min-w-[10rem] text-[12px]"
                />
              </div>

              <button
                type="button"
                className="btn-line inline-flex items-center gap-1.5"
                onClick={() => setCreating(true)}
              >
                <PlusIcon size={14} aria-hidden="true" />
                New account
              </button>
            </div>
          </div>

          <div className={cn(GRID, 'eyebrow border-t pt-2 pb-1.5')}>
            <span>name</span>
            <span>email</span>
            <span>role</span>
            <span>organization</span>
            <span className="text-right">last seen</span>
          </div>

          <Loadable
            loading={users.loading && !users.data}
            empty={rows.length === 0}
            skeleton={
              <SkeletonRows
                rows={4}
                layoutClassName={GRID}
                columns={['60%', '80%', '7ch', '70%', { width: '8ch', end: true }]}
              />
            }
            whenEmpty={<p className="border-t py-3 text-[13px] text-muted-foreground">No accounts.</p>}
          >
            {rows.map((user) => (
              <UserRow key={user.id} user={user} organizations={orgs} onChanged={replace} />
            ))}
            <div className="border-t" />
          </Loadable>

          {users.error ? (
            <FormAlert>{describeAuthError(users.error, 'Could not load accounts.')}</FormAlert>
          ) : null}
      </section>

      <NewAccountDrawer
        open={creating}
        onOpenChange={setCreating}
        organizations={orgs}
        onCreated={add}
      />
    </>
  );
}

function UserRow({
  user,
  organizations,
  onChanged,
}: {
  user: User;
  organizations: readonly Organization[];
  onChanged: (user: User) => void;
}) {
  const { identity } = useAuth();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const self = user.id === identity?.user.id;
  const admin = user.role === Role.ADMIN;

  const assign = async (organizationId: string) => {
    if (!organizationId || organizationId === user.organizationId) return;
    setSaving(true);
    setFailure(undefined);
    try {
      onChanged(await api.users.assignOrganization(user.id, organizationId));
    } catch (err) {
      setFailure(err instanceof ApiError ? (err.messages[0] ?? 'Not saved') : 'Not saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(GRID, 'items-baseline border-t py-2 text-[13px]')}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate">{user.name}</span>
        {self ? <span className="eyebrow shrink-0">you</span> : null}
      </span>

      <span className="datum truncate text-[12px] text-muted-foreground" title={user.email}>
        {user.email}
      </span>

      <span className={cn('status-line datum text-[12px]', admin && 'text-primary')}>
        <Glyph kind={user.role === Role.VIEWER ? 'hollow' : 'filled'} />
        {user.role.toLowerCase()}
      </span>

      <span className="min-w-0">
        {admin ? (
          <span className="text-[12px] text-muted-foreground">all organizations</span>
        ) : (
          <Select
            variant="inline"
            aria-label={`Organization for ${user.name}`}
            value={user.organizationId}
            onValueChange={(organizationId) => void assign(organizationId)}
            options={organizations.map((organization) => ({
              value: organization.id,
              label: organization.name,
            }))}
            placeholder="Unassigned"
            disabled={saving}
            invalid={Boolean(failure)}
            title={failure}
          />
        )}
      </span>

      <span className="datum text-right text-[12px] text-muted-foreground">
        {user.lastLoginAt ? clock(user.lastLoginAt) : 'never'}
      </span>
    </div>
  );
}

const ROLE_CHOICES: Choice<Role>[] = [
  { value: Role.OPERATOR, label: 'Operator', note: 'one organization · dispatches work' },
  { value: Role.VIEWER, label: 'Viewer', note: 'one organization · read only' },
  { value: Role.ADMIN, label: 'Admin', note: 'all organizations and accounts' },
];

const MIN_PASSWORD = 12;

interface Draft {
  name: string;
  email: string;
  password: string;
  role: Role;
  organizationId: string;
}

type DraftErrors = Partial<Record<keyof Draft, string>>;

/** Ties the footer's submit button to the form in the drawer body. */
const FORM_ID = 'new-account-form';

/**
 * The new-account form, in a drawer.
 *
 * The draft lives here, outside the drawer's contents, so an accidental
 * Escape or click outside closes the drawer without losing what was typed.
 * Cancel is the one way to throw it away; a successful create clears it.
 */
function NewAccountDrawer({
  open,
  onOpenChange,
  organizations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: readonly Organization[];
  onCreated: (user: User) => void;
}) {
  const { identity } = useAuth();
  const blank = (): Draft => ({
    name: '',
    email: '',
    password: '',
    role: Role.OPERATOR,
    organizationId: identity?.organization?.id ?? '',
  });

  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const needsOrganization = belongsToOrganization(draft.role);

  const discard = () => {
    setDraft(blank());
    setErrors({});
    setFailure(undefined);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(undefined);

    const problems = validate(draft);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy(true);
    try {
      const user = await api.users.create({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
        ...(needsOrganization ? { organizationId: draft.organizationId } : {}),
      });
      discard();
      onCreated(user);
    } catch (err) {
      setFailure(describeAuthError(err, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New account"
      footer={
        <>
          <DrawerClose className="btn-line" onClick={discard} disabled={busy}>
            Cancel
          </DrawerClose>
          <button type="submit" form={FORM_ID} className="btn-line border-primary text-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <TextField label="name" value={draft.name} onChange={set('name')} disabled={busy} error={errors.name} />
        <TextField
          label="email"
          type="email"
          value={draft.email}
          onChange={set('email')}
          autoComplete="off"
          disabled={busy}
          error={errors.email}
        />
        <PasswordField
          label="password"
          value={draft.password}
          onChange={set('password')}
          autoComplete="new-password"
          disabled={busy}
          error={errors.password}
          hint={`at least ${MIN_PASSWORD} characters`}
        />

        <ChoiceField
          label="role"
          choices={ROLE_CHOICES}
          value={draft.role}
          onChange={set('role')}
          disabled={busy}
        />

        {needsOrganization ? (
          <SelectField
            label="organization"
            value={draft.organizationId}
            onChange={set('organizationId')}
            placeholder="Choose an organization"
            options={organizations.map((organization) => ({
              value: organization.id,
              label: organization.name,
            }))}
            disabled={busy}
            error={errors.organizationId}
          />
        ) : null}

        {failure ? <FormAlert>{failure}</FormAlert> : null}
      </form>
    </Drawer>
  );
}

function validate(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.name.trim().length === 0) errors.name = 'Enter a name.';
  if (!looksLikeEmail(draft.email)) errors.email = 'Enter a valid email address.';
  if (draft.password.length < MIN_PASSWORD) {
    errors.password = `At least ${MIN_PASSWORD} characters.`;
  }
  if (belongsToOrganization(draft.role) && !draft.organizationId) {
    errors.organizationId = 'Choose an organization.';
  }
  return errors;
}
