/**
 * CLI runner: `npm run db:seed`. Kept separate from `seed.ts` so the seeding
 * logic stays importable as a plain library (the browser edition imports it).
 */
import { createDatabase } from './client';
import { migrate } from './migrate';
import { seedAll } from './seed';
import { loadEnv } from '../server/config';

const env = loadEnv();

async function main(): Promise<void> {
  const db = await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR });
  try {
    await migrate(db);
    await seedAll(db);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
