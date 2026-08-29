import { z } from 'zod';

/**
 * Single source of truth for every environment variable the server reads.
 *
 * Validated once at boot (S4). A missing or malformed value kills the process
 * immediately with a readable message rather than throwing on the first request
 * — which, during a live demo, is the difference between a five-second fix and
 * a dead presentation.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1).default('flowguard'),

  TEMPORAL_ADDRESS: z.string().min(1, 'TEMPORAL_ADDRESS is required (e.g. localhost:7233)'),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('flowguard'),
  TEMPORAL_API_KEY: z.string().optional(),
  TEMPORAL_TLS: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => v === true || v === 'true'),

  NOKIA_WEBHOOK_TOKEN: z.string().min(1, 'NOKIA_WEBHOOK_TOKEN is required'),
  INTERNAL_API_TOKEN: z.string().min(1, 'INTERNAL_API_TOKEN is required'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }). Formats Zod issues into a
 * single readable block instead of a stack trace.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\n`);
  }

  return result.data;
}
