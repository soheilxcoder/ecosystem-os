/**
 * Browser stub for the `pg` (node-postgres) driver. The browser edition only
 * ever uses PGlite; reaching this stub means DATABASE_URL was set, which is a
 * server-only configuration.
 */
export class Pool {
  constructor(_config?: unknown) {
    throw new Error(
      'The browser edition runs on embedded PGlite only; DATABASE_URL (a real PostgreSQL server) is not available here.',
    );
  }
}
export default { Pool };
