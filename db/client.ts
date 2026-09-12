/**
 * Database client.
 *
 * The platform targets PostgreSQL (13-TECHNICAL-ARCHITECTURE.md §1). Two
 * drivers are supported behind one tiny interface so the exact same SQL and the
 * exact same constraints run everywhere:
 *
 *   - **PGlite** (default): real PostgreSQL 18 compiled to WASM, running
 *     in-process with a file-backed data directory. Zero install, and it is
 *     genuine Postgres — foreign keys, CHECK constraints, partial unique
 *     indexes, triggers and JSONB all behave identically to a server.
 *   - **node-postgres** (`pg`): used automatically when `DATABASE_URL` is set,
 *     which is how this connects to a real server in staging/production.
 *
 * Nothing outside `db/` may import a driver: all queries go through this module.
 */

import type { UUID } from '../core/types';

export interface QueryResult<T> {
  rows: T[];
  /** Rows affected by INSERT/UPDATE/DELETE (0 when the driver omits it). */
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /** Run `fn` inside a transaction; commits on success, rolls back on throw. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** Driver name, for logs and health checks. */
  readonly driver: 'pglite' | 'pg';
}

export interface DatabaseConfig {
  /** When set, connect to a real PostgreSQL server instead of PGlite. */
  url?: string | undefined;
  /** PGlite data directory (ignored for `pg`). Use ':memory:' for tests. */
  dataDir?: string;
}

/** Placeholder style is identical ($1, $2…) for both drivers. */
export type SqlParams = readonly unknown[];

export async function createDatabase(config: DatabaseConfig = {}): Promise<Database> {
  if (config.url) {
    return createPgDatabase(config.url);
  }
  return createPgliteDatabase(config.dataDir ?? '.data/pgdata');
}

async function createPgliteDatabase(dataDir: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');

  if (dataDir !== ':memory:') {
    // PGlite creates only the leaf directory, so the parent must exist first.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dataDir, { recursive: true });
  }

  const pg = dataDir === ':memory:' ? await PGlite.create() : await PGlite.create({ dataDir });

  const wrap = (target: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
    exec: (sql: string) => Promise<unknown>;
  }): Queryable => ({
    async query<T>(sql: string, params: SqlParams = []) {
      const result = await target.query(sql, params as unknown[]);
      return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
    },
    async exec(sql: string) {
      await target.exec(sql);
    },
  });

  const base = wrap(pg);

  return {
    driver: 'pglite',
    query: base.query,
    exec: base.exec,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return pg.transaction(async (tx) => fn(wrap(tx))) as Promise<T>;
    },
    async close() {
      await pg.close();
    },
  };
}

async function createPgDatabase(url: string): Promise<Database> {
  const pg = await import('pg');
  const Pool = pg.Pool ?? pg.default?.Pool;
  if (!Pool) {
    throw new Error('Failed to load the pg driver: Pool export missing');
  }
  const pool = new Pool({ connectionString: url, max: 10 });

  return {
    driver: 'pg',
    async query<T>(sql: string, params: SqlParams = []) {
      const result = await pool.query(sql, params as unknown[]);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          async query<R>(sql: string, params: SqlParams = []) {
            const res = await client.query(sql, params as unknown[]);
            return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

// --- small query helpers -------------------------------------------------

export async function queryOne<T>(
  db: Queryable,
  sql: string,
  params: SqlParams = [],
): Promise<T | null> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function queryMany<T>(
  db: Queryable,
  sql: string,
  params: SqlParams = [],
): Promise<T[]> {
  const { rows } = await db.query<T>(sql, params);
  return rows;
}

/** Insert a row and return it (uses RETURNING *, which both drivers support). */
export async function insertOne<T>(
  db: Queryable,
  sql: string,
  params: SqlParams = [],
): Promise<T> {
  const row = await queryOne<T>(db, sql, params);
  if (!row) {
    throw new Error('INSERT ... RETURNING returned no row');
  }
  return row;
}

export function newId(): UUID {
  return crypto.randomUUID();
}
