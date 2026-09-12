/**
 * Phase 2 integration tests: CLOU agreements (Module 04).
 *
 * The phase's definition of done is "two seeded pods can propose, counter, and
 * accept an agreement end-to-end; the graph/list correctly shows unrelated pods
 * as connected only via the shared-infrastructure dotted line". Everything
 * below drives the HTTP API directly, so a rule that only exists in the UI
 * would fail here.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createTestDatabase } from '../helpers/test-db';
import { seedFixtureWorld, type FixtureWorld } from '../helpers/fixtures';
import { buildServer } from '../../server/index';
import { createAgreement, insertAgreementEvent } from '../../db/repositories/agreements';
import { assignRole, revokeRole, listRolesByScope } from '../../db/repositories/roles';
import type { Database } from '../../db/client';
import { addDays, todayISO } from '../../core/time';
import type { CloudTerms } from '../../core/types';

let db: Database;
let world: FixtureWorld;
let app: FastifyInstance;
const TODAY = todayISO();

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function login(email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

const TERMS: CloudTerms = {
  name: 'Basalt → Atlas data export',
  serviceDescription: 'Weekly export of production telemetry into the Atlas pipeline',
  direction: 'b_to_a',
  cadence: 'recurring',
  frequency: 'monthly',
  pricingTerms: { model: 'fixed_fee', amount: '120 units', unit: null, notes: null },
};

const propose = (token: string, podAId: string, podBId: string, terms: Partial<CloudTerms> = TERMS) =>
  app.inject({
    method: 'POST',
    url: '/api/agreements',
    headers: bearer(token),
    payload: { podAId, podBId, terms },
  });

const respond = (
  token: string,
  id: string,
  body: { actorPodId: string; decision: 'accept' | 'decline' | 'counter'; terms?: Partial<CloudTerms>; note?: string | null },
) =>
  app.inject({
    method: 'POST',
    url: `/api/agreements/${id}/respond`,
    headers: bearer(token),
    payload: body,
  });

const detail = (token: string, id: string) =>
  app.inject({ method: 'GET', url: `/api/agreements/${id}`, headers: bearer(token) });

type AgreementView = {
  id: string;
  status: string;
  displayStatus: string;
  awaitingPodId: string | null;
  startDate: string | null;
  renewalDate: string | null;
  serviceDescription: string;
  name: string;
};

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedFixtureWorld(db);
  app = await buildServer({ db, runMigrations: false, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('proposing an agreement', () => {
  it('creates a proposal awaiting the counterparty pod', async () => {
    const lena = await login('lena@example.org');
    const response = await propose(lena, world.podAId, world.podBId);
    expect(response.statusCode, response.body).toBe(201);

    const agreement = response.json<{ data: AgreementView }>().data;
    expect(agreement.status).toBe('proposed');
    expect(agreement.awaitingPodId).toBe(world.podBId);
    expect(agreement.serviceDescription).toBe(TERMS.serviceDescription);

    // The counterparty sees it in their inbox; the proposer does not.
    const inbox = await app.inject({
      method: 'GET',
      url: `/api/agreements/inbox?podId=${world.podBId}`,
      headers: bearer(lena),
    });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json<{ data: AgreementView[] }>().data.map((row) => row.id)).toContain(agreement.id);

    const ownInbox = await app.inject({
      method: 'GET',
      url: `/api/agreements/inbox?podId=${world.podAId}`,
      headers: bearer(lena),
    });
    expect(ownInbox.json<{ data: AgreementView[] }>().data.map((row) => row.id)).not.toContain(
      agreement.id,
    );
  });

  it('refuses an agreement with no described exchange, server-side', async () => {
    const lena = await login('lena@example.org');
    const response = await propose(lena, world.podAId, world.podBId, {
      ...TERMS,
      serviceDescription: '   ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain(
      'A CLOU requires a real, described exchange',
    );
  });

  it('refuses a recurring agreement with no frequency', async () => {
    const lena = await login('lena@example.org');
    const response = await propose(lena, world.podAId, world.podBId, {
      ...TERMS,
      cadence: 'recurring',
      frequency: null,
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses an agreement between a pod and itself', async () => {
    const lena = await login('lena@example.org');
    const response = await propose(lena, world.podAId, world.podAId);
    expect(response.statusCode).toBe(400);
  });

  it('refuses a proposer who is not the current Pod Lead', async () => {
    const mo = await login('mo@example.org');
    const response = await propose(mo, world.podAId, world.podBId);
    expect(response.statusCode).toBe(403);
  });

  it('refuses a proposer with no pod role at all', async () => {
    const outsider = await login('noroles@example.org');
    const response = await propose(outsider, world.podAId, world.podBId);
    // No active seat at all is a 401 (authenticated but not a member of
    // anything) rather than a 403 — the platform must be honest about which.
    expect(response.statusCode).toBe(401);
  });
});

describe('responding to a proposal', () => {
  it('walks propose → counter → accept to an active agreement', async () => {
    const lena = await login('lena@example.org');
    const omar = await login('omar@example.org');

    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;

    // The proposer cannot answer their own proposal.
    const premature = await respond(lena, id, { actorPodId: world.podAId, decision: 'accept' });
    expect(premature.statusCode).toBe(403);
    expect(premature.json<{ message: string }>().message).toContain('turn to respond');

    // Counter-proposal with revised terms.
    const countered = await respond(omar, id, {
      actorPodId: world.podBId,
      decision: 'counter',
      terms: { ...TERMS, serviceDescription: 'Bi-weekly export instead, plus schema support' },
      note: 'We can only commit to fortnightly',
    });
    expect(countered.statusCode, countered.body).toBe(200);
    expect(countered.json<{ data: AgreementView }>().data).toMatchObject({
      status: 'countered',
      awaitingPodId: world.podAId,
      serviceDescription: 'Bi-weekly export instead, plus schema support',
    });

    // Now it is the proposer's turn again.
    const accepted = await respond(lena, id, { actorPodId: world.podAId, decision: 'accept' });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json<{ data: AgreementView }>().data).toMatchObject({
      status: 'active',
      displayStatus: 'active',
      awaitingPodId: null,
      startDate: TODAY,
      renewalDate: addDays(TODAY, 30),
    });

    // A second response is rejected: the agreement is settled.
    const late = await respond(omar, id, { actorPodId: world.podBId, decision: 'accept' });
    expect(late.statusCode).toBe(400);
    expect(late.json<{ message: string }>().message).toContain('already been answered');

    // The activity log records the whole negotiation, with term snapshots.
    const log = await detail(lena, id);
    const events = log.json<{
      data: { events: Array<{ eventType: string; terms: { serviceDescription?: string } | null }> };
    }>().data.events;
    expect(events.map((event) => event.eventType)).toEqual([
      'proposed',
      'countered',
      'accepted',
    ]);
    expect(events[1]?.terms?.serviceDescription).toBe('Bi-weekly export instead, plus schema support');
  });

  it('requires a one-line reason to decline — no silent rejections', async () => {
    const lena = await login('lena@example.org');
    const omar = await login('omar@example.org');

    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;

    const silent = await respond(omar, id, { actorPodId: world.podBId, decision: 'decline' });
    expect(silent.statusCode).toBe(400);
    expect(silent.json<{ message: string }>().message).toContain('one-line reason');

    const declined = await respond(omar, id, {
      actorPodId: world.podBId,
      decision: 'decline',
      note: 'We are rebuilding the export pipeline this cycle',
    });
    expect(declined.statusCode, declined.body).toBe(200);
    expect(declined.json<{ data: AgreementView }>().data.status).toBe('declined');

    // The reason is visible to the proposing pod.
    const log = await detail(lena, id);
    const events = log.json<{
      data: { events: Array<{ eventType: string; note: string | null }> };
    }>().data.events;
    const decline = events.find((event) => event.eventType === 'declined');
    expect(decline?.note).toBe('We are rebuilding the export pipeline this cycle');
  });

  it('refuses a responder who does not currently hold the Pod Lead seat', async () => {
    const lena = await login('lena@example.org');
    const quinn = await login('quinn@example.org');

    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;

    const response = await respond(quinn, id, { actorPodId: world.podBId, decision: 'accept' });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a lead acting for a pod they do not lead', async () => {
    const lena = await login('lena@example.org');
    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;

    // Lena leads pod A but claims to act for pod B, which is not her seat.
    const response = await respond(lena, id, { actorPodId: world.podBId, decision: 'accept' });
    expect(response.statusCode).toBe(403);
  });
});

describe('renegotiation, renewal and archiving', () => {
  async function activeAgreement(): Promise<{ id: string; lena: string; omar: string }> {
    const lena = await login('lena@example.org');
    const omar = await login('omar@example.org');
    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;
    await respond(omar, id, { actorPodId: world.podBId, decision: 'accept' });
    return { id, lena, omar };
  }

  it('renegotiates a live agreement and returns it to force on acceptance', async () => {
    const { id, lena, omar } = await activeAgreement();

    const requested = await app.inject({
      method: 'POST',
      url: `/api/agreements/${id}/renegotiate`,
      headers: bearer(lena),
      payload: {
        actorPodId: world.podAId,
        terms: { ...TERMS, pricingTerms: { model: 'per_unit', amount: '4', unit: 'export' } },
        note: 'Volume doubled; move to per-unit pricing',
      },
    });
    expect(requested.statusCode, requested.body).toBe(200);
    expect(requested.json<{ data: AgreementView }>().data).toMatchObject({
      status: 'renegotiating',
      displayStatus: 'renegotiating',
      awaitingPodId: world.podBId,
    });

    const accepted = await respond(omar, id, { actorPodId: world.podBId, decision: 'accept' });
    expect(accepted.json<{ data: AgreementView }>().data.status).toBe('active');

    const log = await detail(lena, id);
    const events = log.json<{ data: { events: Array<{ eventType: string }> } }>().data.events;
    expect(events.map((event) => event.eventType)).toEqual([
      'proposed',
      'accepted',
      'renegotiated',
      'accepted',
    ]);
  });

  it('renews a lapsed recurring agreement into the future', async () => {
    const lena = await login('lena@example.org');
    const lapsed = await createAgreement(db, {
      orgId: world.orgId,
      podAId: world.podAId,
      podBId: world.podBId,
      terms: { ...TERMS, name: 'Lapsed telemetry agreement' },
      status: 'active',
      awaitingPodId: null,
      createdByUserId: world.users.lead,
      startDate: addDays(TODAY, -200),
      renewalDate: addDays(TODAY, -10),
      activatedAt: true,
    });
    await insertAgreementEvent(db, {
      agreementId: lapsed.id,
      eventType: 'accepted',
      actorUserId: world.users.lead,
    });

    const before = await detail(lena, lapsed.id);
    expect(before.json<{ data: { agreement: AgreementView } }>().data.agreement.displayStatus).toBe(
      'expired',
    );

    const renewed = await app.inject({
      method: 'POST',
      url: `/api/agreements/${lapsed.id}/renew`,
      headers: bearer(lena),
      payload: { actorPodId: world.podAId },
    });
    expect(renewed.statusCode, renewed.body).toBe(200);
    const agreement = renewed.json<{ data: AgreementView }>().data;
    expect(agreement.displayStatus).toBe('active');
    expect(agreement.renewalDate! > TODAY).toBe(true);
  });

  it('refuses to renew an agreement that is not in force', async () => {
    const lena = await login('lena@example.org');
    const oneOff = await createAgreement(db, {
      orgId: world.orgId,
      podAId: world.podAId,
      podBId: world.podBId,
      terms: { ...TERMS, name: 'One-off workshop', cadence: 'one_time', frequency: null },
      status: 'active',
      createdByUserId: world.users.lead,
      startDate: addDays(TODAY, -20),
      renewalDate: null,
      activatedAt: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/agreements/${oneOff.id}/renew`,
      headers: bearer(lena),
      payload: { actorPodId: world.podAId },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('One-time agreements');
  });

  it('archives only once both pods have confirmed', async () => {
    const { id, lena, omar } = await activeAgreement();

    const first = await app.inject({
      method: 'POST',
      url: `/api/agreements/${id}/archive`,
      headers: bearer(lena),
      payload: { actorPodId: world.podAId },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json<{ data: { archived: boolean; confirmations: string[] } }>().data).toMatchObject({
      archived: false,
    });
    expect(first.json<{ data: { confirmations: string[] } }>().data.confirmations).toEqual([
      world.podAId,
    ]);

    // Still in force after a single confirmation.
    const midway = await detail(lena, id);
    expect(midway.json<{ data: { agreement: AgreementView } }>().data.agreement.status).toBe('active');

    const second = await app.inject({
      method: 'POST',
      url: `/api/agreements/${id}/archive`,
      headers: bearer(omar),
      payload: { actorPodId: world.podBId },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json<{ data: { archived: boolean } }>().data.archived).toBe(true);

    const after = await detail(lena, id);
    expect(after.json<{ data: { agreement: AgreementView } }>().data.agreement.status).toBe('archived');
    const events = after.json<{ data: { events: Array<{ eventType: string }> } }>().data.events;
    expect(events.map((event) => event.eventType)).toContain('archived');
  });
});

describe('network graph', () => {
  it('connects pods with a real agreement and leaves the rest wired only to the hub', async () => {
    const lena = await login('lena@example.org');
    const omar = await login('omar@example.org');

    const created = await propose(lena, world.podAId, world.podBId);
    const id = created.json<{ data: AgreementView }>().data.id;

    // Before acceptance there is nothing to draw between the two pods.
    const draftGraph = await app.inject({
      method: 'GET',
      url: '/api/agreements/graph',
      headers: bearer(lena),
    });
    const draft = draftGraph.json<{
      data: { edges: Array<{ agreementId: string }>; hubEdges: Array<{ podId: string }> };
    }>().data;
    expect(draft.edges.map((edge) => edge.agreementId)).not.toContain(id);
    expect(draft.hubEdges).toHaveLength(3);

    await respond(omar, id, { actorPodId: world.podBId, decision: 'accept' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/agreements/graph',
      headers: bearer(lena),
    });
    expect(response.statusCode).toBe(200);
    const graph = response.json<{
      data: {
        nodes: Array<{ id: string; agreementCount: number }>;
        edges: Array<{ fromPodId: string; toPodId: string; agreementId: string; kind: string }>;
        hubEdges: Array<{ podId: string }>;
        unconnectedPodIds: string[];
        hub: { id: string; name: string };
      };
    }>().data;

    // One edge, between the two pods that actually signed something.
    const mine = graph.edges.filter((edge) => edge.agreementId === id);
    expect(mine).toHaveLength(1);
    expect(new Set([mine[0]!.fromPodId, mine[0]!.toPodId])).toEqual(
      new Set([world.podAId, world.podBId]),
    );

    // Every pod — including the unrelated one — is linked to the hub, and the
    // unrelated pod has no direct edge to anybody.
    expect(graph.hubEdges).toHaveLength(3);
    expect(graph.hubEdges.map((edge) => edge.podId).sort()).toEqual(
      [world.podAId, world.podBId, world.podCId].sort(),
    );
    expect(graph.unconnectedPodIds).toContain(world.podCId);
    expect(graph.hub.id).toBe('__hub__');

    // No edge anywhere in the graph links the unrelated pod to another pod.
    for (const edge of graph.edges) {
      expect([edge.fromPodId, edge.toPodId]).not.toContain(world.podCId);
    }
  });
});

describe('escalation contacts', () => {
  it('resolves the escalation contact live and goes vacant after the seat rotates', async () => {
    const lena = await login('lena@example.org');
    const created = await propose(lena, world.podAId, world.podBId, {
      ...TERMS,
      name: 'Escalation contact probe',
    });
    const id = created.json<{ data: AgreementView }>().data.id;

    const before = await detail(lena, id);
    const escalation = before.json<{
      data: {
        escalation: Array<{ podId: string; fullName: string; userId: string; endDate: string | null }>;
      };
    }>().data.escalation;
    expect(escalation.find((row) => row.podId === world.podAId)?.fullName).toBe('Lena Lead');

    // The seat rotates out: the agreement must not keep pointing at Lena.
    const podRoles = await listRolesByScope(db, 'pod', world.podAId);
    const leadSeat = podRoles.find(
      (role) => role.roleType === 'pod_lead' && role.userId === world.users.lead,
    );
    expect(leadSeat).toBeDefined();
    await revokeRole(db, leadSeat!.id, world.users.architect!);

    try {
      const after = await detail(lena, id);
      const rotated = after.json<{
        data: { escalation: Array<{ podId: string; fullName: string; userId: string }> };
      }>().data.escalation;
      const contact = rotated.find((row) => row.podId === world.podAId);
      expect(contact?.fullName).toBe('');
      expect(contact?.userId).toBe('');
    } finally {
      // Restore the seat so the remaining tests keep their Pod Lead.
      await assignRole(db, {
        userId: world.users.lead!,
        roleType: 'pod_lead',
        scopeType: 'pod',
        scopeId: world.podAId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    }

    const restored = await detail(lena, id);
    expect(
      restored
        .json<{ data: { escalation: Array<{ podId: string; fullName: string }> } }>()
        .data.escalation.find((row) => row.podId === world.podAId)?.fullName,
    ).toBe('Lena Lead');
  });
});

describe('visibility', () => {
  it('lets any org member read agreements across pods, but not act on them', async () => {
    const nadia = await login('nadia@example.org');
    const list = await app.inject({
      method: 'GET',
      url: '/api/agreements',
      headers: bearer(nadia),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ data: AgreementView[] }>().data.length).toBeGreaterThan(0);

    const created = await app.inject({
      method: 'POST',
      url: '/api/agreements',
      headers: bearer(nadia),
      payload: { podAId: world.podAId, podBId: world.podBId, terms: TERMS },
    });
    expect(created.statusCode).toBe(403);
  });

  it('filters the list by pod', async () => {
    const lena = await login('lena@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/agreements?scope=pod&podId=${world.podAId}`,
      headers: bearer(lena),
    });
    const rows = response.json<{ data: Array<{ podAId: string; podBId: string }> }>().data;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect([row.podAId, row.podBId]).toContain(world.podAId);
    }
  });
});
