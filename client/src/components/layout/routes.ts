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
 *
 * Grouping is what earns the sidebar its width: five flat routes did not need
 * 240px, but three sections plus an admin area do.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Operations',
    routes: [
      { to: '/', label: 'Control Room', end: true },
      { to: '/operations', label: 'History', end: false },
      { to: '/network', label: 'Network', end: false },
    ],
  },
  {
    label: 'Evidence',
    routes: [
      { to: '/analysis', label: 'Analysis', end: false },
      { to: '/policy', label: 'Policy', end: false },
      { to: '/thesis', label: 'Thesis', end: false },
    ],
  },
  {
    routes: [
      { to: '/impact', label: 'Impact', end: false },
      // Operator-gated in the controller too; hiding it is tidiness, not the
      // enforcement.
      { to: '/scenarios', label: 'Scenarios', end: false },
    ],
  },
  {
    label: 'Admin',
    routes: [{ to: '/admin/users', label: 'Users', end: false, minimumRole: Role.ADMIN }],
  },
];
