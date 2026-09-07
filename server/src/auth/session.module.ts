import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestHandler } from 'express';

import type { AppConfig, MongoConfig } from '../config/configuration';
import { SESSION_MIDDLEWARE } from '../realtime/realtime.tokens';
import { createSessionMiddleware } from './session.config';

/**
 * Builds the session middleware exactly once and shares it.
 *
 * Global, because two consumers need the identical instance: Express, via
 * app.use() in main.ts, and the Socket.IO engine, via the realtime gateway. Two
 * separately-constructed middlewares would each hold their own store handle,
 * and a socket would then authenticate against session state the HTTP side
 * never wrote — which fails intermittently and looks like a network problem.
 */
@Global()
@Module({
  providers: [
    {
      provide: SESSION_MIDDLEWARE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RequestHandler => {
        const app = config.getOrThrow<AppConfig>('app');
        const mongo = config.getOrThrow<MongoConfig>('mongo');

        return createSessionMiddleware({
          secret: app.sessionSecret,
          mongoUri: mongo.uri,
          // Secure cookies require HTTPS; setting it on localhost would mean
          // the browser silently never sends the cookie back.
          secure: app.env === 'production',
        });
      },
    },
  ],
  exports: [SESSION_MIDDLEWARE],
})
export class SessionModule {}
