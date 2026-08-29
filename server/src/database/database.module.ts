import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import type { MongoConfig } from '../config/configuration';

/**
 * MongoDB Atlas connection.
 *
 * Mongo holds the decision log and the dashboard read models. It is NOT the
 * source of truth for operation state — that lives in Temporal's history.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mongo = config.getOrThrow<MongoConfig>('mongo');
        return {
          uri: mongo.uri,
          dbName: mongo.dbName,
          // Fail fast rather than buffering commands against a dead connection.
          serverSelectionTimeoutMS: 10_000,
          bufferCommands: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
