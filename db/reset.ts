/**
 * Reset the local database: drop the data directory, re-apply migrations and
 * re-seed. Never touches a DATABASE_URL target (a real server is not ours to
 * drop) — it fails loudly instead.
 */

import { rm } from 'node:fs/promises';
import { loadEnv } from '../server/config';
import { spawnSync } from 'node:child_process';

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();

  if (env.DATABASE_URL) {
    console.error(
      '[reset] DATABASE_URL is set — refusing to drop a real PostgreSQL server. ' +
        'Unset DATABASE_URL to reset the local PGlite database.',
    );
    process.exit(1);
  }

  await rm(env.PGLITE_DATA_DIR, { recursive: true, force: true });
  console.log(`[reset] removed ${env.PGLITE_DATA_DIR}`);

  run('npx', ['tsx', 'db/migrate.ts']);
  run('npx', ['tsx', 'db/seed.ts']);
}

main().catch((error) => {
  console.error('[reset] failed:', error);
  process.exit(1);
});
