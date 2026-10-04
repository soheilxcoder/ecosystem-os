/**
 * Browser-edition migration runner.
 *
 * Identical semantics to `db/migrate.ts` — same files, same sha256 checksums,
 * same `schema_migrations` table — but the SQL travels as bundled raw strings
 * (no filesystem in the browser) and checksums come from WebCrypto.
 */
import type { Database, Queryable } from '../db/client';

import sql0001 from '../db/migrations/0001_init.sql?raw';
import sql0002 from '../db/migrations/0002_calendar_and_pods.sql?raw';
import sql0003 from '../db/migrations/0003_cloud_agreements.sql?raw';
import sql0004 from '../db/migrations/0004_peer_review_governance.sql?raw';
import sql0005 from '../db/migrations/0005_budget_market.sql?raw';
import sql0006 from '../db/migrations/0006_coaching.sql?raw';
import sql0007 from '../db/migrations/0007_notifications_archive.sql?raw';
import sql0008 from '../db/migrations/0008_hub.sql?raw';
import sql0009 from '../db/migrations/0009_corrections.sql?raw';

const RAW_MIGRATIONS: Array<{ file: string; sql: string }> = [
  { file: '0001_init.sql', sql: sql0001 },
  { file: '0002_calendar_and_pods.sql', sql: sql0002 },
  { file: '0003_cloud_agreements.sql', sql: sql0003 },
  { file: '0004_peer_review_governance.sql', sql: sql0004 },
  { file: '0005_budget_market.sql', sql: sql0005 },
  { file: '0006_coaching.sql', sql: sql0006 },
  { file: '0007_notifications_archive.sql', sql: sql0007 },
  { file: '0008_hub.sql', sql: sql0008 },
  { file: '0009_corrections.sql', sql: sql0009 },
];

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

async function sha256Hex16(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function readMigrations(): Promise<Migration[]> {
  return Promise.all(
    RAW_MIGRATIONS.map(async ({ file, sql }) => {
      const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
      if (!version || rest.length === 0) {
        throw new Error(`Migration file "${file}" must be named <version>_<name>.sql`);
      }
      return { version, name: rest.join('_'), sql, checksum: await sha256Hex16(sql) };
    }),
  );
}

async function ensureMigrationsTable(db: Queryable): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(db: Queryable): Promise<Map<string, string>> {
  const { rows } = await db.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

/** Apply all pending migrations. Returns the versions applied in this run. */
export async function migrate(db: Database | Queryable): Promise<string[]> {
  await ensureMigrationsTable(db);
  const applied = await appliedMigrations(db);
  const migrations = await readMigrations();
  const versions: string[] = [];

  for (const migration of migrations) {
    const existing = applied.get(migration.version);
    if (existing) {
      if (existing !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} (${migration.name}) has changed since it was applied ` +
            `(stored checksum ${existing}, current ${migration.checksum}). ` +
            'Never edit an applied migration — add a new one.',
        );
      }
      continue;
    }

    if (typeof (db as Database).transaction === 'function') {
      await (db as Database).transaction(async (tx) => {
        await tx.exec(migration.sql);
        await tx.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          migration.version,
          migration.name,
          migration.checksum,
        ]);
      });
    } else {
      await db.exec(migration.sql);
      await db.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
        migration.version,
        migration.name,
        migration.checksum,
      ]);
    }
    versions.push(migration.version);
  }

  return versions;
}
