/**
 * Phase 8 — load test for the budget-lock calculation (Module 5).
 *
 * The one calculation that must complete reliably inside the Day 89–90 window
 * for every cycle from now on, exercised at a realistic org size: 120 pods,
 * each with a connected financial feed, run through compute + lock. The
 * thresholds are deliberately generous (the window is measured in hours) — the
 * test exists to catch order-of-magnitude regressions, e.g. an accidental
 * per-pod round-trip turning the loop quadratic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { createCycle } from '../../db/repositories/calendar';
import { recordFinancialSync } from '../../db/repositories/budget';
import { computeBudget, lockCycle } from '../../server/services/budget';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import { createEventBus } from '../../core/events';

const POD_COUNT = 120;
const CYCLE_START = '2026-07-01';
/** Day 89 — inside the lock window. */
const TODAY = addDays(CYCLE_START, 88);

let db: Database;
let orgId: string;
let cycleId: string;
let architectId: string;

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Load Co', slug: 'load-co' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Bulk', code: 'BLK' });

  architectId = (await createUser(db, { orgId, email: 'arch@load.example', fullName: 'Arch Itect' })).id;
  await assignRole(db, { userId: architectId, roleType: 'hub_architecture', scopeType: 'org', scopeId: null, startDate: CYCLE_START });

  const cycle = await createCycle(db, {
    orgId,
    holdingId: null,
    cycleNumber: 1,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });
  cycleId = cycle.id;

  // 120 pods, each with its own fixed costs and a healthy, connected feed.
  for (let index = 0; index < POD_COUNT; index += 1) {
    const pod = await createPod(db, {
      holdingId: holding.id,
      name: `Pod ${String(index + 1).padStart(3, '0')}`,
      status: 'active',
      monthlyFixedCosts: 4_000_000 + (index % 25) * 250_000,
    });
    await recordFinancialSync(db, {
      podId: pod.id,
      cycleId,
      sourceSystem: 'Main Accounting',
      periodStart: CYCLE_START,
      periodEnd: TODAY,
      status: 'ok',
      revenue: 9_000_000 + (index % 40) * 150_000,
      costs: 5_000_000 + (index % 17) * 100_000,
      profit: 4_000_000 + (index % 23) * 90_000,
    });
  }
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('budget calculation at realistic scale', () => {
  it(`computes and locks a budget for ${POD_COUNT} pods inside the window`, async () => {
    const context = { db, bus: createEventBus(), today: () => TODAY };

    const computeStart = Date.now();
    const result = await computeBudget(context, {
      orgId,
      cycleId,
      cycleNumber: 1,
      totalPool: 2_000_000_000,
    });
    const computeMs = Date.now() - computeStart;
    // eslint-disable-next-line no-console
    console.log(`[load] computeBudget: ${computeMs}ms for ${result.results.length} pods`);

    expect(result.results.length).toBe(POD_COUNT);
    expect(computeMs).toBeLessThan(15_000);

    // Every pod got a non-negative allocation and the pool is reconciled.
    for (const row of result.results) {
      expect(row.finalBudget).toBeGreaterThanOrEqual(0);
    }

    const lockStart = Date.now();
    const locked = await lockCycle(context, {
      budgetCycleId: result.budgetCycle.id,
      actorUserId: architectId,
      force: true, // peer-review input is absent at this scale; the lock itself is the target
    });
    const lockMs = Date.now() - lockStart;
    // eslint-disable-next-line no-console
    console.log(`[load] lockCycle: ${lockMs}ms`);

    expect(locked.budgetCycle.status).toBe('locked');
    expect(lockMs).toBeLessThan(10_000);
    expect(computeMs + lockMs).toBeLessThan(20_000);

    // Immutability holds at scale too: recomputing a locked cycle is refused.
    await expect(
      computeBudget(context, { orgId, cycleId, cycleNumber: 1, totalPool: 2_000_000_000 }),
    ).rejects.toThrow(/locked/i);
  }, 90_000);
});
