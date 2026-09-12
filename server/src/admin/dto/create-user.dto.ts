import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Role } from '../../common/domain/tenancy';

/**
 * A new account, created by an admin.
 *
 * Whether `organizationId` is required depends on the role, which a decorator
 * cannot express cleanly — AccountsService enforces it: operators and viewers
 * must name an organization, admins must not.
 */
export class CreateUserDto {
  @IsString()
  @Matches(/\S/, { message: 'Enter a name' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  /**
   * Twelve characters, higher than login's floor of 8 — which exists only so
   * the seeded demo accounts can sign in. Length is the only rule.
   */
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(200)
  password!: string;

  @IsEnum(Role, { message: 'Choose a role' })
  role!: Role;

  @IsOptional()
  @IsMongoId({ message: 'Choose an organization' })
  organizationId?: string;
}
