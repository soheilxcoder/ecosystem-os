/**
 * The live-edition engine: the entire platform boots inside the browser.
 *
 *   PGlite (real PostgreSQL 18 compiled to WASM, persisted in IndexedDB)
 *     → bundled SQL migrations
 *     → the same seed as `npm run db:seed`
 *     → the real Fastify app (every module's routes, auth, permissions)
 *     → UI requests go through `app.inject()` — no network round-trip.
 */
import { PGlite } from '@electric-sql/pglite';
import type { FastifyInstance } from 'fastify';

import type { Database, Queryable } from '../db/client';
import { migrate } from './migrate';
import { seedAll } from '../db/seed';
import { buildServer } from '../server/index';

export const DB_NAME = 'idb://ecosystem-os';

export type BootStage =
  | 'database'
  | 'migrations'
  | 'seed'
  | 'api'
  | 'ready';

export interface Engine {
  db: Database;
  app: FastifyInstance;
  /** Perform an in-memory HTTP request against the real API. */
  request(options: {
    method: string;
    url: string;
    body?: unknown;
    token?: string | null;
  }): Promise<{ status: number; json: () => unknown; headers: Record<string, string | string[] | undefined> }>;
  close(): Promise<void>;
}

function wrapPglite(pg: PGlite): Database {
  type Tx = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
    exec: (sql: string) => Promise<unknown>;
  };
  const wrap = (target: Tx): Queryable => ({
    async query<T>(sql: string, params: readonly unknown[] = []) {
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
      return pg.transaction(async (tx: Tx) => fn(wrap(tx))) as Promise<T>;
    },
    async close() {
      await pg.close();
    },
  };
}

export async function bootEngine(onStage?: (stage: BootStage) => void): Promise<Engine> {
  onStage?.('database');
  const pg = new PGlite(DB_NAME);
  const db = wrapPglite(pg);

  onStage?.('migrations');
  await migrate(db);

  // Seed once: the demo organisation marks a seeded database. Re-seeding on
  // every boot would wipe the visitor's changes, so only an empty DB is
  // seeded. The login screen offers a full reset.
  onStage?.('seed');
  const existing = await db.query('SELECT id FROM org WHERE slug = $1', ['company-x']);
  if (existing.rows.length === 0) {
    await seedAll(db);
  }

  onStage?.('api');
  const app = await buildServer({ db, runMigrations: false, logger: false });
  await app.ready();

  onStage?.('ready');
  return {
    db,
    app,
    async request({ method, url, body, token }) {
      const response = await app.inject({
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url,
        payload: body === undefined ? undefined : (body as object),
        cookies: token ? { eco_token: token } : {},
      });
      return {
        status: response.statusCode,
        json: () => response.json(),
        headers: response.headers as Record<string, string | string[] | undefined>,
      };
    },
    async close() {
      await app.close();
      await db.close();
    },
  };
}

/** Wipe the embedded database and reload — the platform re-seeds from scratch. */
export async function resetDatabase(): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    for (const database of databases) {
      if (database.name) indexedDB.deleteDatabase(database.name);
    }
  } catch {
    // Older browsers lack indexedDB.databases(); fall back to known names.
    indexedDB.deleteDatabase('/pglite/ecosystem-os');
    indexedDB.deleteDatabase('ecosystem-os');
  }
  // LocalStorage session too.
  try {
    window.localStorage.removeItem('ecosystem-live-token');
  } catch {
    /* ignore */
  }
  window.location.reload();
}
