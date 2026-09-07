import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import type { RequestHandler } from 'express';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import type { AppConfig } from './config/configuration';
import { SESSION_MIDDLEWARE } from './realtime/realtime.tokens';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Behind a TLS-terminating proxy Express must trust it, or it decides the
  // connection is plain HTTP and refuses to set a Secure cookie. The setting
  // lives on the Express instance, not on the Nest wrapper.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const config = app.get(ConfigService);
  const { port, corsOrigin, env } = config.getOrThrow<AppConfig>('app');

  // Sessions before anything that reads one. This is the *same* instance the
  // Socket.IO gateway injects — see SessionModule for why that matters.
  app.use(app.get<RequestHandler>(SESSION_MIDDLEWARE));

  // Cookies only travel cross-origin when the browser is told the exact
  // origin; `credentials: true` with a wildcard is rejected outright.
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown properties instead of trusting them — these payloads
      // come from facility systems and from Nokia.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Required for TemporalConnectionProvider.onApplicationShutdown to run (S6).
  // Without this the gRPC connection stays open and Ctrl-C hangs.
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`FlowGuard server listening on port ${port} [${env}]`);
  logger.log(`Dashboard origin allowed: ${corsOrigin}`);
}

void bootstrap();
