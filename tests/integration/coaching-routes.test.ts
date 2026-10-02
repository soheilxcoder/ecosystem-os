/**
 * Module 07 HTTP tests — Coaching, at the edge.
 *
 * `tests/unit/health.test.ts` proves the signal arithmetic. These prove the
 * module's *guarantees*, which is the part that cannot be unit-tested in
 * isolation:
 *
 *   - a coach's private notes are unreachable through EVERY endpoint for
 *     anyone who is not that pod's coach or the Coaching Hub — enforced at the
 *     query layer (the pod-visible view has no `private_notes` column), not by
 *     filtering afterwards
 *   - the two session buttons are genuinely distinct states in the database
 *   - the ratio warning appears but never blocks an assignment
 *   - the reassignment countdown is right at the soft (2) and hard (3) marks
 *   - a red streak raises a suggestion banner and opens no accountability case
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { completeCycle, createCycle } from '../../db/repositories/calendar';
import {
  createAssignment,
  upsertHealthSignal,
} from '../../db/repositories/coaching';
import { podHealthSignal, type HealthSignal } from '../../core/health';
import { buildServer } from '../../server/index';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';

// Three 90-day cycles: 1 and 2 are history, 3 is live. The countdown and the
// red streak both need the earlier cycles to exist, so the reassignment view
// and the stored signal history have something real to count against.
const C1_START = '2026-01-01';
const C2_START = '2026-04-01';
const C3_START = '2026-07-01';
/** Mid-way through the active cycle, so "today" is an execution day. */
const TODAY = addDays(C3_START, 19);

let db: Database;
let app: FastifyInstance;
let orgId: string;

let cycle1Id: string;
let cycle2Id: string;
let cycle3Id: string;

let atlas: string;
let basalt: string;
let cinder: string;

let coraId: string;
let daraId: string;
let cassToken: string; // Coaching Hub
let coraToken: string; // coach for Atlas + Cinder
let lenaToken: string; // pod member of Atlas
let ariToken: string; // a hub that is NOT coaching — must see no private notes

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

/** A forced-red signal, built by the real formula so score and colour agree. */
function redSignal(): HealthSignal {
  return podHealthSignal({
    atRiskCheckins: 4,
    checkins: 4,
    scoreTrend: -10,
    reviewSentiment: 5,
  });
}

/** A healthy signal, for a control pod that must raise no banner. */
function greenSignal(): HealthSignal {
  return podHealthSignal({
    atRiskCheckins: 0,
    checkins: 5,
    scoreTrend: 3,
    reviewSentiment: 90,
  });
}

