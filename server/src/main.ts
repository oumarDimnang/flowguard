import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(ConfigService);
  const { port, corsOrigin, env } = config.getOrThrow<AppConfig>('app');

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

  app.enableCors({ origin: corsOrigin, credentials: true });

  // Required for TemporalConnectionProvider.onApplicationShutdown to run (S6).
  // Without this the gRPC connection stays open and Ctrl-C hangs.
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`FlowGuard server listening on port ${port} [${env}]`);
  logger.log(`Dashboard origin allowed: ${corsOrigin}`);
}

void bootstrap();
