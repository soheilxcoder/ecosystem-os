/**
 * Migration runner.
 *
 *   npm run db:migrate        apply pending migrations
 *   npm run db:migrate -- --verbose
 *
 * Migrations are plain numbered SQL files in `db/migrations`. Each applied
 * version is recorded in `schema_migrations` together with a checksum, so a
 * migration that is edited after being applied is detected instead of silently
 * diverging from what other environments ran.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Database, type Queryable } from './client';
import { loadEnv } from '../server/config';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export async function readMigrations(dir: string = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(join(dir, file), 'utf8');
      const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
      if (!version || rest.length === 0) {
        throw new Error(`Migration file "${file}" must be named <version>_<name>.sql`);
      }
      return {
        version,
        name: rest.join('_'),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
      };
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
export async function migrate(db: Database | Queryable, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await ensureMigrationsTable(db);
  const applied = await appliedMigrations(db);
  const migrations = await readMigrations(dir);
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

    if (db && typeof (db as Database).transaction === 'function') {
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

/** True when every migration on disk has been applied and is unmodified. */
export async function isUpToDate(db: Queryable, dir: string = MIGRATIONS_DIR): Promise<boolean> {
  await ensureMigrationsTable(db);
  const applied = await appliedMigrations(db);
  const migrations = await readMigrations(dir);
  return migrations.every((m) => applied.get(m.version) === m.checksum);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR });
  try {
    const applied = await migrate(db);
    if (applied.length === 0) {
      console.log(`[db] already up to date (driver: ${db.driver})`);
    } else {
      console.log(`[db] applied ${applied.length} migration(s): ${applied.join(', ')} (driver: ${db.driver})`);
    }
  } finally {
    await db.close();
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');

if (invokedDirectly) {
  main().catch((error) => {
    console.error('[db] migration failed:', error);
    process.exit(1);
  });
}
