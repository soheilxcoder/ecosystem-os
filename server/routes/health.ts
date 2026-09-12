/** Liveness / readiness — used by the dev script, tests and uptime checks. */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { isUpToDate } from '../../db/migrate';

export function registerHealthRoutes(app: FastifyInstance, deps: { db: Database }): void {
  app.get('/api/health', async () => {
    return {
      data: {
        status: 'ok',
        driver: deps.db.driver,
        time: new Date().toISOString(),
      },
    };
  });

  app.get('/api/health/ready', async (_request, reply) => {
    const upToDate = await isUpToDate(deps.db);
    const { rows } = await deps.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM schema_migrations",
    );
    return reply.code(upToDate ? 200 : 503).send({
      data: {
        status: upToDate ? 'ready' : 'pending-migrations',
        migrationsApplied: Number(rows[0]?.count ?? 0),
        driver: deps.db.driver,
      },
    });
  });
}
