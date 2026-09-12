import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

import { Industry } from '../../common/domain/tenancy';

/** A new organization. The short name (slug) is derived from the name server-side. */
export class CreateOrganizationDto {
  @IsString()
  @Matches(/\S/, { message: 'Enter an organization name' })
  @MaxLength(120)
  name!: string;

  @IsEnum(Industry, { message: 'Choose an industry' })
  industry!: Industry;
}
