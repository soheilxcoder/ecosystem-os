/**
 * Phase 6 HTTP + wiring tests — Notifications (11) and Archive (10), at the edge.
 *
 * The guarantee under test is the one both modules share: a single domain-event
 * stream fans out to a dispatcher that routes "who is told" and an indexer that
 * records "what is remembered", with no manual trigger anywhere.
 *
 * What these prove:
 *   - every canonical trigger from 11 produces a correctly routed, correctly
 *     urgent notification the moment its event is published
 *   - every indexable decision lands in the archive, searchable, with a deep
 *     link back to its source module
 *   - a Needs-Action item clears only when its underlying action is actually
 *     done (no dismiss flag)
 *   - urgent items can never be muted in-app — not by preference, not by API
 *   - the archive can never leak a coach's private notes
 *   - replayed events (same source_event_id) cannot duplicate a notification or
 *     an index entry
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import type { ServerContext } from '../../server/index';
import { buildServer, createServerContext } from '../../server/index';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod, createPodLeadTerm, upsertPitchDraft } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { createCycle } from '../../db/repositories/calendar';
import { createBudgetCycle } from '../../db/repositories/budget';
import { createAgreement } from '../../db/repositories/agreements';
import { createAssignment } from '../../db/repositories/coaching';
import { assignReview } from '../../db/repositories/review';
import { addPanelMember, createAccountabilityCase } from '../../db/repositories/governance';
import { listNotificationsForUser, countUnread } from '../../db/repositories/notifications';
import { searchArchive, listArchiveActivity } from '../../db/repositories/archive';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import { addDays } from '../../core/time';

const CYCLE_START = '2026-07-01';
// Day 87 of the 90-day cycle — inside the Day 86–88 peer-review submission
// window, so the Needs-Action test can submit a review through the real
// endpoint instead of faking the entity state.
const TODAY = addDays(CYCLE_START, 86);

let db: Database;
let app: FastifyInstance;
let context: ServerContext;
let orgId: string;

let cycleId: string;
let budgetCycleId: string;

let atlas: string;
let basalt: string;

let lenaId: string; // Atlas lead + member
let mikaId: string; // Atlas member
let rexId: string; // Basalt lead
let veraId: string; // peer validator (assigned to Atlas pitch)
let coraId: string; // Atlas coach
let cassId: string; // Coaching Hub
let depId: string; // Deployment Hub

let agreementId: string;
let caseId: string;
let reviewId: string;
let pitchId: string;

let lenaToken: string;
let veraToken: string;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function login(email: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email } });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

/** Publish a domain event on the shared bus (the way every module does). */
async function emit(
  type: string,
  input: { aggregateType?: string; aggregateId?: string | null; actorUserId?: string | null; payload?: Record<string, unknown> },
) {
  return context.bus.publish({
    type,
    aggregateType: input.aggregateType ?? null,
    aggregateId: input.aggregateId ?? null,
    orgId,
    actorUserId: input.actorUserId ?? null,
    payload: input.payload ?? {},
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Pars', code: 'PRS' });

  const cycle = await createCycle(db, {
    orgId,
    holdingId: null,
    cycleNumber: 3,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });
  cycleId = cycle.id;

  const budget = await createBudgetCycle(db, {
    orgId,
    cycleId,
    cycleNumber: 3,
    totalPool: 1_000_000_000,
    formulaWeights: { financial: 40, peer_review: 35, strategic: 25 },
  });
  budgetCycleId = budget!.id;

  atlas = (await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active' })).id;
  basalt = (await createPod(db, { holdingId: holding.id, name: 'Pod Basalt', status: 'active' })).id;

  const mkUser = async (name: string, email: string): Promise<string> =>
    (await createUser(db, { orgId, email, fullName: name })).id;

  lenaId = await mkUser('Lena Lead', 'lena@example.org');
  mikaId = await mkUser('Mika Member', 'mika@example.org');
  rexId = await mkUser('Rex Lead', 'rex@example.org');
  veraId = await mkUser('Vera Validator', 'vera@example.org');
  coraId = await mkUser('Cora Coach', 'cora@example.org');
  cassId = await mkUser('Cass Coaching', 'cass@example.org');
  depId = await mkUser('Dee Deployment', 'dep@example.org');

  await addPodMember(db, { podId: atlas, userId: lenaId, joinedAt: CYCLE_START });
  await addPodMember(db, { podId: atlas, userId: mikaId, joinedAt: CYCLE_START });
  await addPodMember(db, { podId: basalt, userId: rexId, joinedAt: CYCLE_START });

  // Roles.
  await assignRole(db, { userId: lenaId, roleType: 'pod_member', scopeType: 'pod', scopeId: atlas, startDate: CYCLE_START });
  await assignRole(db, { userId: lenaId, roleType: 'pod_lead', scopeType: 'pod', scopeId: atlas, startDate: CYCLE_START, endDate: addDays(TODAY, 200) });
  await assignRole(db, { userId: mikaId, roleType: 'pod_member', scopeType: 'pod', scopeId: atlas, startDate: CYCLE_START });
  await assignRole(db, { userId: rexId, roleType: 'pod_lead', scopeType: 'pod', scopeId: basalt, startDate: CYCLE_START, endDate: addDays(TODAY, 200) });
  // Vera validates from outside Atlas (a reviewer must not be an insider), so her
  // seat is scoped to Basalt.
  await assignRole(db, { userId: veraId, roleType: 'peer_validator', scopeType: 'pod', scopeId: basalt, startDate: CYCLE_START });
  await assignRole(db, { userId: coraId, roleType: 'coach', scopeType: 'pod', scopeId: atlas, startDate: CYCLE_START, endDate: addDays(TODAY, 200) });
  await assignRole(db, { userId: cassId, roleType: 'hub_coaching', scopeType: 'org', scopeId: null, startDate: CYCLE_START });
  await assignRole(db, { userId: depId, roleType: 'hub_deployment', scopeType: 'org', scopeId: null, startDate: CYCLE_START });

  // Current lead terms (so recipient resolution finds a lead for each pod).
  await createPodLeadTerm(db, { podId: atlas, cycleId, userId: lenaId, startDate: CYCLE_START, endDate: addDays(TODAY, 200) });
  await createPodLeadTerm(db, { podId: basalt, cycleId, userId: rexId, startDate: CYCLE_START, endDate: addDays(TODAY, 200) });

  // Coach assigned to Atlas (health-red and stage-advanced go to the coach).
  await createAssignment(db, { orgId, coachUserId: coraId, podId: atlas, startCycleId: cycleId });

  // A pitch for Atlas this cycle (archive + review target).
  const pitch = await upsertPitchDraft(db, {
    podId: atlas,
    cycleId,
    previousSummary: 'Built the onboarding flow.',
    nextPlan: 'Ship the onboarding flow and cut drop-off.',
  });
  pitchId = pitch.id;

  // Vera owes a review of Atlas's pitch.
  const review = await assignReview(db, { cycleId, pitchId, reviewerUserId: veraId });
  reviewId = review!.id;

  // A proposed CLOU Atlas → Basalt, awaiting Basalt (Rex).
  const agreement = await createAgreement(db, {
    orgId,
    podAId: atlas,
    podBId: basalt,
    terms: {
      name: 'Atlas ↔ Basalt — shared QA',
      serviceDescription: 'shared QA',
      direction: 'a_to_b',
      cadence: 'recurring',
      frequency: 'weekly',
      pricingTerms: { model: 'fixed_fee', amount: '1000' },
    },
    status: 'proposed',
    awaitingPodId: basalt,
    createdByUserId: lenaId,
  });
  agreementId = agreement.id;

  // An open accountability case for Atlas with a two-person panel.
  const accountability = await createAccountabilityCase(db, { orgId, podId: atlas });
  caseId = accountability.id;
  await addPanelMember(db, caseId, rexId, 'Peer Pod Lead — Pod Basalt');
  await addPanelMember(db, caseId, cassId, 'Coaching Hub representative');

  // The server under test: building it wires the dispatcher + indexer to the bus.
  context = await createServerContext({ db, runMigrations: false, env: { TODAY }, logger: false });
  app = await buildServer({ context, logger: false });
  await app.ready();

  lenaToken = await login('lena@example.org');
  veraToken = await login('vera@example.org');
});

afterAll(async () => {
  await app?.close();
  await context?.close();
});

describe('event → notification routing (11)', () => {
  it('pod.lead_elected tells every pod member', async () => {
    await emit('pod.lead_elected', {
      aggregateType: 'pod',
      aggregateId: atlas,
      payload: { winnerUserId: lenaId },
    });
    const lena = await listNotificationsForUser(db, lenaId);
    const hit = lena.find((n) => n.triggerType === 'pod_lead_elected');
    expect(hit).toBeTruthy();
    expect(hit?.urgency).toBe('informational');
    const mika = await listNotificationsForUser(db, mikaId);
    expect(mika.some((n) => n.triggerType === 'pod_lead_elected')).toBe(true);
  });

  it('cloud.agreement_proposed asks the counterparty lead to respond (action-required)', async () => {
    await emit('cloud.agreement_proposed', {
      aggregateType: 'cloud_agreement',
      aggregateId: agreementId,
      actorUserId: lenaId,
      payload: { podAId: atlas, podBId: basalt },
    });
    const rex = await listNotificationsForUser(db, rexId);
    const hit = rex.find((n) => n.triggerType === 'clou_proposal_received');
    expect(hit).toBeTruthy();
    expect(hit?.urgency).toBe('action_required');
    expect(hit?.relatedEntityId).toBe(agreementId);
  });

  it('cloud.agreement_accepted tells the original proposer', async () => {
    await emit('cloud.agreement_accepted', {
      aggregateType: 'cloud_agreement',
      aggregateId: agreementId,
      actorUserId: rexId,
      payload: { podId: basalt },
    });
    const lena = await listNotificationsForUser(db, lenaId);
    const hit = lena.find((n) => n.triggerType === 'clou_response_received');
    expect(hit).toBeTruthy();
    expect(hit?.title).toMatch(/accepted/);
  });

  it('review.assigned tells the assigned reviewer (action-required)', async () => {
    await emit('review.assigned', {
      aggregateType: 'peer_review',
      aggregateId: reviewId,
      payload: { pitchId, reviewerUserId: veraId },
    });
    const vera = await listNotificationsForUser(db, veraId);
    const hit = vera.find((n) => n.triggerType === 'review_assigned');
    expect(hit).toBeTruthy();
    expect(hit?.urgency).toBe('action_required');
  });

  it('review.submitted tells the reviewed pod lead', async () => {
    await emit('review.submitted', { aggregateType: 'pitch', aggregateId: pitchId, payload: { score: 82 } });
    const lena = await listNotificationsForUser(db, lenaId);
    expect(lena.some((n) => n.triggerType === 'review_submitted')).toBe(true);
  });

  it('budget.cycle_locked announces to the whole org', async () => {
    await emit('budget.cycle_locked', {
      aggregateType: 'budget_cycle',
      aggregateId: budgetCycleId,
      payload: { cycleNumber: 3 },
    });
    for (const userId of [lenaId, rexId, veraId, coraId]) {
      const rows = await listNotificationsForUser(db, userId);
      expect(rows.some((n) => n.triggerType === 'budget_results_announced'), `user ${userId}`).toBe(true);
    }
  });

  it('coaching.session_scheduled tells the pod and its coach', async () => {
    await emit('coaching.session_scheduled', {
      aggregateType: 'coaching_session',
      aggregateId: '00000000-0000-4000-8000-0000000000aa',
      payload: { podId: atlas, coachUserId: coraId },
    });
    for (const userId of [lenaId, mikaId, coraId]) {
      const rows = await listNotificationsForUser(db, userId);
      expect(rows.some((n) => n.triggerType === 'coaching_session_scheduled'), `user ${userId}`).toBe(true);
    }
  });

  it('coaching.pod_health_red tells the assigned coach (action-required)', async () => {
    await emit('coaching.pod_health_red', {
      aggregateType: 'pod',
      aggregateId: atlas,
      payload: { podId: atlas, streak: 3 },
    });
    const cora = await listNotificationsForUser(db, coraId);
    const hit = cora.find((n) => n.triggerType === 'pod_health_red');
    expect(hit).toBeTruthy();
    expect(hit?.urgency).toBe('action_required');
  });

  it('coaching.reassignment_due tells the Coaching Hub', async () => {
    await emit('coaching.reassignment_due', {
      aggregateType: 'pod',
      aggregateId: atlas,
      payload: { podId: atlas, coachUserId: coraId },
    });
    const cass = await listNotificationsForUser(db, cassId);
    expect(cass.some((n) => n.triggerType === 'coach_reassignment_due')).toBe(true);
  });

  it('governance.accountability_stage_advanced is urgent and reaches members, coach and panel', async () => {
    await emit('governance.accountability_stage_advanced', {
      aggregateType: 'accountability_case',
      aggregateId: caseId,
      payload: { podId: atlas, from: 'transparency', to: 'reduced_share' },
    });
    for (const userId of [lenaId, mikaId, coraId, rexId, cassId]) {
      const rows = await listNotificationsForUser(db, userId);
      const hit = rows.find((n) => n.triggerType === 'accountability_stage_advanced');
      expect(hit, `user ${userId}`).toBeTruthy();
      expect(hit?.urgency).toBe('urgent');
    }
  });

  it('governance.panel_vote_requested asks each panel member to vote', async () => {
    await emit('governance.panel_vote_requested', {
      aggregateType: 'accountability_case',
      aggregateId: caseId,
      payload: { podId: atlas },
    });
    for (const userId of [rexId, cassId]) {
      const rows = await listNotificationsForUser(db, userId);
      const hit = rows.find((n) => n.triggerType === 'panel_vote_requested');
      expect(hit, `user ${userId}`).toBeTruthy();
      expect(hit?.urgency).toBe('action_required');
    }
  });

  it('governance.rule_change_proposed tells the whole org', async () => {
    await emit('governance.rule_change_proposed', {
      aggregateType: 'org',
      aggregateId: orgId,
      payload: { ruleName: 'formula_weights' },
    });
    const lena = await listNotificationsForUser(db, lenaId);
    expect(lena.some((n) => n.triggerType === 'rule_change_proposed')).toBe(true);
  });

  it('governance.entry_trial_started tells the Deployment Hub and the pod', async () => {
    await emit('governance.entry_trial_started', {
      aggregateType: 'pod',
      aggregateId: atlas,
      payload: { podId: atlas, dueDate: addDays(TODAY, 71) },
    });
    for (const userId of [depId, lenaId]) {
      const rows = await listNotificationsForUser(db, userId);
      expect(rows.some((n) => n.triggerType === 'entry_trial_started'), `user ${userId}`).toBe(true);
    }
  });

  it('governance.entry_trial_due asks the Deployment Hub to decide (action-required)', async () => {
    await emit('governance.entry_trial_due', {
      aggregateType: 'entry_trial',
      aggregateId: basalt,
      payload: { trialId: basalt, podId: basalt, dueDate: TODAY },
    });
    const dep = await listNotificationsForUser(db, depId);
    const hit = dep.find((n) => n.triggerType === 'entry_trial_decision_due');
    expect(hit).toBeTruthy();
    expect(hit?.urgency).toBe('action_required');
    const rex = await listNotificationsForUser(db, rexId);
    expect(rex.some((n) => n.triggerType === 'entry_trial_decision_due')).toBe(true);
  });
});

describe('calendar day-window triggers (11)', () => {
  it('rotation window → every pod member; pitch open/deadline → leads; review due → pending reviewers', async () => {
    await emit('calendar.milestone_reached', {
      aggregateType: 'sprint_cycle',
      aggregateId: cycleId,
      payload: { milestoneType: 'pod_lead_rotation', cycleId },
    });
    expect((await listNotificationsForUser(db, lenaId)).some((n) => n.triggerType === 'pod_lead_rotation_window')).toBe(true);
    expect((await listNotificationsForUser(db, mikaId)).some((n) => n.triggerType === 'pod_lead_rotation_window')).toBe(true);

    await emit('calendar.milestone_reached', {
      aggregateType: 'sprint_cycle',
      aggregateId: cycleId,
      payload: { milestoneType: 'pitch_open', cycleId },
    });
    expect((await listNotificationsForUser(db, lenaId)).some((n) => n.triggerType === 'pitch_window_opened')).toBe(true);

    await emit('calendar.milestone_reached', {
      aggregateType: 'sprint_cycle',
      aggregateId: cycleId,
      payload: { milestoneType: 'pitch_deadline', cycleId },
    });
    const deadline = (await listNotificationsForUser(db, lenaId)).find((n) => n.triggerType === 'pitch_auto_submit_warning');
    expect(deadline?.urgency).toBe('urgent');

    await emit('calendar.milestone_reached', {
      aggregateType: 'sprint_cycle',
      aggregateId: cycleId,
      payload: { milestoneType: 'review_deadline', cycleId },
    });
    const due = (await listNotificationsForUser(db, veraId)).find((n) => n.triggerType === 'peer_review_due');
    expect(due?.urgency).toBe('urgent');
  });
});

describe('event → archive indexing (10)', () => {
  it('a submitted pitch is indexed and searchable with a deep link', async () => {
    await emit('pod.pitch_submitted', {
      aggregateType: 'pitch',
      aggregateId: pitchId,
      payload: { podId: atlas, cycleId, auto: false },
    });
    const results = await searchArchive(db, { orgId, q: 'onboarding' });
    expect(results.length).toBeGreaterThan(0);
    const entry = results.find((r) => r.entityType === 'pitch');
    expect(entry?.entityId).toBe(pitchId);
    expect(entry?.podIds).toContain(atlas);
  });

  it('an accepted CLOU is indexed for both pods', async () => {
    const results = await searchArchive(db, { orgId, entityType: 'cloud', q: 'shared QA' });
    const entry = results.find((r) => r.entityId === agreementId);
    expect(entry).toBeTruthy();
    expect(entry?.podIds).toEqual(expect.arrayContaining([atlas, basalt]));
  });

  it('a locked budget cycle is indexed', async () => {
    const results = await searchArchive(db, { orgId, entityType: 'budget_cycle' });
    expect(results.some((r) => r.entityId === budgetCycleId)).toBe(true);
  });

  it('a rule change is indexed', async () => {
    const results = await searchArchive(db, { orgId, entityType: 'rule_change', q: 'formula_weights' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('an entry trial is indexed', async () => {
    const results = await searchArchive(db, { orgId, entityType: 'entry_trial' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('the activity feed returns entries reverse-chronologically', async () => {
    const items = await listArchiveActivity(db, { orgId });
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1]!.occurredAt >= items[i]!.occurredAt).toBe(true);
    }
  });
});

describe('replay idempotence', () => {
  // An outbox replay re-delivers an event that was already consumed. Publishing
  // once through the bus persists it to the outbox and dispatches it; running
  // the consumer a second time over the same event must then add nothing.
  it('re-dispatching the same event does not duplicate a notification', async () => {
    const { dispatchEvent } = await import('../../server/services/notifications');
    const ctx = { db, today: context.today };

    const fixedId = '00000000-0000-4000-8000-0000000000f1';
    const published = await context.bus.publish({
      id: fixedId,
      type: 'governance.rule_change_proposed',
      aggregateType: 'org',
      aggregateId: orgId,
      orgId,
      actorUserId: null,
      payload: { ruleName: 'replay_probe' },
    });

    await dispatchEvent(ctx, published as never); // the replay

    const lena = await listNotificationsForUser(db, lenaId);
    const probes = lena.filter(
      (n) => n.triggerType === 'rule_change_proposed' && n.sourceEventId === fixedId,
    );
    expect(probes.length).toBe(1);
  });

  it('re-indexing the same event does not duplicate an index entry', async () => {
    const { indexEvent } = await import('../../server/services/archive');
    const ctx = { db, today: context.today };

    const fixedId = '00000000-0000-4000-8000-0000000000f2';
    const published = await context.bus.publish({
      id: fixedId,
      type: 'budget.cycle_locked',
      aggregateType: 'budget_cycle',
      aggregateId: budgetCycleId,
      orgId,
      actorUserId: null,
      payload: { cycleNumber: 3 },
    });

    await indexEvent(ctx, published as never); // the replay

    const rows = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM archive_index_entry WHERE source_event_id = $1',
      [fixedId],
    );
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });
});

describe('Needs-Action clears only when the action is done (11 DoD)', () => {
  it('an assigned review sits in Needs-Action until Vera submits it', async () => {
    // Vera has the review_assigned notification from earlier — it must be actionable.
    let res = await app.inject({ method: 'GET', url: '/api/notifications?tab=needs_action', headers: bearer(veraToken) });
    expect(res.statusCode).toBe(200);
    const needs = res.json<{ data: { items: Array<{ triggerType: string; relatedEntityId: string }> } }>().data.items;
    expect(needs.some((n) => n.triggerType === 'review_assigned')).toBe(true);

    // Vera submits her review through the real endpoint — the action, not a dismiss.
    const submit = await app.inject({
      method: 'POST',
      url: `/api/review/${pitchId}/score`,
      headers: bearer(veraToken),
      payload: {
        score: 84,
        comments:
          'Solid plan with clear, measurable key results. The onboarding focus is well scoped, and the drop-off target looks realistic given what the pod delivered last cycle.',
        rubricAnswers: {},
        submit: true,
      },
    });
    expect(submit.statusCode, submit.body).toBeLessThan(400);

    res = await app.inject({ method: 'GET', url: '/api/notifications?tab=needs_action', headers: bearer(veraToken) });
    const needsAfter = res.json<{ data: { items: Array<{ triggerType: string }> } }>().data.items;
    expect(needsAfter.some((n) => n.triggerType === 'review_assigned')).toBe(false);
  });
});

describe('urgent items can never be muted (11 DoD)', () => {
  it('the API refuses to turn off urgent in-app delivery', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notifications/preferences',
      headers: bearer(lenaToken),
      payload: { urgency: 'urgent', channel: 'in_app', enabled: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('a stored preference cannot stop an urgent notification from landing', async () => {
    // Lena "mutes" urgent in-app directly in the store (bypassing the API)…
    await db.query(
      `INSERT INTO notification_preference (user_id, urgency_level, channel, enabled)
       VALUES ($1, 'urgent', 'in_app', false)
       ON CONFLICT (user_id, urgency_level, channel) DO UPDATE SET enabled = false`,
      [lenaId],
    );
    // …and an urgent event still reaches her.
    await emit('calendar.milestone_reached', {
      aggregateType: 'sprint_cycle',
      aggregateId: cycleId,
      payload: { milestoneType: 'pitch_deadline', cycleId },
    });
    const lena = await listNotificationsForUser(db, lenaId);
    expect(lena.filter((n) => n.triggerType === 'pitch_auto_submit_warning').length).toBeGreaterThan(0);
  });
});

describe('the archive never leaks private coaching notes (10 DoD)', () => {
  const SECRET = 'SECRET-COACH-PRIVATE-REMARK-98765';

  it('a coaching session — even one logged through the real endpoint — never appears in search', async () => {
    // Log a real private session as Atlas's coach.
    const res = await app.inject({
      method: 'POST',
      url: '/api/coaching/sessions',
      headers: bearer(await login('cora@example.org')),
      payload: {
        podId: atlas,
        occurredAt: TODAY,
        sessionType: 'check_in',
        privateNotes: SECRET,
      },
    });
    expect([200, 201]).toContain(res.statusCode);

    const found = await searchArchive(db, { orgId, q: SECRET });
    expect(found.length).toBe(0);

    const http = await app.inject({
      method: 'GET',
      url: `/api/archive/search?q=${encodeURIComponent(SECRET)}`,
      headers: bearer(lenaToken),
    });
    expect(http.statusCode).toBe(200);
    expect(http.json<{ data: { count: number } }>().data.count).toBe(0);
  });
});

describe('search results deep-link to their source module (10 DoD)', () => {
  it('every result carries a deep link', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/archive/search', headers: bearer(lenaToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { results: Array<{ entityType: string; deepLink: string }> } }>().data;
    expect(body.results.length).toBeGreaterThan(0);
    for (const r of body.results) {
      expect(r.deepLink, r.entityType).toMatch(/^\//);
    }
  });
});

describe('unread count and read-all', () => {
  it('counts unread and clears them', async () => {
    const before = await countUnread(db, mikaId);
    expect(before).toBeGreaterThan(0);
    const res = await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: bearer(await login('mika@example.org')) });
    expect(res.statusCode).toBe(200);
    expect(await countUnread(db, mikaId)).toBe(0);
  });
});
