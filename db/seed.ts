/**
 * Seed the platform with a realistic demo organisation.
 *
 * Deliberately covers every persona in 01-INFORMATION-ARCHITECTURE.md §3 —
 * including a user with no active role, so the "no pod / no role" empty states
 * can be exercised — and every role type in the permission matrix.
 *
 * Dates are generated relative to today so the demo always shows a live cycle:
 * pod lead terms are 90 days and mid-flight, coach assignments sit inside their
 * 2–3 cycle rotation window.
 *
 *   npm run db:seed
 */

import { createDatabase } from './client';
import { migrate } from './migrate';
import { createHolding, createOrg, createUser } from './repositories/users';
import { addPodMember, createPod } from './repositories/pods';
import { assignRole } from './repositories/roles';
import { loadEnv } from '../server/config';
import { addDays, todayISO } from '../core/time';
import type { RoleType, ScopeType, UUID } from '../core/types';

const env = loadEnv();
const TODAY = todayISO();

/** Pod lead term length: 90 days, rotated by member vote (15-BUSINESS-RULES-APPENDIX.md). */
const TERM_DAYS = 90;

async function main(): Promise<void> {
  const db = await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR });
  try {
    await migrate(db);

    const existing = await db.query('SELECT id FROM org WHERE slug = $1', ['company-x']);
    if (existing.rows.length > 0) {
      // Deterministic re-seed: removing the org cascades to everything under it.
      await db.query('DELETE FROM org WHERE slug = $1', ['company-x']);
      console.log('[seed] removed the previous demo organisation');
    }

    const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
    const pars = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });
    const dena = await createHolding(db, { orgId: org.id, name: 'Holding Dena', code: 'DNA' });

    // Sprint cadence: this cycle started 40 days ago, so the demo sits inside
    // the Days 4–80 execution window.
    const cycleStart = addDays(TODAY, -40);
    const termEnd = addDays(cycleStart, TERM_DAYS - 1);
    const coachEnd = addDays(TODAY, 120);
    const trialEnd = addDays(TODAY, 55);

    const atlas = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Atlas',
      categoryTag: 'Sales',
      status: 'active',
    });
    const basalt = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Basalt',
      categoryTag: 'Production',
      status: 'active',
    });
    const cinder = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Cinder',
      categoryTag: 'R&D',
      status: 'trial',
      trialEndDate: trialEnd,
    });
    const dune = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Dune',
      categoryTag: 'Operations',
      status: 'active',
    });
    const ember = await createPod(db, {
      holdingId: dena.id,
      name: 'Pod Ember',
      categoryTag: 'Growth',
      status: 'active',
    });

    const user = async (fullName: string, email: string) =>
      (await createUser(db, { orgId: org.id, email, fullName })).id;

    const lena = await user('Lena Lead', 'lena@example.org');
    const mo = await user('Mo Member', 'mo@example.org');
    const nadia = await user('Nadia Nine', 'nadia@example.org');
    const omar = await user('Omar Ops', 'omar@example.org');
    const petra = await user('Petra Prod', 'petra@example.org');
    const quinn = await user('Quinn QC', 'quinn@example.org');
    const rana = await user('Rana Research', 'rana@example.org');
    const sam = await user('Sam Solver', 'sam@example.org');
    const cora = await user('Cora Coach', 'cora@example.org');
    const ari = await user('Ari Architect', 'ari@example.org');
    const dan = await user('Dan Deploy', 'dan@example.org');
    const cass = await user('Cass Coaching', 'cass@example.org');
    const sana = await user('Sana Strategic', 'sana@example.org');
    const ilyas = await user('Ilyas Investor', 'ilyas@example.org');
    const hana = await user('Hana Holding', 'hana@example.org');
    const noor = await user('Noor Newcomer', 'noor@example.org');

    const memberships: Array<[UUID, UUID]> = [
      [atlas.id, lena],
      [atlas.id, mo],
      [atlas.id, nadia],
      [basalt.id, omar],
      [basalt.id, petra],
      [basalt.id, quinn],
      [cinder.id, rana],
      [dune.id, sam],
      [ember.id, hana],
    ];
    for (const [podId, userId] of memberships) {
      await addPodMember(db, { podId, userId, joinedAt: addDays(TODAY, -200) });
    }

    const role = (
      userId: UUID,
      roleType: RoleType,
      scopeType: ScopeType,
      scopeId: UUID | null,
      startDate = cycleStart,
      endDate: string | null = null,
    ) => assignRole(db, { userId, roleType, scopeType, scopeId, startDate, endDate });

    // Pod members (open-ended: membership has no rotation).
    for (const userId of [lena, mo, nadia]) await role(userId, 'pod_member', 'pod', atlas.id);
    for (const userId of [omar, petra, quinn]) await role(userId, 'pod_member', 'pod', basalt.id);
    await role(rana, 'pod_member', 'pod', cinder.id);
    await role(sam, 'pod_member', 'pod', dune.id);
    await role(hana, 'pod_member', 'pod', ember.id);

    // Rotating pod leads — 90-day terms, expiring mid-demo for one pod to show
    // the "ending soon" badge state.
    await role(lena, 'pod_lead', 'pod', atlas.id, cycleStart, termEnd);
    await role(omar, 'pod_lead', 'pod', basalt.id, cycleStart, addDays(TODAY, 9));
    await role(rana, 'pod_lead', 'pod', cinder.id, cycleStart, termEnd);

    // Rotating coach across three pods (1 coach per 3–5 pods).
    await role(cora, 'coach', 'pod', atlas.id, addDays(TODAY, -30), coachEnd);
    await role(cora, 'coach', 'pod', basalt.id, addDays(TODAY, -30), coachEnd);
    await role(cora, 'coach', 'pod', cinder.id, addDays(TODAY, -30), coachEnd);

    // Company X hub roles (org-scoped, open-ended).
    await role(ari, 'hub_architecture', 'org', null, addDays(TODAY, -400));
    await role(dan, 'hub_deployment', 'org', null, addDays(TODAY, -400));
    await role(cass, 'hub_coaching', 'org', null, addDays(TODAY, -400));
    await role(sana, 'hub_strategic', 'org', null, addDays(TODAY, -400));

    // External / oversight roles.
    await role(ilyas, 'investor', 'holding', pars.id, addDays(TODAY, -300));
    await role(hana, 'holding_executive', 'holding', pars.id, addDays(TODAY, -300));

    // Noor has no role assignments: the platform must render a truthful
    // "no active role" empty state rather than letting her act anywhere.

    console.log(`[seed] organisation "${org.name}" ready (driver: ${db.driver})`);
    console.log(`[seed]   holdings: ${pars.name}, ${dena.name}`);
    console.log(
      `[seed]   pods: ${[atlas, basalt, cinder, dune, ember].map((p) => p.name).join(', ')}`,
    );
    console.log('[seed]   16 users, including one with no active role (noor@example.org)');
    console.log(`[seed]   cycle started ${cycleStart}; pod lead terms end ${termEnd}`);
    console.log('[seed] sign in with any @example.org address, e.g. lena@example.org');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
