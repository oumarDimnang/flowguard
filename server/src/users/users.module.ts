import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MongoUserRepository } from './adapters/mongo-user.repository';
import { UserRepository } from './ports/user.repository';
import { UserEntity, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService, { provide: UserRepository, useClass: MongoUserRepository }],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
