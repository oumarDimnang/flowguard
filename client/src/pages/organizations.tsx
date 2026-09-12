import { PlusIcon } from '@phosphor-icons/react/Plus';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-context';
import { describeAuthError } from '@/auth/describe-error';
import { ChoiceField, FormAlert, TextField, type Choice } from '@/auth/form-fields';
import { ORGANIZATIONS_CHANGED } from '@/components/layout/routes';
import { PageHeader } from '@/components/layout/page-header';
import {
  Drawer,
  DrawerClose,
  Eyebrow,
  Glyph,
  Loadable,
  SkeletonRows,
  Slot,
} from '@/components/primitives';
import { EMPTY, useResource } from '@/hooks/use-resource';
import { cn } from '@/lib/utils';
import { industryLabel, type Industry, type Organization, type User } from '@/types';

const GRID = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_4rem_5.5rem_4.5rem] gap-x-4';

/** Every organization. New ones are created in a drawer. Admin only. */
export function Organizations() {
  const organizations = useResource((signal) => api.organizations.list(signal), []);
  const users = useResource((signal) => api.users.list(signal), []);
  const rows = organizations.data ?? EMPTY;

  const members = useMemo(() => countMembers(users.data ?? EMPTY), [users.data]);

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Organization | undefined>(undefined);

  const add = (organization: Organization) => {
    organizations.setData((previous) =>
      [...(previous ?? []), organization].sort((a, b) => a.name.localeCompare(b.name)),
    );
    // The sidebar's switcher keeps its own list.
    window.dispatchEvent(new Event(ORGANIZATIONS_CHANGED));
    setCreated(organization);
    setCreating(false);
  };

  return (
    <>
      <PageHeader
        title="Organizations"
        meta={
          <>
            <Slot ch={2}>{rows.length}</Slot> organizations
          </>
        }
      />

      <section className="min-w-0">
        <div className="flex items-center justify-between gap-4 border-t pt-3 pb-2">
          <div className="flex min-w-0 items-baseline gap-4">
            <Eyebrow className="text-foreground">Organizations</Eyebrow>
            {created ? (
              <span className="truncate text-xs text-primary">Created {created.name}</span>
            ) : null}
          </div>

          <button
            type="button"
            className="btn-line inline-flex items-center gap-1.5"
            onClick={() => setCreating(true)}
          >
            <PlusIcon size={14} aria-hidden="true" />
            New organization
          </button>
        </div>

        <div className={cn(GRID, 'eyebrow border-t pt-2 pb-1.5')}>
          <span>name</span>
          <span>industry</span>
          <span className="text-right">accounts</span>
          <span className="text-right">created</span>
          <span />
        </div>

        <Loadable
          loading={organizations.loading && !organizations.data}
          empty={rows.length === 0}
          skeleton={
            <SkeletonRows
              rows={3}
              layoutClassName={GRID}
              columns={['60%', '70%', { width: '2ch', end: true }, { width: '8ch', end: true }, '4ch']}
            />
          }
          whenEmpty={<p className="border-t py-3 text-[13px] text-muted-foreground">None yet.</p>}
        >
          {rows.map((organization) => (
            <OrganizationRow
              key={organization.id}
              organization={organization}
              members={members.get(organization.id) ?? 0}
            />
          ))}
          <div className="border-t" />
        </Loadable>

        {organizations.error ? (
          <FormAlert>{describeAuthError(organizations.error, 'Could not load organizations.')}</FormAlert>
        ) : null}
      </section>

      <NewOrganizationDrawer open={creating} onOpenChange={setCreating} onCreated={add} />
    </>
  );
}

function OrganizationRow({ organization, members }: { organization: Organization; members: number }) {
  const { identity, openOrganization } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const current = identity?.organization?.id === organization.id;

  const open = async () => {
    setOpening(true);
    try {
      await openOrganization(organization.id);
      navigate('/');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={cn(GRID, 'items-baseline border-t py-2 text-[13px]')}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{organization.name}</span>
        <span className="datum truncate text-[11px] text-muted-foreground">{organization.slug}</span>
      </span>
      <span className="truncate">{industryLabel(organization.industry)}</span>
      <span className="datum text-right">{members}</span>
      <span className="datum text-right text-muted-foreground">
        {new Date(organization.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: '2-digit',
        })}
      </span>
      <span className="text-right">
        {current ? (
          <span className="status-line text-[11px] text-primary">
            <Glyph kind="filled" />
            open
          </span>
        ) : (
          <button
            type="button"
            className="btn-bare text-[12px] text-muted-foreground"
            disabled={opening}
            onClick={() => void open()}
          >
            {opening ? '…' : 'Open'}
          </button>
        )}
      </span>
    </div>
  );
}

/** Ties the footer's submit button to the form in the drawer body. */
const FORM_ID = 'new-organization-form';

/**
 * The new-organization form, in a drawer.
 *
 * The draft lives here rather than inside the drawer's contents, so Escape or
 * a click outside closes it without losing what was typed. Cancel discards;
 * a successful create clears it.
 */
function NewOrganizationDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (organization: Organization) => void;
}) {
  const industries = useResource((signal) => api.organizations.industries(signal), []);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<Industry | undefined>(undefined);
  const [errors, setErrors] = useState<{ name?: string; industry?: string }>({});
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const choices: Choice<Industry>[] = (industries.data?.industries ?? []).map((value) => ({
    value,
    label: industryLabel(value),
  }));

  const discard = () => {
    setName('');
    setIndustry(undefined);
    setErrors({});
    setFailure(undefined);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(undefined);

    const problems: typeof errors = {};
    if (name.trim().length === 0) problems.name = 'Enter a name.';
    if (!industry) problems.industry = 'Choose an industry.';
    setErrors(problems);
    if (Object.keys(problems).length > 0 || !industry) return;

    setBusy(true);
    try {
      const organization = await api.organizations.create({ name: name.trim(), industry });
      discard();
      onCreated(organization);
    } catch (err) {
      setFailure(describeAuthError(err, 'Could not create the organization.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New organization"
      size="sm"
      footer={
        <>
          <DrawerClose className="btn-line" onClick={discard} disabled={busy}>
            Cancel
          </DrawerClose>
          <button
            type="submit"
            form={FORM_ID}
            className="btn-line border-primary text-primary"
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <TextField label="name" value={name} onChange={setName} disabled={busy} error={errors.name} />

        <ChoiceField
          label="industry"
          choices={choices}
          value={industry}
          onChange={setIndustry}
          disabled={busy}
          loading={industries.loading && choices.length === 0}
          error={errors.industry}
        />

        {failure ? <FormAlert>{failure}</FormAlert> : null}
      </form>
    </Drawer>
  );
}

function countMembers(users: readonly User[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const user of users) {
    if (user.organizationId) counts.set(user.organizationId, (counts.get(user.organizationId) ?? 0) + 1);
  }
  return counts;
}
