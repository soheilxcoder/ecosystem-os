/**
 * Shared constants.
 *
 * `DEV_SESSION_SECRET` is the single fallback used by both the API and the web
 * app when `SESSION_SECRET` is not set. It exists so a fresh clone runs without
 * any setup; both processes refuse to use it when NODE_ENV=production, so it can
 * never become a production secret by accident.
 */

export const DEV_SESSION_SECRET = 'development-only-insecure-secret-please-override';

/** Resolve the session secret, refusing the dev fallback in production. */
export function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (at least 16 characters) in production');
  }
  return DEV_SESSION_SECRET;
}
