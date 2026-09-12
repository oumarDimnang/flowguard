import { IsMongoId } from 'class-validator';

/** An admin choosing which organization this session operates in. */
export class OpenOrganizationDto {
  @IsMongoId({ message: 'Choose an organization' })
  organizationId!: string;
}
