import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { Industry } from '../../common/domain/tenancy';

/**
 * Sign up.
 *
 * Registration creates a new organization with the registrant as its first
 * ADMIN. It never joins an existing one: with no invitation mechanism, the
 * only thing that could place a stranger inside a tenant would be a sign-up
 * form, so the form is not allowed to name one.
 */
export class RegisterDto {
  @IsString()
  @Matches(/\S/, { message: 'Enter your name' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  /**
   * A higher floor than login's 8, which exists only so the seeded demo
   * accounts can still sign in. Length is the only rule: composition rules
   * push people toward predictable substitutions, and the real defence is
   * argon2 plus a session that can be revoked.
   */
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(200)
  password!: string;

  @IsString()
  @Matches(/\S/, { message: 'Enter an organization name' })
  @MaxLength(120)
  organizationName!: string;

  @IsEnum(Industry, { message: 'Choose an industry' })
  industry!: Industry;
}
