/**
 * Test database helpers.
 *
 * Every test runs against a real PostgreSQL instance (PGlite, in-memory), so
 * constraints, triggers and SQL semantics behave exactly as they will in
 * production instead of being approximated by mocks.
 */

import { createDatabase, type Database } from '../../db/client';
import { migrate } from '../../db/migrate';

/** A fresh, fully migrated, empty database. */
export async function createTestDatabase(): Promise<Database> {
  const db = await createDatabase({ dataDir: ':memory:' });
  await migrate(db);
  return db;
}

/** Empty every table without dropping the schema (fast reset between tests). */
export async function truncateAll(db: Database): Promise<void> {
  await db.exec(`
    TRUNCATE TABLE
      domain_event, audit_log,
      cloud_agreement_archive_confirmation, cloud_agreement_event, cloud_agreement,
      weekly_checkin, pitch, pod_lead_vote, pod_lead_term, pod_cycle_plan,
      cycle_milestone_reminder, sprint_cycle, cycle_config, org_governance_config,
      pod_membership, pod, role_assignment, app_user, holding, org
    RESTART IDENTITY CASCADE;
  `);
}

/**
 * Assert that a database operation fails, and return the error so callers can
 * assert on the SQLSTATE code (23505 unique, 23503 FK, 23514 check, ...).
 */
export async function expectDbError(
  operation: () => Promise<unknown>,
  matcher: RegExp | string = '',
): Promise<{ code?: string; message: string }> {
  try {
    await operation();
  } catch (error) {
    const err = error as { code?: string; message: string };
    const haystack = `${err.code ?? ''} ${err.message}`;
    if (matcher) {
      const re = typeof matcher === 'string' ? new RegExp(matcher, 'i') : matcher;
      if (!re.test(haystack)) {
        throw new Error(
          `Expected database error matching ${String(matcher)} but got: ${err.code ?? '(no code)'} ${err.message}`,
        );
      }
    }
    return { code: err.code, message: err.message };
  }
  throw new Error('Expected the database operation to fail, but it succeeded');
}

export interface TestWorld {
  db: Database;
  world: import('../helpers/fixtures').FixtureWorld;
  today: string;
}

/** Deterministic UUID generator for tests that need stable ids. */
export function uuidFactory(prefix = 'test'): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1).toString().padStart(4, '0')}`;
}
