import { api } from '@/api/endpoints';
import { useAuth } from '@/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Eyebrow, Glyph, Loadable, SkeletonRows, Slot } from '@/components/primitives';
import { useResource } from '@/hooks/use-resource';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Role, type User } from '@/types';

const USERS_GRID = 'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_7rem_8rem] gap-x-4';

/** What each role can actually do, ordered by privilege. */
const ROLE_POWERS: readonly { role: Role; can: string }[] = [
  { role: Role.VIEWER, can: 'Reads everything this organization has decided. Changes nothing.' },
  {
    role: Role.OPERATOR,
    can: 'Dispatches work and runs scenarios — both start workflows that can allocate paid capacity.',
  },
  { role: Role.ADMIN, can: 'Everything an operator can do, and manages the people on this page.' },
];

/**
 * Who is in this organization.
 *
 * The page exists as much to state the isolation property as to list people:
 * a user belongs to exactly one organization and sees only its operations, and
 * that is enforced in the data layer rather than by hiding rows here.
 */
export function Users() {
  const { identity } = useAuth();
  const users = useResource((signal) => api.users.list(signal), []);
  const rows = users.data ?? [];

  return (
    <>
      <PageHeader
        trail={[{ label: 'FlowGuard', to: '/' }, { label: 'Users' }]}
        title="Users"
        description="Everyone with access to this organization's operations."
        meta={
          <>
            {identity?.organization.name} · <Slot ch={2}>{rows.length}</Slot> people
          </>
        }
      />

      <section className="border-t">
        <div className={cn(USERS_GRID, 'eyebrow pt-3 pb-2')}>
          <span>name</span>
          <span>email</span>
          <span>role</span>
          <span className="text-right">last signed in</span>
        </div>

        <Loadable
          loading={users.loading}
          empty={rows.length === 0}
          skeleton={
            <SkeletonRows
              rows={3}
              layoutClassName={USERS_GRID}
              columns={['60%', '80%', '7ch', { width: '8ch', end: true }]}
            />
          }
        >
          {rows.map((user) => (
            <UserRow key={user.id} user={user} self={user.id === identity?.user.id} />
          ))}
          <div className="border-t" />
        </Loadable>
      </section>

      <p className="log-row pt-3">
        <Eyebrow className="pt-0.5">not yet</Eyebrow>
        <span className="text-xs text-muted-foreground">
          Invites and role changes are deliberately absent rather than disabled. Both alter what
          somebody can do to a live facility, and neither should ship before the change itself
          is audited. Sign-up creates a new organization with its first admin; nobody can join
          this one from the outside until invites exist.
        </span>
      </p>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-[15px] font-medium">Roles</h2>
        <dl className="flex flex-col">
          {ROLE_POWERS.map(({ role, can }) => (
            <div
              key={role}
              className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 border-t py-2"
            >
              <dt className="datum text-[13px]">{role.toLowerCase()}</dt>
              <dd className="m-0 max-w-[70ch] text-[13px] text-muted-foreground">{can}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="log-row border-t pt-4">
        <Eyebrow className="pt-0.5">isolation</Eyebrow>
        <p className="max-w-[70ch] text-[13px] text-muted-foreground">
          A user belongs to exactly one organization and can only ever see its operations. The
          organization id is threaded through the repository signatures rather than filtered in
          the services, so a forgotten clause is a compile error rather than a silent
          cross-tenant read. Sockets join a room per organization and workflow ids are
          organization-prefixed. Nothing on this page is doing the enforcing.
        </p>
      </section>
    </>
  );
}

function UserRow({ user, self }: { user: User; self: boolean }) {
  const elevated = user.role === Role.ADMIN || user.role === Role.OPERATOR;

  return (
    <div className={cn(USERS_GRID, 'datum items-baseline border-t py-2.5 text-[13px]')}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate">{user.name}</span>
        {self ? <span className="eyebrow shrink-0">you</span> : null}
      </span>

      <span className="truncate text-muted-foreground" title={user.email}>
        {user.email}
      </span>

      <span className={cn('status-line', elevated && 'text-primary')}>
        <Glyph kind={elevated ? 'filled' : 'hollow'} />
        {user.role.toLowerCase()}
      </span>

      <span className="text-right text-muted-foreground">
        {user.lastLoginAt ? clock(user.lastLoginAt) : 'never'}
      </span>
    </div>
  );
}
