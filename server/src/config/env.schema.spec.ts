import { validateEnv } from './env.schema';

/**
 * Configuration defaults have to survive the trip into `process.env`.
 *
 * The `registerAs` factories in configuration.ts read `process.env` directly.
 * Zod *returns* defaults but does not *apply* them, so any variable omitted
 * from .env used to arrive as `undefined` in its namespace — which is how
 * `MONGODB_DB_NAME` reached Mongoose empty and the driver ended up writing to
 * MongoDB's internal `local` database.
 */
describe('validateEnv', () => {
  const REQUIRED = {
    MONGODB_URI: 'mongodb://localhost:27017',
    TEMPORAL_ADDRESS: 'localhost:7233',
    NOKIA_WEBHOOK_TOKEN: 'token',
    INTERNAL_API_TOKEN: 'token',
    SESSION_SECRET: 'a'.repeat(32),
  };

  const TOUCHED = [
    'MONGODB_DB_NAME',
    'TEMPORAL_NAMESPACE',
    'TEMPORAL_TASK_QUEUE',
    'PORT',
    'NODE_ENV',
    'CORS_ORIGIN',
  ];

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
    for (const key of TOUCHED) delete process.env[key];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('applies defaults to process.env so registerAs factories see them', () => {
    validateEnv(REQUIRED);

    // The specific one whose absence caused writes to land on `local`.
    expect(process.env.MONGODB_DB_NAME).toBe('flowguard');
    expect(process.env.TEMPORAL_NAMESPACE).toBe('default');
    expect(process.env.TEMPORAL_TASK_QUEUE).toBe('flowguard');
    expect(process.env.PORT).toBe('3000');
  });

  it('never overwrites a value the operator set explicitly', () => {
    process.env.MONGODB_DB_NAME = 'flowguard_staging';

    validateEnv({ ...REQUIRED, MONGODB_DB_NAME: 'flowguard_staging' });

    expect(process.env.MONGODB_DB_NAME).toBe('flowguard_staging');
  });

  it('fails loudly when a required value is missing', () => {
    expect(() => validateEnv({ MONGODB_URI: 'mongodb://localhost:27017' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('names every missing variable, not just the first', () => {
    try {
      validateEnv({});
      throw new Error('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('MONGODB_URI');
      expect(message).toContain('TEMPORAL_ADDRESS');
      expect(message).toContain('NOKIA_WEBHOOK_TOKEN');
      expect(message).toContain('INTERNAL_API_TOKEN');
    }
  });
});
