import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Tests run against real PostgreSQL (PGlite, in-memory) so schema constraints,
 * triggers and SQL semantics are exercised for real rather than mocked.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // PGlite boots a Postgres instance per worker; keep the worker count modest
    // so memory stays within sandbox limits.
    pool: 'forks',
    maxWorkers: 4,
    minWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['core/**/*.ts', 'db/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.d.ts', 'db/migrations/**'],
    },
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      '@db': fileURLToPath(new URL('./db', import.meta.url)),
      '@server': fileURLToPath(new URL('./server', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
});
