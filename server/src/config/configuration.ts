import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV as 'development' | 'test' | 'production',
  port: Number(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN as string,
  internalApiToken: process.env.INTERNAL_API_TOKEN as string,
}));

export const mongoConfig = registerAs('mongo', () => ({
  uri: process.env.MONGODB_URI as string,
  dbName: process.env.MONGODB_DB_NAME as string,
}));

export const temporalConfig = registerAs('temporal', () => ({
  address: process.env.TEMPORAL_ADDRESS as string,
  namespace: process.env.TEMPORAL_NAMESPACE as string,
  taskQueue: process.env.TEMPORAL_TASK_QUEUE as string,
  apiKey: process.env.TEMPORAL_API_KEY || undefined,
  tls: process.env.TEMPORAL_TLS === 'true',
}));

export const nokiaConfig = registerAs('nokia', () => ({
  webhookToken: process.env.NOKIA_WEBHOOK_TOKEN as string,
}));

export type AppConfig = ReturnType<typeof appConfig>;
export type MongoConfig = ReturnType<typeof mongoConfig>;
export type TemporalConfig = ReturnType<typeof temporalConfig>;
export type NokiaConfig = ReturnType<typeof nokiaConfig>;
