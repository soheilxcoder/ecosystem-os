/**
 * Module 09 HTTP tests — the Strategic Hub Console, at the edge.
 *
 * These encode the phase-7 definition-of-done, because every one of them is a
 * guarantee the module makes about what the console CANNOT do or must not
 * skip:
 *
 *   - a pod can only come into existence through the deployment wizard —
 *     POST /api/pods does not exist, and the wizard attaches membership,
 *     roles, coach, data source and an Entry Trial in one audited action
 *   - the hub console cannot edit pod scores, budgets or governance verdicts
 *   - Company X's actions land in the same audit/archive fabric the pods read
 *   - an investor report can never resolve to a single pod's detail
 *   - the full Pars-style pilot lifecycle: phases → criteria → decision,
 *     where "expand" belongs to the holding executive and carries lessons
 *     into the next unit's archive
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { completeCycle, createCycle } from '../../db/repositories/calendar';
import { createEntryTrial } from '../../db/repositories/governance';
import { createPilotProgram } from '../../db/repositories/hub';
import { entryDecisionDueDate } from '../../core/entry-trial';
import { buildServer } from '../../server/index';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';

const C1_START = '2026-01-01';
const C2_START = '2026-04-01';
const C3_START = '2026-07-01';
/** Mid-cycle, an execution day. */
const TODAY = addDays(C3_START, 40);

let db: Database;
let app: FastifyInstance;
let orgId: string;
let holdingId: string;

let atlas: string;
let basalt: string;
let cinder: string;
let pilotPod: string; // the seeded pilot's unit (Cinder)

let coraId: string;
let lenaId: string;

let danToken: string; // Deployment Hub
let sanaToken: string; // Strategic Interactions Hub
let ariToken: string; // Architecture Hub
let ilyasToken: string; // investor (holding-scoped)
let hanaToken: string; // holding executive (holding-scoped)
let lenaToken: string; // plain pod member

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

