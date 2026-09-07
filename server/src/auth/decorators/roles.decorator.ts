import { SetMetadata } from '@nestjs/common';

import type { Role } from '../../common/domain/tenancy';

export const ROLES_KEY = 'flowguard:minimum-role';

/**
 * The minimum role a handler requires.
 *
 * Expressed as a floor rather than a list, so adding a role above OPERATOR
 * later does not mean revisiting every decorator.
 */
export const RequireRole = (role: Role) => SetMetadata(ROLES_KEY, role);
