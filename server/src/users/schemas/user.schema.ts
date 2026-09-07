import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { Role } from '../../common/domain/tenancy';

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({ collection: 'users', timestamps: { createdAt: true, updatedAt: false } })
export class UserEntity {
  @Prop({ required: true, index: true })
  organizationId!: string;

  /**
   * Unique globally, not per organization.
   *
   * Login takes an email and nothing else — there is no organization field on
   * the form — so the address has to identify exactly one account.
   */
  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  name!: string;

  /**
   * argon2id. Excluded from queries by default so it cannot reach a response
   * through a forgotten projection — the auth service asks for it explicitly.
   */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, enum: Object.values(Role) })
  role!: Role;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
