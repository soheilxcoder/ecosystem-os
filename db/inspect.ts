/** Quick database inspector: `npm run db:studio`. */

import { createDatabase } from './client';
import { loadEnv } from '../server/config';

const TABLES = [
  'org',
  'holding',
  'app_user',
  'role_assignment',
  'pod',
  'pod_membership',
  'audit_log',
  'domain_event',
  'schema_migrations',
];

async function main(): Promise<void> {
  const env = loadEnv();
  const db = await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR });
  try {
    console.log(`\nEcosystem OS database (driver: ${db.driver})\n`);
    for (const table of TABLES) {
      const { rows } = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${table}`,
      );
      console.log(`  ${table.padEnd(20)} ${rows[0]?.count ?? '?'}`);
    }

    console.log('\nUsers:');
    const users = await db.query<{
      email: string;
      full_name: string;
      roles: string | null;
    }>(
      `SELECT u.email, u.full_name,
              (SELECT string_agg(DISTINCT r.role_type, ', ')
                 FROM role_assignment r
                WHERE r.user_id = u.id AND r.revoked_at IS NULL) AS roles
         FROM app_user u ORDER BY u.full_name`,
    );
    for (const row of users.rows) {
      console.log(`  ${row.email.padEnd(22)} ${row.full_name.padEnd(16)} ${row.roles ?? '—'}`);
    }

    console.log('\nPods:');
    const pods = await db.query<{ name: string; status: string; holding: string; members: string }>(
      `SELECT p.name, p.status, h.name AS holding,
              (SELECT count(*) FROM pod_membership m
                WHERE m.pod_id = p.id AND m.left_at IS NULL)::text AS members
         FROM pod p JOIN holding h ON h.id = p.holding_id
        ORDER BY h.name, p.name`,
    );
    for (const row of pods.rows) {
      console.log(`  ${row.holding.padEnd(14)} ${row.name.padEnd(14)} ${row.status.padEnd(14)} ${row.members} members`);
    }
    console.log('');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[inspect] failed:', error);
  process.exit(1);
});
