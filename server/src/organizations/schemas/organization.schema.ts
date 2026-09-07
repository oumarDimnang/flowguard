import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { Industry } from '../../common/domain/tenancy';

export type OrganizationDocument = HydratedDocument<OrganizationEntity>;

@Schema({ collection: 'organizations', timestamps: { createdAt: true, updatedAt: false } })
export class OrganizationEntity {
  @Prop({ required: true, unique: true, index: true })
  slug!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: Object.values(Industry) })
  industry!: Industry;
}

export const OrganizationSchema = SchemaFactory.createForClass(OrganizationEntity);