async function orgUserCount(): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM app_user WHERE org_id = $1',
    [orgId],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Pars', code: 'PRS' });
  holdingId = holding.id;

  atlas = (await createPod(db, { holdingId, name: 'Pod Atlas', status: 'active' })).id;
  basalt = (await createPod(db, { holdingId, name: 'Pod Basalt', status: 'active' })).id;
  cinder = (await createPod(db, { holdingId, name: 'Pod Cinder', status: 'trial' })).id;

  const mkUser = async (name: string, email: string): Promise<string> =>
    (await createUser(db, { orgId, email, fullName: name })).id;

  lenaId = await mkUser('Lena Lead', 'lena@example.org');
  coraId = await mkUser('Cora Coach', 'cora@example.org');
  const danId = await mkUser('Dan Deploy', 'dan@example.org');
  const sanaId = await mkUser('Sana Strategic', 'sana@example.org');
  const ariId = await mkUser('Ari Architect', 'ari@example.org');
  const ilyasId = await mkUser('Ilyas Investor', 'ilyas@example.org');
  const hanaId = await mkUser('Hana Holding', 'hana@example.org');
  await mkUser('Mo Member', 'mo@example.org');
  await mkUser('Petra Prod', 'petra@example.org');
  await mkUser('Sam Solver', 'sam@example.org');

  await addPodMember(db, { podId: atlas, userId: lenaId, joinedAt: C1_START });
  await assignRole(db, { userId: lenaId, roleType: 'pod_member', scopeType: 'pod', scopeId: atlas, startDate: C1_START });
  await assignRole(db, { userId: lenaId, roleType: 'pod_lead', scopeType: 'pod', scopeId: atlas, startDate: C1_START, endDate: addDays(TODAY, 100) });
  await assignRole(db, { userId: coraId, roleType: 'coach', scopeType: 'pod', scopeId: atlas, startDate: C1_START });

  // The four hubs + the holding seats, exactly as the seed provisions them.
  await assignRole(db, { userId: danId, roleType: 'hub_deployment', scopeType: 'org', scopeId: null, startDate: C1_START });
  await assignRole(db, { userId: sanaId, roleType: 'hub_strategic', scopeType: 'org', scopeId: null, startDate: C1_START });
  await assignRole(db, { userId: ariId, roleType: 'hub_architecture', scopeType: 'org', scopeId: null, startDate: C1_START });
  await assignRole(db, { userId: ilyasId, roleType: 'investor', scopeType: 'holding', scopeId: holdingId, startDate: C1_START });
  await assignRole(db, { userId: hanaId, roleType: 'holding_executive', scopeType: 'holding', scopeId: holdingId, startDate: C1_START });

  const c1 = await createCycle(db, { orgId, holdingId: null, cycleNumber: 1, startDate: C1_START, endDate: addDays(C1_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });
  await completeCycle(db, c1.id);
  const c2 = await createCycle(db, { orgId, holdingId: null, cycleNumber: 2, startDate: C2_START, endDate: addDays(C2_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });
  await completeCycle(db, c2.id);
  await createCycle(db, { orgId, holdingId: null, cycleNumber: 3, startDate: C3_START, endDate: addDays(C3_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });

  // Cinder is 35 days into its entry trial — the tracker's seeded row.
  const trialStart = addDays(TODAY, -35);
  await createEntryTrial(db, {
    orgId,
    podId: cinder,
    startDate: trialStart,
    decisionDueDate: entryDecisionDueDate(trialStart),
    criteria: [
      { label: 'Team size within band', met: true },
      { label: 'Leadership support confirmed', met: true },
      { label: 'Financial system connectable', met: false },
      { label: 'Non-critical to holding', met: null },
    ],
  });

  // The Pars Pilot, mid-sprint, with its unit linked.
  const pilot = await createPilotProgram(db, {
    orgId,
    name: 'Pars Pilot',
    holdingId,
    pilotPodId: cinder,
  });
  pilotPod = cinder;
  void pilot;

  app = await buildServer({ db, env: { TODAY }, logger: false });
  danToken = await login(app, 'dan@example.org');
  sanaToken = await login(app, 'sana@example.org');
  ariToken = await login(app, 'ari@example.org');
  ilyasToken = await login(app, 'ilyas@example.org');
  hanaToken = await login(app, 'hana@example.org');
  lenaToken = await login(app, 'lena@example.org');
});

afterAll(async () => {
  await app.close();
  await db.close();
});

// ---------------------------------------------------------------------------

describe('deployment wizard — the single pod-creation path', () => {
  it('has no pod-creation route outside the wizard (POST /api/pods is 404)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pods',
      headers: bearer(danToken),
      payload: { name: 'Pod Sneaky', holdingId },
    });
    expect(response.statusCode).toBe(404);
  });

  it('denies the launch to anyone without hub.deploy_unit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(lenaToken),
      payload: {
        name: 'Pod Nope',
        holdingId,
        memberEmails: ['lena@example.org'],
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('launches a pod with membership, lead, coach, data source and trial in one action', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(danToken),
      payload: {
        name: 'Pod Flint',
        categoryTag: 'manufacturing',
        holdingId,
        memberEmails: ['mo@example.org', 'petra@example.org', 'sam@example.org'],
        leadEmail: 'petra@example.org',
        coachUserId: coraId,
        dataSourceSystem: 'Main CRM',
        criteria: [
          { label: 'Team size within the 15–30 band', met: true },
          { label: 'Leadership support confirmed', met: true },
          { label: 'Financial/CRM system connectable', met: true },
          { label: 'Non-critical to the holding', met: false },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<{
      data: { podId: string; trialId: string | null; memberCount: number; coachUserId: string | null; dataSourceConnected: boolean };
    }>().data;
    expect(body.memberCount).toBe(3);
    expect(body.coachUserId).toBe(coraId);
    expect(body.dataSourceConnected).toBe(true);
    expect(body.trialId).toBeTruthy();

    // The pod exists, born in trial status.
    const pods = (await db.query<{ status: string }>('SELECT status FROM pod WHERE id = $1', [body.podId])).rows;
    expect(pods[0]!.status).toBe('trial');

    // Membership and seats: three members, one lead, one coach seat.
    const members = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM pod_membership WHERE pod_id = $1', [body.podId])).rows;
    expect(members[0]!.n).toBe(3);
    const roles = (
      await db.query<{ role_type: string }>('SELECT role_type FROM role_assignment WHERE scope_id = $1 ORDER BY role_type', [body.podId])
    ).rows.map((r) => r.role_type);
    expect(roles).toEqual(['coach', 'pod_lead', 'pod_member', 'pod_member', 'pod_member']);

    // The coach assignment exists.
    const assignments = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM coach_assignment WHERE pod_id = $1', [body.podId])).rows;
    expect(assignments[0]!.n).toBe(1);

    // The Entry Trial carries the wizard's checklist as its criteria.
    const trials = (
      await db.query<{ open: boolean; criteria: unknown }>('SELECT final_result IS NULL AS open, criteria FROM entry_trial WHERE pod_id = $1', [body.podId])
    ).rows;
    expect(trials[0]!.open).toBe(true);
    const criteria = trials[0]!.criteria as Array<{ met: boolean | null }>;
    expect(criteria).toHaveLength(4);
    expect(criteria.filter((c) => c.met === true)).toHaveLength(3);

    // The data source marker is `stale` with no revenue — it must never
    // pretend to be real financial data or feed the budget component scores.
    const syncs = (
      await db.query<{ status: string; revenue: number | null }>('SELECT status, revenue FROM financial_sync_record WHERE pod_id = $1', [body.podId])
    ).rows;
    expect(syncs).toHaveLength(1);
    expect(syncs[0]!.status).toBe('stale');
    expect(syncs[0]!.revenue).toBeNull();

    // The hub's action sits in the very same audit log the pods read.
    const audit = (
      await db.query<{ action: string }>('SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY created_at', [body.podId])
    ).rows.map((r) => r.action);
    expect(audit).toContain('hub.pod_launched');

    // Every org member was told — the hub never acts quietly.
    const total = await orgUserCount();
    const notified = (
      await db.query<{ n: number }>("SELECT COUNT(DISTINCT recipient_user_id)::int AS n FROM notification WHERE trigger_type = 'hub_pod_launched'")
    ).rows;
    expect(notified[0]!.n).toBe(total);

    // The archive indexed the launch as a pod record.
    const archive = (
      await db.query<{ entity_type: string }>('SELECT entity_type FROM archive_index_entry WHERE entity_id = $1', [body.podId])
    ).rows;
    expect(archive.map((r) => r.entity_type)).toContain('pod');

    // And the budget module saw nothing: no budget rows for a mid-cycle birth.
    const budget = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM pod_budget_result WHERE pod_id = $1', [body.podId])).rows;
    expect(budget[0]!.n).toBe(0);
  });

  it('rejects a launch naming members that have no org account', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(danToken),
      payload: { name: 'Pod Ghost', holdingId, memberEmails: ['ghost@elsewhere.org'] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a launch whose lead is not among the members', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(danToken),
      payload: {
        name: 'Pod Headless',
        holdingId,
        memberEmails: ['mo@example.org'],
        leadEmail: 'lena@example.org',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('shows every trial pod in the tracker with days remaining and checklist completion', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/hub/deployment/trials',
      headers: bearer(danToken),
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{
      data: Array<{
        podName: string;
        decisionDueDate: string | null;
        daysRemaining: number | null;
        criteriaMet: number;
        criteriaTotal: number;
        completionPercent: number;
      }>;
    }>().data;
    expect(rows.map((r) => r.podName).sort()).toEqual(['Pod Cinder', 'Pod Flint']);

    const cinderRow = rows.find((r) => r.podName === 'Pod Cinder')!;
    expect(cinderRow.criteriaMet).toBe(2);
    expect(cinderRow.criteriaTotal).toBe(4);
    expect(cinderRow.completionPercent).toBe(50);
    expect(cinderRow.daysRemaining).toBe(55); // 90-day trial, 35 days elapsed

    const flintRow = rows.find((r) => r.podName === 'Pod Flint')!;
    expect(flintRow.daysRemaining).toBe(90); // launched today
    expect(flintRow.completionPercent).toBe(75);
  });
});

describe('the hub console cannot override module flows', () => {
  it('cannot lock a budget cycle (hub_architecture only)', async () => {
    const cycles = (
      await db.query<{ id: string }>("SELECT id FROM sprint_cycle WHERE org_id = $1 AND status = 'active'", [orgId])
    ).rows;
    const response = await app.inject({
      method: 'POST',
      url: `/api/budget/cycle/${cycles[0]!.id}/lock`,
      headers: bearer(danToken),
    });
    expect(response.statusCode).toBe(403);
  });

  it('cannot submit a peer-review score (peer_validator only)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/review/00000000-0000-4000-8000-000000000000/score',
      headers: bearer(danToken),
      payload: { score: 90, comment: 'x'.repeat(150) },
    });
    expect(response.statusCode).toBe(403);
  });

  it('cannot open an accountability case recommendation (conflict_resolver only)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/review/cases/00000000-0000-4000-8000-000000000000/recommend',
      headers: bearer(sanaToken),
      payload: { recommendation: 'continue' },
    });
    expect([403, 404, 409]).toContain(response.statusCode);
    expect(response.statusCode).not.toBe(200);
  });
});

