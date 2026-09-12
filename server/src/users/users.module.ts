import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoUserRepository } from './adapters/mongo-user.repository';
import { UserRepository } from './ports/user.repository';
import { UserEntity, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';

/** Accounts: storage and lookups. The HTTP surface for managing them is AdminModule. */
@Module({
  imports: [MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }])],
  providers: [UsersService, { provide: UserRepository, useClass: MongoUserRepository }],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
