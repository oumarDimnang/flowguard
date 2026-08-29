import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { appConfig, mongoConfig, nokiaConfig, temporalConfig } from './configuration';
import { validateEnv } from './env.schema';

/**
 * Global configuration. Imported once by AppModule; ConfigService is then
 * injectable everywhere without re-importing.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, mongoConfig, temporalConfig, nokiaConfig],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
