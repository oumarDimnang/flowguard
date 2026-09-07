import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoOrganizationRepository } from './adapters/mongo-organization.repository';
import { OrganizationsService } from './organizations.service';
import { OrganizationRepository } from './ports/organization.repository';
import { OrganizationEntity, OrganizationSchema } from './schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OrganizationEntity.name, schema: OrganizationSchema }]),
  ],
  providers: [
    OrganizationsService,
    { provide: OrganizationRepository, useClass: MongoOrganizationRepository },
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
