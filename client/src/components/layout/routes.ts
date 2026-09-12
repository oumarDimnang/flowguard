import { Role } from '@/types';

export interface NavRoute {
  to: string;
  label: string;
  end: boolean;
  /** Hidden below this role. The server guard is the real enforcement. */
  minimumRole?: Role;
}

export interface NavGroup {
  /** Small-caps heading above the group. Omitted for a single-item group. */
  label?: string;
  routes: NavRoute[];
}

/**
 * The sidebar, grouped.
 *
 * Kept out of the component so that file exports only components — Fast Refresh
 * bails on any module mixing the two, which costs hot reload on the component
 * being edited.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Operations',
    routes: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/control-room', label: 'Control Room', end: false },
      { to: '/operations', label: 'History', end: false },
    ],
  },
  {
    label: 'Evidence',
    routes: [
      { to: '/policy', label: 'Policy', end: false },
      { to: '/thesis', label: 'Thesis', end: false },
    ],
  },
  {
    routes: [
      // Operator-gated in the controller too; hiding it is tidiness, not the
      // enforcement.
      { to: '/scenarios', label: 'Scenarios', end: false },
    ],
  },
  {
    label: 'Admin',
    routes: [
      {
        to: '/admin/organizations',
        label: 'Organizations',
        end: false,
        minimumRole: Role.ADMIN,
      },
      { to: '/admin/users', label: 'Users', end: false, minimumRole: Role.ADMIN },
    ],
  },
];

/** Fired after an organization is created, so lists elsewhere on screen can refetch. */
export const ORGANIZATIONS_CHANGED = 'flowguard:organizations-changed';
