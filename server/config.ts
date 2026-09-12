/**
 * Central runtime configuration.
 *
 * Everything the API needs is parsed and validated once, here, so a missing
 * secret or a malformed port fails at startup with a precise message instead of
 * halfway through a request.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(16).optional(),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_ORIGIN: z.string().url().default('http://127.0.0.1:4000'),
  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().default('.data/pgdata'),
  AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
  ALLOW_DEV_LOGIN_IN_PRODUCTION: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .default('false')
    .transform((v) => v === true || v === 'true'),
  OIDC_ISSUER: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().default('http://localhost:3000/auth/oidc/callback'),
  OIDC_SCOPES: z.string().default('openid email profile'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(8),
  /** Pin "today" — lets a whole environment be run against a fixed cycle day. */
  TODAY: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'TODAY must be YYYY-MM-DD').optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

const DEV_SESSION_SECRET = 'development-only-insecure-secret-please-override';

let cached: Env | null = null;
let envFileLoaded = false;

/**
 * Load a local `.env` file if one exists (Node does not do this automatically).
 * Existing environment variables always win, so tests and deployment
 * environments are never overridden by a developer's local file.
 */
function loadEnvFileOnce(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  try {
    (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.('.env');
  } catch {
    // No .env file, or it is unreadable: rely on the real environment.
  }
}

/**
 * Load and validate configuration. Cached per process.
 * `overrides` is used by tests to inject values without touching process.env.
 */
export function loadEnv(overrides: Partial<Record<string, string | undefined>> = {}): Env {
  loadEnvFileOnce();
  if (cached && Object.keys(overrides).length === 0) return cached;

  const merged: Record<string, string | undefined> = { ...process.env, ...overrides };
  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  if (!env.SESSION_SECRET) {
    if (isProduction) {
      throw new Error('SESSION_SECRET must be set in production');
    }
    env.SESSION_SECRET = DEV_SESSION_SECRET;
  }

  if (isProduction && env.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be changed from the development default in production');
  }

  if (env.AUTH_MODE === 'oidc') {
    const missing = [
      ['OIDC_ISSUER', env.OIDC_ISSUER],
      ['OIDC_CLIENT_ID', env.OIDC_CLIENT_ID],
      ['OIDC_CLIENT_SECRET', env.OIDC_CLIENT_SECRET],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`AUTH_MODE=oidc requires ${missing.join(', ')} to be set`);
    }
  }

  if (Object.keys(overrides).length === 0) {
    cached = env;
  }
  return env;
}

/** Test hook: drop the cached configuration. */
export function resetEnvCache(): void {
  cached = null;
}