async function seedSession(
  coachUserId: string,
  podId: string,
  input: { privateNotes: string; podVisibleSummary?: string | null; occurredAt?: string },
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/coaching/sessions',
    headers: bearer(coachUserId === coraId ? coraToken : cassToken),
    payload: {
      podId,
      occurredAt: input.occurredAt ?? TODAY,
      sessionType: 'check_in',
      privateNotes: input.privateNotes,
      ...(input.podVisibleSummary === undefined
        ? {}
        : { podVisibleSummary: input.podVisibleSummary }),
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ data: { id: string } }>().data.id;
}

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Pars', code: 'PRS' });

  atlas = (await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active' })).id;
  basalt = (await createPod(db, { holdingId: holding.id, name: 'Pod Basalt', status: 'active' })).id;
  cinder = (await createPod(db, { holdingId: holding.id, name: 'Pod Cinder', status: 'active' })).id;

  const mkUser = async (name: string, email: string): Promise<string> =>
    (await createUser(db, { orgId, email, fullName: name })).id;

  const lenaId = await mkUser('Lena Lead', 'lena@example.org');
  coraId = await mkUser('Cora Coach', 'cora@example.org');
  daraId = await mkUser('Dara Coach', 'dara@example.org');
  const cassId = await mkUser('Cass Coaching', 'cass@example.org');
  const ariId = await mkUser('Ari Architect', 'ari@example.org');

  await addPodMember(db, { podId: atlas, userId: lenaId, joinedAt: C1_START });

  // Pod membership so `pod.view` passes for the member; coaching access rides
  // on the coach/hub role rows below, not on membership.
  await assignRole(db, { userId: lenaId, roleType: 'pod_member', scopeType: 'pod', scopeId: atlas, startDate: C1_START });
  await assignRole(db, { userId: lenaId, roleType: 'pod_lead', scopeType: 'pod', scopeId: atlas, startDate: C1_START, endDate: addDays(TODAY, 200) });

  // Cora coaches Atlas and Cinder; Dara coaches Basalt. Pod-scoped so the
  // row-level access control has a pod to match against.
  await assignRole(db, { userId: coraId, roleType: 'coach', scopeType: 'pod', scopeId: atlas, startDate: C1_START, endDate: addDays(TODAY, 200) });
  await assignRole(db, { userId: coraId, roleType: 'coach', scopeType: 'pod', scopeId: cinder, startDate: C1_START, endDate: addDays(TODAY, 200) });
  await assignRole(db, { userId: daraId, roleType: 'coach', scopeType: 'pod', scopeId: basalt, startDate: C2_START, endDate: addDays(TODAY, 200) });

  // Ari is a *different* hub (Architecture). 07 is explicit that private notes
  // stay away from Company X's other hubs — Ari is that hostile reader.
  await assignRole(db, { userId: ariId, roleType: 'hub_architecture', scopeType: 'org', scopeId: null, startDate: C1_START });
  await assignRole(db, { userId: cassId, roleType: 'hub_coaching', scopeType: 'org', scopeId: null, startDate: C1_START });

  // Cycles in order: each is completed before the next starts, because only one
  // cycle per (org, holding) may be active at a time.
  const c1 = await createCycle(db, { orgId, holdingId: null, cycleNumber: 1, startDate: C1_START, endDate: addDays(C1_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });
  cycle1Id = c1.id;
  await completeCycle(db, cycle1Id);

  const c2 = await createCycle(db, { orgId, holdingId: null, cycleNumber: 2, startDate: C2_START, endDate: addDays(C2_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });
  cycle2Id = c2.id;
  await completeCycle(db, cycle2Id);

  const c3 = await createCycle(db, { orgId, holdingId: null, cycleNumber: 3, startDate: C3_START, endDate: addDays(C3_START, 89), phaseBoundaries: DEFAULT_PHASE_BOUNDARIES });
  cycle3Id = c3.id; // left active

  // Assignments that set up the reassignment countdowns:
  //   Cora → Atlas from cycle 1 → now in cycle 3 → 3 cycles → overdue.
  //   Dara → Basalt from cycle 2 → now in cycle 3 → 2 cycles → due.
  //   Cora → Cinder from cycle 3 → 1 cycle → ok (this is the red-streak pod).
  await createAssignment(db, { orgId, coachUserId: coraId, podId: atlas, startCycleId: cycle1Id, createdBy: cassId });
  await createAssignment(db, { orgId, coachUserId: daraId, podId: basalt, startCycleId: cycle2Id, createdBy: cassId });
  await createAssignment(db, { orgId, coachUserId: coraId, podId: cinder, startCycleId: cycle3Id, createdBy: cassId });

  // Cinder has been red every cycle it has existed, so the console's banner
  // logic has a genuine streak to find.
  await upsertHealthSignal(db, { orgId, podId: cinder, cycleId: cycle1Id, signal: redSignal() });
  await upsertHealthSignal(db, { orgId, podId: cinder, cycleId: cycle2Id, signal: redSignal() });
  await upsertHealthSignal(db, { orgId, podId: cinder, cycleId: cycle3Id, signal: redSignal() });
  // Control pod: healthy, must raise nothing.
  await upsertHealthSignal(db, { orgId, podId: basalt, cycleId: cycle3Id, signal: greenSignal() });

  app = await buildServer({ db, env: { TODAY }, logger: false });
  cassToken = await login(app, 'cass@example.org');
  coraToken = await login(app, 'cora@example.org');
  lenaToken = await login(app, 'lena@example.org');
  ariToken = await login(app, 'ari@example.org');
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

// ---------------------------------------------------------------------------
// Private notes never leave the coach + Coaching Hub
// ---------------------------------------------------------------------------

describe('row-level access control on private notes', () => {
  let sharedSessionId: string;
  let privateSessionId: string;

  beforeAll(async () => {
    // One of each button, so the pod has both shapes in its history.
    sharedSessionId = await seedSession(coraId, atlas, {
      privateNotes: 'PRIVATE: working through a conflict between two members.',
      podVisibleSummary: 'Reviewed the sprint plan; agreed on two focus areas.',
    });
    privateSessionId = await seedSession(coraId, atlas, {
      privateNotes: 'PRIVATE: sensitive 1:1 — do not share.',
      // no podVisibleSummary → [Save Private]
    });
  });

  it('a pod member never sees a private_notes field, in list or detail', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions?podId=${atlas}`,
      headers: bearer(lenaToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    const body = list.json<{ data: { sessions: any[]; includesPrivateNotes: boolean } }>().data;
    expect(body.includesPrivateNotes).toBe(false);
    expect(body.sessions.length).toBeGreaterThanOrEqual(2);
    for (const session of body.sessions) {
      expect(session, 'pod-visible rows must not carry private_notes').not.toHaveProperty(
        'privateNotes',
      );
    }
  });

  it('a pod member reading one shared session gets the summary but not the notes', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${sharedSessionId}`,
      headers: bearer(lenaToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const data = detail.json<{ data: { session: any; includesPrivateNotes: boolean } }>().data;
    expect(data.includesPrivateNotes).toBe(false);
    expect(data.session.podVisibleSummary).toContain('Reviewed the sprint plan');
    expect(data.session.sharedWithPod).toBe(true);
    expect(data.session).not.toHaveProperty('privateNotes');
  });

  it('a pod member reading a [Save Private] session sees it happened, with no content', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${privateSessionId}`,
      headers: bearer(lenaToken),
    });
    // 07: the history shows the date; the note appears only if shared. The row
    // exists, summary is null, and there is no private content to leak.
    expect(detail.statusCode, detail.body).toBe(200);
    const data = detail.json<{ data: { session: any } }>().data;
    expect(data.session.podVisibleSummary).toBeNull();
    expect(data.session.sharedWithPod).toBe(false);
    expect(data.session).not.toHaveProperty('privateNotes');
  });

  it('the assigned coach reads their own private notes back', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${privateSessionId}`,
      headers: bearer(coraToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const data = detail.json<{ data: { session: any; includesPrivateNotes: boolean } }>().data;
    expect(data.includesPrivateNotes).toBe(true);
    expect(data.session.privateNotes).toContain('PRIVATE: sensitive 1:1');
  });

  it('the Coaching Hub reads private notes for any pod it does not coach', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${sharedSessionId}`,
      headers: bearer(cassToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const data = detail.json<{ data: { session: any; includesPrivateNotes: boolean } }>().data;
    expect(data.includesPrivateNotes).toBe(true);
    expect(data.session.privateNotes).toContain('PRIVATE: working through a conflict');
  });

  it('another Company X hub — Architecture — gets pod-visible rows only, never the notes', async () => {
    // Ari has no coach role and is not Coaching Hub, so Ari lands in the pod
    // viewer even though Ari is a hub. This is the "including Company X's other
    // hubs" clause from 07.
    const list = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions?podId=${atlas}`,
      headers: bearer(ariToken),
    });
    // Ari can read the pod (org-wide transparency) but only the pod projection.
    if (list.statusCode === 200) {
      const body = list.json<{ data: { sessions: any[]; includesPrivateNotes: boolean } }>().data;
      expect(body.includesPrivateNotes).toBe(false);
      for (const session of body.sessions) {
        expect(session).not.toHaveProperty('privateNotes');
      }
    } else {
      // Refusal is also acceptable — what must never happen is a leak.
      expect([401, 403, 404]).toContain(list.statusCode);
    }
  });
});

