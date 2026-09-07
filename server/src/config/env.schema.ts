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

  // Signs the session cookie. A short secret is a forgeable session, so the
  // floor is enforced here rather than trusted to whoever writes the .env —
  // and it fails at boot, not on the first login attempt during a demo.
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),
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

  // Write validated values back into process.env.
  //
  // The `registerAs` factories in configuration.ts read `process.env` directly,
  // which never sees the defaults declared above — Zod returns them, it does not
  // apply them. Without this, any variable omitted from .env resolves to
  // `undefined` in its namespace despite having a default here.
  //
  // That is how MONGODB_DB_NAME reached Mongoose as undefined, leaving the
  // driver to pick a database itself and write to `local`, which no user may
  // write to. Every failure was reported as an authorisation error rather than
  // a missing database name.
  for (const [key, value] of Object.entries(result.data)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }

  return result.data;
}
