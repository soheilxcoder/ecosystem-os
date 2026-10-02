/**
 * Module 05 HTTP tests — the Internal Budget Market at the edge.
 *
 * `tests/unit/budget.test.ts` proves the arithmetic. These prove the arithmetic
 * is what the *product* actually runs, which is the part that was missing: the
 * formula existed and was correct while nothing called it.
 *
 * The cases here are the ones from Phase 4's definition of done:
 *   - the appendix worked example reproduces through a real HTTP request
 *   - a cycle where every pod crosses the ceiling leaves the remainder
 *     unallocated and *reported*, never silently absorbed
 *   - the allocation always sums back to the pool
 *   - locking refuses while peer reviews are unresolved, and says what is missing
 *   - a locked cycle rejects every further write
 *   - a versioned change to the formula weights reaches the calculation
 *   - the simulator writes nothing
 *   - a pod member can read but cannot compute or lock
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { insertOne } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { completeCycle, createCycle } from '../../db/repositories/calendar';
import {
  createStrategicGoal,
  recordFinancialSync,
  upsertGoalAlignment,
} from '../../db/repositories/budget';
import { buildServer } from '../../server/index';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import { BUDGET_FORMULA_WEIGHTS } from '../../core/budget';

const CYCLE_START = '2026-01-01';
/** Cycle day 90 — the announcement/lock window (Days 89–90). */
const LOCK_DAY = addDays(CYCLE_START, 89);
/** Cycle day 50 — mid-execution, where results are still provisional. */
const PROVISIONAL_DAY = addDays(CYCLE_START, 49);

const POOL = 900_000_000;