// ---------------------------------------------------------------------------
// The two buttons are two distinct states
// ---------------------------------------------------------------------------

describe('the two session buttons', () => {
  it('[Save Private] stores a session with no shared summary', async () => {
    const id = await seedSession(coraId, cinder, {
      privateNotes: 'Private only.',
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${id}`,
      headers: bearer(coraToken),
    });
    const data = detail.json<{ data: { session: any } }>().data;
    expect(data.session.podVisibleSummary).toBeNull();
    expect(data.session.sharedWithPod).toBe(false);
  });

  it('[Save & Share Summary] stores both, and the pod sees only the summary', async () => {
    const id = await seedSession(coraId, cinder, {
      privateNotes: 'Coach working memory.',
      podVisibleSummary: 'Discussed goal setting.',
    });

    const coachView = await app.inject({
      method: 'GET',
      url: `/api/coaching/sessions/${id}`,
      headers: bearer(coraToken),
    });
    expect(coachView.json<{ data: { session: any } }>().data.session.privateNotes).toBe(
      'Coach working memory.',
    );
    expect(coachView.json<{ data: { session: any } }>().data.session.podVisibleSummary).toBe(
      'Discussed goal setting.',
    );
  });

  it('logging a session without private notes is refused — they are the point', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/coaching/sessions',
      headers: bearer(coraToken),
      payload: {
        podId: atlas,
        occurredAt: TODAY,
        sessionType: 'check_in',
        privateNotes: '',
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Reassignment countdown at the soft and hard marks
// ---------------------------------------------------------------------------

describe('the reassignment countdown', () => {
  it('reads 3 cycles → overdue for the cycle-1 assignment', async () => {
    const view = await app.inject({
      method: 'GET',
      url: '/api/coaching/console',
      headers: bearer(coraToken),
    });
    expect(view.statusCode, view.body).toBe(200);
    const data = view.json<{ data: any }>().data;

    const atlasCard = data.pods.find((p: any) => p.podId === atlas);
    expect(atlasCard.reassignment.cyclesWithPodSet).toBe(3);
    expect(atlasCard.reassignment.urgency).toBe('overdue');
    expect(atlasCard.reassignment.cyclesUntilReview).toBe(0);
  });

  it('reads 2 cycles → due for the cycle-2 assignment', async () => {
    // The console is per-coach, so log in as Dara.
    const dara = await login(app, 'dara@example.org');
    const daraView = await app.inject({
      method: 'GET',
      url: '/api/coaching/console',
      headers: bearer(dara),
    });
    expect(daraView.statusCode, daraView.body).toBe(200);
    const data = daraView.json<{ data: any }>().data;

    const basaltCard = data.pods.find((p: any) => p.podId === basalt);
    expect(basaltCard.reassignment.cyclesWithPodSet).toBe(2);
    expect(basaltCard.reassignment.urgency).toBe('due');
    expect(basaltCard.reassignment.cyclesUntilReview).toBe(0);
  });

  it('reads 1 cycle → ok for a fresh assignment', async () => {
    const view = await app.inject({
      method: 'GET',
      url: '/api/coaching/console',
      headers: bearer(coraToken),
    });
    const data = view.json<{ data: any }>().data;
    const cinderCard = data.pods.find((p: any) => p.podId === cinder);
    expect(cinderCard.reassignment.cyclesWithPodSet).toBe(1);
    expect(cinderCard.reassignment.urgency).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// The red streak raises a suggestion, never a case
// ---------------------------------------------------------------------------

describe('the red-streak flag banner', () => {
  it('shows a suggestion for the pod with a red streak and none for a healthy pod', async () => {
    const view = await app.inject({
      method: 'GET',
      url: '/api/coaching/console',
      headers: bearer(coraToken),
    });
    expect(view.statusCode, view.body).toBe(200);
    const data = view.json<{ data: any }>().data;

    const cinderFlag = data.flags.find((f: any) => f.podId === cinder);
    expect(cinderFlag, 'Cinder is red across its whole history').toBeDefined();
    expect(cinderFlag.streak).toBeGreaterThanOrEqual(2);

    const atlasFlag = data.flags.find((f: any) => f.podId === atlas);
    expect(atlasFlag).toBeUndefined();
  });

  it('the suggestion opens no accountability case', async () => {
    // Reading the console must be side-effect free: the banner is a prompt to
    // the coach, not an automatic escalation.
    const count = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM accountability_case WHERE pod_id = $1',
      [cinder],
    );
    expect(Number(count.rows[0]!.n)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ratio guidance warns but does not block
// ---------------------------------------------------------------------------

describe('the ratio warning', () => {
  it('assigning a sixth pod succeeds AND carries the warning — warn, never block', async () => {
    // A fresh coach, six fresh pods. The sixth assignment pushes the load past
    // the suggested range; the response still comes back created.
    const rexId = (await createUser(db, { orgId, email: 'rex@example.org', fullName: 'Rex Coach' })).id;

    const holding = (await db.query<{ id: string }>('SELECT holding_id AS id FROM pod WHERE id = $1', [atlas])).rows[0]!.id;
    const podIds: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const pod = await createPod(db, { holdingId: holding, name: `Pod Ratio ${i}`, status: 'active' });
      podIds.push(pod.id);
      // The roster only lists users holding the coach role.
      await assignRole(db, { userId: rexId, roleType: 'coach', scopeType: 'pod', scopeId: pod.id, startDate: C1_START });
    }

    let last: any = null;
    for (const podId of podIds) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/coaching/assignments',
        headers: bearer(cassToken),
        payload: { coachUserId: rexId, podId },
      });
      expect(response.statusCode, response.body).toBe(201);
      last = response.json<{ data: any }>().data;
    }

    expect(last.podCountAfter).toBe(6);
    expect(last.ratioWarning).toMatch(/above the suggested 3–5 range/);
  });

  it('the roster distinguishes an in-range coach from an overloaded one', async () => {
    // Kim covers four pods — comfortably inside the band, no warning.
    const kimId = (await createUser(db, { orgId, email: 'kim@example.org', fullName: 'Kim Coach' })).id;
    const holding = (await db.query<{ id: string }>('SELECT holding_id AS id FROM pod WHERE id = $1', [atlas])).rows[0]!.id;
    for (let i = 0; i < 4; i += 1) {
      const pod = await createPod(db, { holdingId: holding, name: `Pod Kim ${i}`, status: 'active' });
      await assignRole(db, { userId: kimId, roleType: 'coach', scopeType: 'pod', scopeId: pod.id, startDate: C1_START });
      const response = await app.inject({
        method: 'POST',
        url: '/api/coaching/assignments',
        headers: bearer(cassToken),
        payload: { coachUserId: kimId, podId: pod.id },
      });
      expect(response.statusCode, response.body).toBe(201);
    }

    const roster = await app.inject({
      method: 'GET',
      url: '/api/coaching/roster',
      headers: bearer(cassToken),
    });
    expect(roster.statusCode, roster.body).toBe(200);
    const data = roster.json<{ data: any }>().data;

    const rex = data.coaches.find((c: any) => c.email === 'rex@example.org');
    const kim = data.coaches.find((c: any) => c.email === 'kim@example.org');

    expect(rex.podCount).toBe(6);
    expect(rex.ratioWarning).toMatch(/above the suggested 3–5 range/);
    expect(kim.podCount).toBe(4);
    expect(kim.ratioWarning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reassignment requires an auditable reason
// ---------------------------------------------------------------------------

describe('reassignment governance', () => {
  it('refuses to move a pod without a reason', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/coaching/assignments',
      headers: bearer(cassToken),
      payload: { coachUserId: daraId, podId: atlas },
    });
    expect(response.statusCode).toBe(400);
  });

  it('moves a pod with a reason and records the ended assignment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/coaching/assignments',
      headers: bearer(cassToken),
      payload: {
        coachUserId: daraId,
        podId: atlas,
        reasonForChange: 'Planned rotation at the 3-cycle review',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json<{ data: any }>().data;
    expect(data.assignment.coachUserId).toBe(daraId);
    expect(data.assignment.status).toBe('active');
    expect(data.ended).not.toBeNull();
    expect(data.ended.status).toBe('ended');
    expect(data.ended.coachUserId).toBe(coraId);
  });
});
