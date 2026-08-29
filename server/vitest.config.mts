import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS 12 publishes ESM-only packages ("type": "module"), which Jest's
 * CommonJS runtime cannot require. Vitest loads them natively — it is also what
 * the NestJS 12 starters ship.
 *
 * unplugin-swc is required rather than optional: Vitest's default esbuild
 * transform does not emit decorator metadata, and Nest's constructor injection
 * resolves dependencies from exactly that metadata. Without this plugin every
 * provider resolves to undefined.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