describe('one audit fabric for Company X and the pods', () => {
  it('a pod member sees the hub-launched pod in the shared activity feed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/archive/activity',
      headers: bearer(lenaToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { items: Array<{ title: string; entityType: string }> } }>().data;
    const launched = body.items.find((i) => i.title.includes('Pod Flint was launched'));
    expect(launched).toBeTruthy();
    expect(launched!.entityType).toBe('pod');
  });
});

describe('investor reports — aggregation enforced', () => {
  let reportId: string;

  it('rejects a scope that resolves to a single pod', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/strategic/reports',
      headers: bearer(sanaToken),
      payload: { dateFrom: C3_START, dateTo: TODAY, holdingIds: [], podIds: [atlas] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe('aggregation_below_minimum');
  });

  it('generates an aggregated report for a multi-pod scope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/strategic/reports',
      headers: bearer(sanaToken),
      payload: { dateFrom: C3_START, dateTo: TODAY, holdingIds: [holdingId], podIds: [] },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json<{ data: { id: string; metrics: { podCountInScope: number }; published: boolean } }>().data;
    reportId = data.id;
    expect(data.metrics.podCountInScope).toBeGreaterThanOrEqual(2);
    expect(data.published).toBe(false);
  });

  it('publishes the report', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/hub/strategic/reports/${reportId}/publish`,
      headers: bearer(sanaToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { published: boolean } }>().data.published).toBe(true);
  });

  it('shows investors only published reports', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/hub/strategic/reports',
      headers: bearer(ilyasToken),
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ data: Array<{ published: boolean }> }>().data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.published)).toBe(true);
  });

  it('denies the report surface to plain members and blocks investors from generating', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: '/api/hub/strategic/reports',
      headers: bearer(lenaToken),
    });
    expect(denied.statusCode).toBe(403);

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/hub/strategic/reports',
      headers: bearer(ilyasToken),
      payload: { dateFrom: C3_START, dateTo: TODAY, holdingIds: [], podIds: [] },
    });
    expect(blocked.statusCode).toBe(403);
  });
});

describe('external contact log', () => {
  it('lets the Strategic Hub add a contact and log an interaction', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/hub/strategic/contacts',
      headers: bearer(sanaToken),
      payload: { name: 'Nordwind Capital', relationshipType: 'investor' },
    });
    expect(created.statusCode).toBe(201);
    const contact = created.json<{ data: { id: string } }>().data;

    const logged = await app.inject({
      method: 'POST',
      url: `/api/hub/strategic/contacts/${contact.id}/interaction`,
      headers: bearer(sanaToken),
      payload: { notes: 'Intro call; follow up with the aggregated deck.' },
    });
    expect(logged.statusCode).toBe(200);
    expect(logged.json<{ data: { lastInteractionAt: string } }>().data.lastInteractionAt).toBe(TODAY);
  });

  it('keeps the contact log away from other hubs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/hub/strategic/contacts',
      headers: bearer(danToken),
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('pilot programs — the two-part pilot process', () => {
  let testPilotId: string;
  let parsPilotId: string;

  it('creates a pilot and tracks phases with owners', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/hub/pilots',
      headers: bearer(danToken),
      payload: { name: 'Dena Trial Run', holdingId },
    });
    expect(created.statusCode).toBe(201);
    testPilotId = created.json<{ data: { id: string } }>().data.id;

    const updated = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${testPilotId}/phase-update`,
      headers: bearer(danToken),
      payload: {
        currentPhase: 'selection_diagnostic',
        phase: 'selection_diagnostic',
        status: 'in_progress',
        owner: 'Deployment Hub + Holding CEO',
      },
    });
    expect(updated.statusCode).toBe(200);
    const pilot = updated.json<{ data: { currentPhase: string; phaseStatus: Record<string, { status: string; owner: string | null }> } }>().data;
    expect(pilot.currentPhase).toBe('selection_diagnostic');
    expect(pilot.phaseStatus.selection_diagnostic).toEqual({
      status: 'in_progress',
      owner: 'Deployment Hub + Holding CEO',
    });
  });

  it('tracks the three source-defined success criteria', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${testPilotId}/criteria`,
      headers: bearer(danToken),
      payload: { decisionTimeBaseline: 5, profitBudgetRatioBaseline: 0.85 },
    });
    expect(response.statusCode).toBe(200);
    const criteria = response.json<{ data: { successCriteria: Record<string, number | null> } }>().data.successCriteria;
    expect(criteria.decisionTimeBaseline).toBe(5);
    expect(criteria.profitBudgetRatioBaseline).toBe(0.85);
  });

  it('records stop/repeat for the Deployment Hub, but never twice', async () => {
    const decided = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${testPilotId}/decision`,
      headers: bearer(danToken),
      payload: { decision: 'stop', lessonsLearned: 'Unit too small for the split.' },
    });
    expect(decided.statusCode).toBe(200);
    const pilot = decided.json<{ data: { decision: string; decidedAt: string | null } }>().data;
    expect(pilot.decision).toBe('stop');
    expect(pilot.decidedAt).toBeTruthy();

    const again = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${testPilotId}/decision`,
      headers: bearer(danToken),
      payload: { decision: 'repeat' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('reserves "expand" for the holding executive', async () => {
    parsPilotId = (
      await db.query<{ id: string }>("SELECT id FROM pilot_program WHERE name = 'Pars Pilot'", [])
    ).rows[0]!.id;

    const byDeployment = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${parsPilotId}/decision`,
      headers: bearer(danToken),
      payload: { decision: 'expand' },
    });
    expect(byDeployment.statusCode).toBe(403);

    const byExecutive = await app.inject({
      method: 'POST',
      url: `/api/hub/pilots/${parsPilotId}/decision`,
      headers: bearer(hanaToken),
      payload: {
        decision: 'expand',
        lessonsLearned: 'Pair the coach in week 2; charter drafting ran long.',
      },
    });
    expect(byExecutive.statusCode).toBe(200);
    expect(byExecutive.json<{ data: { decision: string } }>().data.decision).toBe('expand');

    // The decision announcement reached the org notification fabric.
    const notified = (
      await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM notification WHERE trigger_type = 'hub_pilot_decision_recorded'")
    ).rows;
    expect(notified[0]!.n).toBeGreaterThan(0);
  });

  it('refuses expansion prefill for pilots that did not expand', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/hub/pilots/${testPilotId}/expansion-prefill`,
      headers: bearer(danToken),
    });
    expect(response.statusCode).toBe(409);
  });

  it('prefills the next-unit wizard and carries lessons into the new pod', async () => {
    const prefill = await app.inject({
      method: 'GET',
      url: `/api/hub/pilots/${parsPilotId}/expansion-prefill`,
      headers: bearer(danToken),
    });
    expect(prefill.statusCode).toBe(200);
    const data = prefill.json<{
      data: { pilotId: string; holdingId: string; suggestedName: string; lessonsLearned: string | null };
    }>().data;
    expect(data.holdingId).toBe(holdingId);
    expect(data.suggestedName).toContain('next unit');
    expect(data.lessonsLearned).toContain('Pair the coach');

    const launch = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(danToken),
      payload: {
        name: data.suggestedName,
        holdingId: data.holdingId,
        memberEmails: ['noor-newcomer@example.org', 'sam@example.org'],
        leadEmail: 'sam@example.org',
        pilotId: data.pilotId,
        criteria: [{ label: 'Team size within band', met: true }],
      },
    });
    // First member does not exist — the wizard must refuse cleanly.
    expect(launch.statusCode).toBe(400);

    const fixed = await app.inject({
      method: 'POST',
      url: '/api/hub/deployment/pods',
      headers: bearer(danToken),
      payload: {
        name: data.suggestedName,
        holdingId: data.holdingId,
        memberEmails: ['mo@example.org', 'sam@example.org'],
        leadEmail: 'sam@example.org',
        coachUserId: coraId,
        pilotId: data.pilotId,
        criteria: [{ label: 'Team size within band', met: true }],
      },
    });
    expect(fixed.statusCode, fixed.body).toBe(201);
    const podId = fixed.json<{ data: { podId: string } }>().data.podId;

    // The pilot now points at its next unit…
    const pilotRow = (await db.query<{ pilot_pod_id: string }>('SELECT pilot_pod_id FROM pilot_program WHERE id = $1', [parsPilotId])).rows;
    expect(pilotRow[0]!.pilot_pod_id).toBe(podId);

    // …and the lessons travelled into the new pod's archive record.
    const lesson = (
      await db.query<{ what_wed_do_differently: string }>(
        "SELECT what_wed_do_differently FROM lesson_learned WHERE related_entity_id = $1 AND tags::text LIKE '%expansion%'",
        [podId],
      )
    ).rows;
    expect(lesson[0]!.what_wed_do_differently).toContain('Pair the coach');
    const archive = (
      await db.query<{ title: string }>("SELECT title FROM archive_index_entry WHERE entity_type = 'lesson' AND pod_ids::text LIKE $1", [`%${podId}%`])
    ).rows;
    expect(archive.some((r) => r.title.includes('Pilot lessons carried'))).toBe(true);

    void pilotPod;
    void lenaId;
  });

  it('exposes model health to the Architecture Hub only', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/hub/architecture/model-health',
      headers: bearer(ariToken),
    });
    expect(allowed.statusCode).toBe(200);
    const health = allowed.json<{ data: { activeRuleCount: number; changelog: unknown[] } }>().data;
    expect(health.activeRuleCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(health.changelog)).toBe(true);

    const denied = await app.inject({
      method: 'GET',
      url: '/api/hub/architecture/model-health',
      headers: bearer(lenaToken),
    });
    expect(denied.statusCode).toBe(403);
  });
});
