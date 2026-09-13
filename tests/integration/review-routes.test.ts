/**
 * Module 08 HTTP tests.
 *
 * The service tests prove the rules hold; these prove they hold *at the edge*,
 * where a hand-crafted request and a disabled button look identical:
 *   - the peer-review window is enforced server-side (409, not a greyed button)
 *   - a comment that is too short is refused even when posted directly
 *   - a reviewer can read their own queue and nobody else's
 *   - an Entry Rule decision can only be recorded by the two seats the rule names
 *   - a rule change can never be proposed for the current cycle
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { insertOne } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { createCycle } from '../../db/repositories/calendar';
import { buildServer } from '../../server/index';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import type { RoleType, ScopeType } from '../../core/types';

const CYCLE_START = '2026-01-01';
const REVIEW_DAY = addDays(CYCLE_START, 86); // cycle day 87 — inside Days 86–88
const PITCH_DAY = addDays(CYCLE_START, 82); // cycle day 83 — the window is shut
const TRIAL_DUE = '2026-04-01';

let db: Database;
let app: FastifyInstance;
let closedApp: FastifyInstance;
let orgId: string;
let cycleId: string;
let pitchId: string;
let atlasId: string;
let emberId: string;
let validatorId: string;
let leadId: string;
let hubId: string;
let architectId: string;

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

const LONG_COMMENT =
  'Delivered both targets, evidenced them in the dashboard, and explained the ' +
  'one miss honestly. The next plan is ambitious but backed by the capacity ' +
  'this pod actually has, and the coach is engaged.';

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });

  atlasId = (await createPod(db, { holdingId: holding.id, name: 'Pod Atlas' })).id;
  const basaltId = (await createPod(db, { holdingId: holding.id, name: 'Pod Basalt' })).id;
  const cinderId = (await createPod(db, { holdingId: holding.id, name: 'Pod Cinder' })).id;
  emberId = (await createPod(db, { holdingId: holding.id, name: 'Pod Ember', status: 'trial' })).id;

  const makeUser = async (email: string, name: string) =>
    (await createUser(db, { orgId, email, fullName: name })).id;

  leadId = await makeUser('route-lead@example.org', 'Lena Lead');
  validatorId = await makeUser('route-validator@example.org', 'Vera Validator');
  hubId = await makeUser('route-hub@example.org', 'Hana Hub');
  architectId = await makeUser('route-architect@example.org', 'Ari Architect');
  const memberId = await makeUser('route-member@example.org', 'Mo Member');
  const peerA = await makeUser('route-peera@example.org', 'Omar Ops');
  const peerB = await makeUser('route-peerb@example.org', 'Nadia Nine');
  const peerC = await makeUser('route-peerc@example.org', 'Eli Ember');

  const role = (userId: string, roleType: RoleType, scopeType: ScopeType, scopeId: string | null) =>
    assignRole(db, { userId, roleType, scopeType, scopeId, startDate: CYCLE_START });
  const member = (podId: string, userId: string) =>
    addPodMember(db, { podId, userId, joinedAt: CYCLE_START });

  await member(atlasId, leadId);
  await member(atlasId, memberId);
  await member(basaltId, validatorId);
  await member(basaltId, peerA);
  await member(cinderId, peerB);
  await member(emberId, peerC);

  await role(leadId, 'pod_member', 'pod', atlasId);
  await role(leadId, 'pod_lead', 'pod', atlasId);
  await role(memberId, 'pod_member', 'pod', atlasId);
  await role(validatorId, 'pod_member', 'pod', basaltId);
  await role(validatorId, 'peer_validator', 'pod', basaltId);
  await role(peerA, 'pod_lead', 'pod', basaltId);
  await role(peerB, 'pod_lead', 'pod', cinderId);
  await role(peerC, 'pod_lead', 'pod', emberId);
  await role(hubId, 'hub_deployment', 'org', null);
  await role(architectId, 'hub_architecture', 'org', null);

  const cycle = await createCycle(db, {
    orgId,
    holdingId: null,
    cycleNumber: 1,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });
  cycleId = cycle.id;

  pitchId = (
    await insertOne<{ id: string }>(
      db,
      `INSERT INTO pitch (pod_id, cycle_id, status, previous_summary, next_plan, submitted_at, submitted_by)
       VALUES ($1, $2, 'submitted', 'Shipped the pilot.', 'Scale to two customers.', now(), $3)
       RETURNING id`,
      [atlasId, cycleId, leadId],
    )
  ).id;

  app = await buildServer({ db, runMigrations: false, logger: false, env: { TODAY: REVIEW_DAY } });
  await app.ready();
  closedApp = await buildServer({
    db,
    runMigrations: false,
    logger: false,
    env: { TODAY: PITCH_DAY },
  });
  await closedApp.ready();
});

afterAll(async () => {
  await app.close();
  await closedApp.close();
  await db.close();
});

describe('access control', () => {
  it('refuses anonymous callers', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/review/queue?reviewerUserId=${validatorId}` });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a pod member who does not hold the Peer Validator seat', async () => {
    const member = await login(app, 'route-member@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/review/queue?reviewerUserId=${validatorId}`,
      headers: bearer(member),
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a validator read their own queue but not somebody else’s', async () => {
    const validator = await login(app, 'route-validator@example.org');
    const own = await app.inject({
      method: 'GET',
      url: `/api/review/queue?reviewerUserId=${validatorId}`,
      headers: bearer(validator),
    });
    expect(own.statusCode, own.body).toBe(200);

    const someoneElse = await app.inject({
      method: 'GET',
      url: `/api/review/queue?reviewerUserId=${leadId}`,
      headers: bearer(validator),
    });
    expect(someoneElse.statusCode).toBe(403);
  });
});

describe('submitting a review over HTTP', () => {
  async function assignValidators(target: FastifyInstance): Promise<void> {
    const architect = await login(target, 'route-architect@example.org');
    const response = await target.inject({
      method: 'POST',
      url: '/api/review/assignments',
      headers: bearer(architect),
      payload: { cycleId },
    });
    expect(response.statusCode, response.body).toBe(200);
  }

  it('assigns an impartial panel and shows it in the queue', async () => {
    await assignValidators(app);
    const validator = await login(app, 'route-validator@example.org');
    const queue = await app.inject({
      method: 'GET',
      url: `/api/review/queue?reviewerUserId=${validatorId}`,
      headers: bearer(validator),
    });
    const data = queue.json<{ data: { items: Array<{ pitchId: string }>; windowOpen: boolean } }>().data;
    expect(data.windowOpen).toBe(true);
    expect(data.items.map((item) => item.pitchId)).toEqual([pitchId]);
  });

  it('refuses a submission outside the Days 86–88 window', async () => {
    const validator = await login(closedApp, 'route-validator@example.org');
    const response = await closedApp.inject({
      method: 'POST',
      url: `/api/review/${pitchId}/score`,
      headers: bearer(validator),
      payload: { score: 80, comments: LONG_COMMENT, submit: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe('window_closed');
  });

  it('refuses a bare number with no real justification', async () => {
    const validator = await login(app, 'route-validator@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/review/${pitchId}/score`,
      headers: bearer(validator),
      payload: { score: 80, comments: 'Looks fine', submit: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/at least 140 characters/);
  });

  it('accepts a complete review and refuses a second one', async () => {
    const validator = await login(app, 'route-validator@example.org');
    const first = await app.inject({
      method: 'POST',
      url: `/api/review/${pitchId}/score`,
      headers: bearer(validator),
      payload: { score: 84, comments: LONG_COMMENT, submit: true },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json<{ data: { status: string } }>().data.status).toBe('submitted');

    const second = await app.inject({
      method: 'POST',
      url: `/api/review/${pitchId}/score`,
      headers: bearer(validator),
      payload: { score: 10, comments: LONG_COMMENT, submit: true },
    });
    expect(second.statusCode).toBe(403);
  });
});

describe('the Entry Rule decision over HTTP', () => {
  it('only the Deployment Hub can record the hub’s half', async () => {
    const hub = await login(app, 'route-hub@example.org');
    const started = await app.inject({
      method: 'POST',
      url: `/api/review/entry/${emberId}/start`,
      headers: bearer(hub),
      payload: { startDate: CYCLE_START, criteria: [{ label: 'Delivered the pilot', met: true }] },
    });
    expect(started.statusCode, started.body).toBe(201);

    const lead = await login(app, 'route-lead@example.org');
    const refused = await app.inject({
      method: 'POST',
      url: `/api/review/entry/${emberId}/decision`,
      headers: bearer(lead),
      payload: { side: 'hub', recommendation: 'join' },
    });
    // Atlas's lead holds no seat over Ember at all.
    expect(refused.statusCode).toBe(403);
  });
});

describe('rule changes over HTTP', () => {
  it('refuses to take effect in the current cycle', async () => {
    const architect = await login(app, 'route-architect@example.org');
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/rules/propose',
      headers: bearer(architect),
      payload: {
        ruleName: 'review.comment_min_length',
        newValue: 200,
        justification: 'Longer comments help pods improve.',
        effectiveCycleNumber: 1,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/future cycle/);
  });

  it('records a future-cycle change, visibly', async () => {
    const architect = await login(app, 'route-architect@example.org');
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/rules/propose',
      headers: bearer(architect),
      payload: {
        ruleName: 'review.comment_min_length',
        newValue: 200,
        justification: 'Longer comments help pods improve.',
        effectiveCycleNumber: 2,
      },
    });
    expect(response.statusCode, response.body).toBe(201);

    const history = await app.inject({
      method: 'GET',
      url: '/api/hub/rules/history',
      headers: bearer(architect),
    });
    const rows = history.json<{ data: Array<{ ruleName: string; oldValue: unknown }> }>().data;
    expect(rows[0]?.ruleName).toBe('review.comment_min_length');
  });

  it('keeps the registry readable, with the formula marked as recorded-only', async () => {
    const architect = await login(app, 'route-architect@example.org');
    const response = await app.inject({
      method: 'GET',
      url: '/api/hub/rules',
      headers: bearer(architect),
    });
    expect(response.statusCode).toBe(200);
    const rules = response.json<{ data: Array<{ key: string; source: string }> }>().data;
    expect(rules.find((rule) => rule.key === 'budget.formula_weights')?.source).toBe('recorded');
  });

  it('is not a place where a pod member rewrites the rules', async () => {
    const member = await login(app, 'route-member@example.org');
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/rules/propose',
      headers: bearer(member),
      payload: {
        ruleName: 'review.comment_min_length',
        newValue: 0,
        justification: 'Remove the comment requirement entirely.',
        effectiveCycleNumber: 2,
      },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('the two tracks never render as one', () => {
  it('a trial pod is refused by the accountability endpoints', async () => {
    const hub = await login(app, 'route-hub@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/review/accountability/${emberId}/open`,
      headers: bearer(hub),
      payload: {},
    });
    expect(response.statusCode).toBe(409);
  });
});