let db: Database;
let app: FastifyInstance;
let orgId: string;
let cycleId: string;
let podA: string;
let podB: string;
let podC: string;
let architectToken: string;
let memberToken: string;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function login(target: FastifyInstance, email: string): Promise<string> {
  const response = await target.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

/** A submitted pitch plus one submitted review carrying `score`. */
async function seedReview(
  podId: string,
  score: number,
  reviewerEmail: string,
  targetCycleId: string = cycleId,
): Promise<void> {
  const reviewerId = (
    await createUser(db, { orgId, email: reviewerEmail, fullName: `Reviewer ${score}` })
  ).id;

  const pitch = await insertOne<{ id: string }>(
    db,
    `INSERT INTO pitch (pod_id, cycle_id, status, previous_summary, submitted_at)
     VALUES ($1, $2, 'submitted', 'seeded', now())
     ON CONFLICT (pod_id, cycle_id) DO UPDATE SET status = 'submitted', submitted_at = now()
     RETURNING id`,
    [podId, targetCycleId],
  );

  await insertOne(
    db,
    `INSERT INTO peer_review (cycle_id, pitch_id, reviewer_user_id, score, comments, submitted_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (pitch_id, reviewer_user_id) DO UPDATE
       SET score = EXCLUDED.score, submitted_at = now()
     RETURNING id`,
    [
      targetCycleId,
      pitch.id,
      reviewerId,
      score,
      'A review long enough to satisfy the configured minimum comment length, ' +
        'evidencing the claim rather than asserting it.',
    ],
  );
}

/**
 * The appendix's exact inputs: A 78/82/65, B 60/70/90, C 90/55/40.
 *
 * Parameterised over the cycle because a second sprint cycle needs its own
 * inputs — the financial period is derived from that cycle's dates, and reviews
 * and goal alignments are scoped to it. Seeding once and computing twice would
 * silently score the second cycle on midpoint estimates for all three
 * components, which is a real state but not the one under test.
 */
async function seedAppendixInputs(
  targetCycleId: string = cycleId,
  periodStart: string = CYCLE_START,
  periodEnd: string = addDays(CYCLE_START, 89),
): Promise<void> {
  const pods: Array<[string, [number, number, number]]> = [
    [podA, [78, 82, 65]],
    [podB, [60, 70, 90]],
    [podC, [90, 55, 40]],
  ];

  const goal = await createStrategicGoal(db, {
    orgId,
    label: 'Ecosystem expansion',
    description: 'Seed goal used to exercise the strategic component',
  });

  for (const [podId, [financialRaw, peerScore, strategicRaw]] of pods) {
    // Financial: profit equal to the raw figure, so percentile rank across the
    // cohort reproduces the appendix's Financial column exactly.
    await recordFinancialSync(db, {
      podId,
      cycleId: targetCycleId,
      sourceSystem: 'test-accounting',
      periodStart,
      periodEnd,
      status: 'ok',
      revenue: financialRaw * 1000,
      costs: 0,
      profit: financialRaw,
      currency: 'IRR',
    });

    await seedReview(
      podId,
      peerScore,
      `reviewer-${targetCycleId.slice(0, 8)}-${podId.slice(0, 8)}-${peerScore}@example.org`,
      targetCycleId,
    );

    await upsertGoalAlignment(db, {
      orgId,
      cycleId: targetCycleId,
      podId,
      goalId: goal!.id,
      score: strategicRaw,
      weight: 1,
      rationale: 'Seeded alignment for the appendix worked example',
    });
  }
}

async function computeCycle(today: string, pool = POOL) {
  return app.inject({
    method: 'POST',
    url: '/api/budget/cycle/compute',
    headers: bearer(architectToken),
    payload: { cycleId, cycleNumber: 1, totalPool: pool },
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Pars', code: 'PRS' });

  // Monthly fixed costs kept small relative to the pool so the survival floor
  // does not dominate the worked example's proportional shares.
  podA = (await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active', monthlyFixedCosts: 1_000_000 })).id;
  podB = (await createPod(db, { holdingId: holding.id, name: 'Pod Basalt', status: 'active', monthlyFixedCosts: 1_000_000 })).id;
  podC = (await createPod(db, { holdingId: holding.id, name: 'Pod Cinder', status: 'active', monthlyFixedCosts: 1_000_000 })).id;

  const architectId = (
    await createUser(db, { orgId, email: 'ari@companyx.example', fullName: 'Ari Architect' })
  ).id;
  const memberId = (
    await createUser(db, { orgId, email: 'lena@example.org', fullName: 'Lena Lead' })
  ).id;

  await assignRole(db, {
    userId: architectId,
    roleType: 'hub_architecture',
    scopeType: 'org',
    scopeId: null,
    startDate: CYCLE_START,
  });
  await assignRole(db, {
    userId: memberId,
    roleType: 'pod_member',
    scopeType: 'pod',
    scopeId: podA,
    startDate: CYCLE_START,
  });

  const cycle = await createCycle(db, {
    orgId,
    holdingId: null,
    cycleNumber: 1,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });
  cycleId = cycle.id;

  app = await buildServer({ db, env: { TODAY: PROVISIONAL_DAY }, logger: false });
  architectToken = await login(app, 'ari@companyx.example');
  memberToken = await login(app, 'lena@example.org');

  await seedAppendixInputs();

  // One provisional calculation up front: several cases read the allocation
  // before exercising a mutation, and a budget screen with no cycle at all is a
  // different (also tested) state rather than the normal one.
  const seeded = await computeCycle(PROVISIONAL_DAY);
  expect(seeded.statusCode, seeded.body).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('budget market — calculation', () => {
  it('reproduces the appendix worked example through a real HTTP request', async () => {
    // The appendix's Financial column is *already* a normalized 0-100 score.
    // This service derives that score from raw profit figures by percentile rank
    // across the cycle's cohort, which with three pods can only yield 0/50/100 —
    // so the exact triple is fed in through the simulator, the one endpoint that
    // takes component scores directly. That still exercises the whole HTTP stack
    // against the appendix's own numbers, without pretending normalization is a
    // passthrough.
    const response = await app.inject({
      method: 'POST',
      url: '/api/budget/simulate',
      headers: bearer(architectToken),
      payload: { targetPodId: podA, components: { financial: 78, peer_review: 82, strategic: 65 } },
    });
    expect(response.statusCode, response.body).toBe(200);

    const simulation = response.json<{ data: any }>().data;
    expect(simulation.simulatedUnitScore).toBeCloseTo(76.15, 2);
    expect(simulation.arithmeticLine).toBe('(0.40 × 78) + (0.35 × 82) + (0.25 × 65) = 76.15');
  });

  it('derives each component from its real input and sums them with the snapshotted weights', async () => {
    const response = await computeCycle(PROVISIONAL_DAY);
    expect(response.statusCode, response.body).toBe(201);

    const body = response.json<{ data: any }>().data;
    const byPod = new Map<string, any>(
      body.pods.map((pod: any) => [pod.podId as string, pod] as [string, any]),
    );

    // Peer review is the average of submitted reviewer scores: one review of 82
    // for Atlas, 70 for Basalt, 55 for Cinder.
    expect(byPod.get(podA).components.peer_review.score).toBeCloseTo(82, 2);
    expect(byPod.get(podB).components.peer_review.score).toBeCloseTo(70, 2);
    expect(byPod.get(podC).components.peer_review.score).toBeCloseTo(55, 2);

    // Strategic is the weighted rubric average: a single goal, weight 1.
    expect(byPod.get(podA).components.strategic.score).toBeCloseTo(65, 2);
    expect(byPod.get(podB).components.strategic.score).toBeCloseTo(90, 2);
    expect(byPod.get(podC).components.strategic.score).toBeCloseTo(40, 2);

    // And whatever the financial normalization produced, the Unit Score is the
    // weighted sum of the three stored components — never a number that cannot
    // be rebuilt from what is in the database.
    for (const pod of body.pods) {
      const c = pod.components;
      const expected =
        0.4 * c.financial.score + 0.35 * c.peer_review.score + 0.25 * c.strategic.score;
      expect(pod.unitScore, `${pod.podName} must be the weighted sum of its parts`).toBeCloseTo(
        expected,
        2,
      );
      expect(pod.arithmeticLine).toContain(`= ${pod.unitScore}`);
    }
  });

  it('applies the 30% ceiling and reports what nobody could receive', async () => {
    const response = await computeCycle(PROVISIONAL_DAY);
    const body = response.json<{ data: any }>().data;

    // With three pods the caps sum to 90% of the pool, so every pod crosses the
    // ceiling and a tenth of the pool is undistributable. That is a legitimate
    // outcome — but it must be *reported*, never folded into the totals.
    expect(body.totals.capAmount).toBe(270_000_000);
    expect(body.totals.unallocated).toBe(90_000_000);

    for (const pod of body.pods) {
      expect(pod.allocation.capApplied, `${pod.podName} should have been capped`).toBe(true);
    }

    const capped = body.pods.filter((pod: any) => pod.allocation.capApplied);
    expect(capped.length, 'the spec asks for a case where several pods cap at once').toBe(3);
  });

  it('always sums back to the pool — nothing invented, nothing lost', async () => {
    const response = await computeCycle(PROVISIONAL_DAY);
    const body = response.json<{ data: any }>().data;

    const distributed = body.results.reduce(
      (total: number, result: any) => total + Number(result.finalBudget),
      0,
    );

    expect(distributed + body.totals.unallocated).toBe(body.totals.totalPool);
  });

  it('reserves every survival floor before the proportional formula runs', async () => {
    const response = await computeCycle(PROVISIONAL_DAY);
    const body = response.json<{ data: any }>().data;

    // Three pods × 1,000,000 fixed costs.
    expect(body.totals.reservedForSurvival).toBe(3_000_000);
    expect(body.totals.distributablePool).toBe(POOL - 3_000_000);

    for (const result of body.results) {
      expect(Number(result.survivalBudget)).toBe(1_000_000);
      // The final number is the sum of its parts — the schema CHECKs this too.
      expect(Number(result.finalBudget)).toBe(
        Number(result.survivalBudget) + Number(result.formulaShare),
      );
    }
  });

  it('stores the inputs behind every score, not just the score', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/budget/pod/${podA}/breakdown`,
      headers: bearer(memberToken),
    });
    expect(response.statusCode, response.body).toBe(200);

    const breakdown = response.json<{ data: any }>().data;
    expect(breakdown.components).toHaveLength(3);

    for (const component of breakdown.components) {
      expect(component.rawInputs, `${component.componentType} must carry its raw inputs`).toBeTruthy();
      expect(Object.keys(component.rawInputs).length).toBeGreaterThan(0);
      expect(component.normalizationMethod).not.toBe('not_calculated');
      expect(component.explanation, 'every sub-bar needs a one-line why').toBeTruthy();
      expect(component.weight).toBe(BUDGET_FORMULA_WEIGHTS[component.componentType as 'financial']);
    }

    // Adjustment lines are separate, never folded into the total.
    const labels = breakdown.adjustmentLines.map((line: any) => line.label);
    expect(labels).toContain('Survival Budget (floor)');
    expect(labels).toContain('Proportional share');
    expect(labels).toContain('Cap applied');
    expect(labels).toContain('Unallocated (org-wide)');
  });
});

describe('budget market — authorization', () => {
  it('lets a pod member read the allocation (cross-pod transparency is default-on)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/cycle/current',
      headers: bearer(memberToken),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<{ data: any }>().data.results.length).toBe(3);
  });

  it('refuses a pod member who tries to set the pool', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/budget/cycle/compute',
      headers: bearer(memberToken),
      payload: { cycleId, cycleNumber: 1, totalPool: POOL },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ reason: string }>().reason).toBe('role_not_permitted');
  });

  it('refuses a pod member who tries to lock the cycle', async () => {
    const current = await app.inject({
      method: 'GET',
      url: '/api/budget/cycle/current',
      headers: bearer(memberToken),
    });
    const budgetCycleId = current.json<{ data: any }>().data.budgetCycle.id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/budget/cycle/${budgetCycleId}/lock`,
      headers: bearer(memberToken),
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses an anonymous caller outright', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/budget/cycle/current' });
    expect(response.statusCode).toBe(401);
  });
});

describe('budget market — the simulator', () => {
  it('answers a what-if without writing anything', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/budget/cycle/current',
      headers: bearer(architectToken),
    });
    const beforeBody = before.json<{ data: any }>().data;

    const response = await app.inject({
      method: 'POST',
      url: '/api/budget/simulate',
      headers: bearer(memberToken),
      payload: {
        targetPodId: podA,
        components: { financial: 78, peer_review: 92, strategic: 65 },
      },
    });
    expect(response.statusCode, response.body).toBe(200);

    const simulation = response.json<{ data: any }>().data;
    expect(simulation.disclaimer).toMatch(/planning tool only/i);
    expect(simulation.assumption).toMatch(/every other pod/i);
    expect(simulation.simulatedUnitScore).toBeGreaterThan(simulation.current.unitScore);

    const after = await app.inject({
      method: 'GET',
      url: '/api/budget/cycle/current',
      headers: bearer(architectToken),
    });
    // The stored allocation is byte-identical: a simulation never reaches the database.
    expect(after.json<{ data: any }>().data.results).toEqual(beforeBody.results);
  });

  it('rejects a component score outside the 0–100 band', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/budget/simulate',
      headers: bearer(memberToken),
      payload: { targetPodId: podA, components: { financial: 140, peer_review: 80, strategic: 60 } },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('budget market — missing inputs are reported, never guessed as zero', () => {
  it('marks a pod with no submitted reviews and blocks the lock on it', async () => {
    // A fourth pod with financial and strategic data but no peer reviews at all.
    const holdingRow = await db.query<{ id: string }>('SELECT id FROM holding LIMIT 1');
    const orphan = (
      await createPod(db, {
        holdingId: holdingRow.rows[0]!.id,
        name: 'Pod Without Reviews',
        status: 'active',
        monthlyFixedCosts: 500_000,
      })
    ).id;

    await recordFinancialSync(db, {
      podId: orphan,
      cycleId,
      sourceSystem: 'test-accounting',
      periodStart: CYCLE_START,
      periodEnd: addDays(CYCLE_START, 89),
      status: 'ok',
      revenue: 50_000,
      costs: 0,
      profit: 50,
      currency: 'IRR',
    });

    const response = await computeCycle(PROVISIONAL_DAY);
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<{ data: any }>().data;

    const orphanPod = body.pods.find((pod: any) => pod.podId === orphan);
    expect(orphanPod.components.peer_review.normalizationMethod).toBe('missing_input_midpoint');
    expect(orphanPod.components.peer_review.estimated).toBe(true);
    expect(orphanPod.components.peer_review.score).toBe(50);

    // Scoring it zero would have moved its budget for a reason nobody at that
    // pod could act on; the midpoint plus an explicit blocker is the honest shape.
    expect(body.blockers.some((blocker: any) => blocker.reason === 'peer_reviews_missing')).toBe(true);

    const budgetCycleId = body.budgetCycle.id;
    const checklistResponse = await app.inject({
      method: 'GET',
      url: `/api/budget/cycle/${budgetCycleId}/checklist`,
      headers: bearer(architectToken),
    });
    expect(checklistResponse.statusCode, checklistResponse.body).toBe(200);
    const checklist = checklistResponse.json<{ data: any }>().data;
    expect(checklist.canLock).toBe(false);
    expect(checklist.blockers.length).toBeGreaterThan(0);

    const lockResponse = await app.inject({
      method: 'POST',
      url: `/api/budget/cycle/${budgetCycleId}/lock`,
      headers: bearer(architectToken),
      payload: {},
    });
    expect(lockResponse.statusCode).toBe(409);
    expect(lockResponse.json<{ error: string }>().error).toBe('blockers_unresolved');
    // The refusal names what is missing rather than just saying no.
    expect(lockResponse.json<{ message: string }>().message).toMatch(/unresolved/i);
  });
});

describe('budget market — locking', () => {
  it('locks on Day 90, issues an audit reference, and then refuses every write', async () => {
    const day90 = await buildServer({ db, env: { TODAY: LOCK_DAY }, logger: false });
    const day90Architect = await login(day90, 'ari@companyx.example');

    const computed = await day90.inject({
      method: 'POST',
      url: '/api/budget/cycle/compute',
      headers: bearer(day90Architect),
      payload: { cycleId, cycleNumber: 1, totalPool: POOL },
    });
    expect(computed.statusCode, computed.body).toBe(201);

    // Force past the deliberate "no reviews" blocker seeded above: the point of
    // this case is the lock's immutability, not the checklist (covered above).
    const budgetCycleId = computed.json<{ data: any }>().data.budgetCycle.id;
    const lockResponse = await day90.inject({
      method: 'POST',
      url: `/api/budget/cycle/${budgetCycleId}/lock`,
      headers: bearer(day90Architect),
      payload: { force: true },
    });
    expect(lockResponse.statusCode, lockResponse.body).toBe(200);

    const locked = lockResponse.json<{ data: any }>().data;
    expect(locked.status).toBe('locked');
    expect(locked.auditHash).toMatch(/^ECO-BUD-[0-9A-F]{16}$/);
    expect(locked.lockedAt).toBeTruthy();

    // Recomputation is now refused — the numbers were announced.
    const recompute = await day90.inject({
      method: 'POST',
      url: '/api/budget/cycle/compute',
      headers: bearer(day90Architect),
      payload: { cycleId, cycleNumber: 1, totalPool: POOL * 2 },
    });
    expect(recompute.statusCode).toBe(409);
    expect(recompute.json<{ error: string }>().error).toBe('cycle_locked');

    // Locking twice is refused too.
    const secondLock = await day90.inject({
      method: 'POST',
      url: `/api/budget/cycle/${budgetCycleId}/lock`,
      headers: bearer(day90Architect),
      payload: {},
    });
    expect(secondLock.statusCode).toBe(409);

    // And the breakdown still reads, now marked locked.
    const breakdown = await day90.inject({
      method: 'GET',
      url: `/api/budget/pod/${podA}/breakdown`,
      headers: bearer(day90Architect),
    });
    expect(breakdown.statusCode, breakdown.body).toBe(200);
    expect(breakdown.json<{ data: any }>().data.result.locked).toBe(true);
    expect(breakdown.json<{ data: any }>().data.budgetCycle.auditHash).toMatch(/^ECO-BUD-/);

    await day90.close();
  });

  it('refuses a direct UPDATE on a locked result at the database level', async () => {
    // No application path should be able to make a quiet edit; the trigger is
    // the last line of defence, so it is tested on its own.
    await expect(
      db.query('UPDATE pod_budget_result SET final_budget = final_budget + 1 WHERE locked = true'),
    ).rejects.toThrow(/locked/i);
  });
});

describe('budget market — a versioned weight change reaches the calculation', () => {
  it('uses the changed weights rather than the constant', async () => {
    // An approved rule change for a future cycle. The registry already refuses a
    // change that does not sum to 100, so this value is a legal one.
    await insertOne(
      db,
      `INSERT INTO rule_change
         (org_id, rule_name, old_value, new_value, justification, effective_cycle_id,
          effective_cycle_number, proposed_by, approved_at)
       VALUES ($1, 'budget.formula_weights', $2::jsonb, $3::jsonb, $4, $5, 2, NULL, now())
       RETURNING id`,
      [
        orgId,
        JSON.stringify(BUDGET_FORMULA_WEIGHTS),
        JSON.stringify({ financial: 50, peer_review: 30, strategic: 20 }),
        'Rebalancing toward measured financial performance from cycle 2 onward',
        cycleId,
      ],
    );

    const unlocked = await buildServer({ db, env: { TODAY: PROVISIONAL_DAY }, logger: false });
    const token = await login(unlocked, 'ari@companyx.example');

    // Cycle 1 is locked, so compute into a second sprint cycle. The schema
    // allows only one active cycle per org/holding, so the first has to be
    // closed before the second can exist — which is also the real sequence.
    await completeCycle(db, cycleId);
    const cycle2 = await createCycle(db, {
      orgId,
      holdingId: null,
      cycleNumber: 2,
      startDate: addDays(CYCLE_START, 90),
      endDate: addDays(CYCLE_START, 179),
      phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
    });

    await seedAppendixInputs(cycle2.id, cycle2.startDate, cycle2.endDate);

    const response = await unlocked.inject({
      method: 'POST',
      url: '/api/budget/cycle/compute',
      headers: bearer(token),
      payload: { cycleId: cycle2.id, cycleNumber: 2, totalPool: POOL },
    });
    expect(response.statusCode, response.body).toBe(201);

    const body = response.json<{ data: any }>().data;
    expect(body.budgetCycle.formulaWeights).toEqual({ financial: 50, peer_review: 30, strategic: 20 });

    // The claim under test is that the *changed* weights reached the
    // arithmetic, not that any particular score came out. The financial
    // component is percentile rank across the cohort, so its value depends on
    // which pods exist — asserting a fixed total here would couple this case to
    // the cohort rather than to the weights.
    const atlas = body.pods.find((pod: any) => pod.podId === podA);
    const c = atlas.components;

    // The arithmetic line renders the new fractions, not the constitutional ones.
    expect(atlas.arithmeticLine.startsWith('(0.50 × ')).toBe(true);
    expect(atlas.arithmeticLine).toContain('(0.30 × ');
    expect(atlas.arithmeticLine).toContain('(0.20 × ');
    expect(atlas.arithmeticLine).not.toContain('(0.40 × ');

    // And the Unit Score is that weighted sum of the stored components.
    const expected = 0.5 * c.financial.score + 0.3 * c.peer_review.score + 0.2 * c.strategic.score;
    expect(atlas.unitScore).toBeCloseTo(expected, 2);

    // Sanity: the components themselves are still the appendix's peer and
    // strategic figures, so only the weighting changed.
    expect(c.peer_review.score).toBeCloseTo(82, 2);
    expect(c.strategic.score).toBeCloseTo(65, 2);

    await unlocked.close();
  });
});
