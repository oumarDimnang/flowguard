import { IsMongoId } from 'class-validator';

export class AssignOrganizationDto {
  @IsMongoId({ message: 'Choose an organization' })
  organizationId!: string;
}
