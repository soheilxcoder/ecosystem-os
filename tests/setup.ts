/** Global test setup: deterministic, hermetic environment for every worker. */

// Node types NODE_ENV as read-only, so assign through a plain record.
const env = process.env as Record<string, string | undefined>;

env.NODE_ENV = 'test';
env.SESSION_SECRET = 'test-secret-that-is-long-enough-1234';
env.AUTH_MODE = 'dev';
// Tests use in-memory PGlite; nothing is written to .data.
env.PGLITE_DATA_DIR = ':memory:';
env.TZ = 'UTC';
