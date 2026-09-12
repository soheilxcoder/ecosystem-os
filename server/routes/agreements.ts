/**
 * CLOU agreement endpoints (Module 04).
 *
 * Endpoint list per 04-MODULE-CLOU-AGREEMENTS.md. Every mutation is authorized
 * against the *pod* the caller claims to act for, and then re-checked in the
 * service against the live Pod Lead rotation — so the permission layer and the
 * rotation record agree, or the request fails.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import type { UUID } from '../../core/types';
import { getPod } from '../../db/repositories/pods';
import { getAgreement } from '../../db/repositories/agreements';
import { guard, resolvePodResource } from '../middleware/auth';
import { badRequest, notFound } from '../errors';
import {
  confirmArchive,
  getAgreementDetail,
  getAgreementGraph,
  getInbox,
  listAgreementViews,
  proposeAgreement,
  renewAgreement,
  requestRenegotiation,
  respondToAgreement,
  toListView,
  type AgreementServiceContext,
} from '../services/agreements';

const TermsBody = z.object({
  name: z.string().trim().max(140).optional(),
  serviceDescription: z.string().trim().max(4000).optional(),
  direction: z.enum(['a_to_b', 'b_to_a', 'bidirectional']).optional(),
  cadence: z.enum(['one_time', 'recurring']).optional(),
  frequency: z
    .enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'])
    .nullable()
    .optional(),
  pricingTerms: z
    .object({
      model: z.enum(['fixed_fee', 'per_unit', 'revenue_share', 'other']).nullable().optional(),
      amount: z.string().max(80).nullable().optional(),
      unit: z.string().max(80).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    })
    .optional(),
});

const ProposeBody = z.object({
  podAId: z.string().uuid(),
  podBId: z.string().uuid(),
  terms: TermsBody,
});

const RespondBody = z.object({
  actorPodId: z.string().uuid(),
  decision: z.enum(['accept', 'decline', 'counter']),
  terms: TermsBody.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const RenegotiateBody = z.object({
  actorPodId: z.string().uuid(),
  terms: TermsBody,
  note: z.string().trim().max(1000).nullable().optional(),
});

const ArchiveBody = z.object({
  actorPodId: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const RenewBody = z.object({ actorPodId: z.string().uuid() });

const Query = z.object({
  scope: z.enum(['org', 'pod']).optional(),
  podId: z.string().uuid().optional(),
  holdingId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export function registerAgreementRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate; agreementContext: () => AgreementServiceContext },
): void {
  /** The pods the caller currently leads, used to drive UI affordances. */
  async function viewerPodIds(userId: UUID, today: ISODate): Promise<UUID[]> {
    const roles = await deps.db.query<{ scope_id: string }>(
      `SELECT scope_id FROM role_assignment
        WHERE user_id = $1 AND role_type = 'pod_lead' AND scope_type = 'pod'
          AND revoked_at IS NULL AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $2::date)`,
      [userId, today],
    );
    return roles.rows.map((row) => row.scope_id);
  }

  app.get('/api/agreements', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'cloud.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = Query.safeParse(request.query);
    if (!parsed.success) throw badRequest('Invalid query parameters');
    const { scope, podId, holdingId, status } = parsed.data;

    const agreements = await listAgreementViews(deps.agreementContext(), {
      orgId: principal.orgId,
      podId: scope === 'pod' ? podId ?? null : podId ?? null,
      holdingId: holdingId ?? null,
      status: status ?? null,
    });

    return reply.send({ data: agreements });
  });

  /** Proposals awaiting this pod's response (screen `/agreements/proposals`). */
  app.get('/api/agreements/inbox', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = Query.safeParse(request.query);
    if (!parsed.success) throw badRequest('Invalid query parameters');
    const podId = parsed.data.podId;
    if (!podId) throw badRequest('podId is required for the proposals inbox');

    const resource = await resolvePodResource(deps.db, podId);
    const allowed = await guard(request, reply, 'cloud.view', resource);
    if (!allowed) return reply;

    return reply.send({ data: await getInbox(deps.agreementContext(), principal.orgId, podId) });
  });

  /**
   * Nodes + edges for the network view. The shared-infrastructure edges are
   * computed on every call — they are never stored (Module 04).
   */
  app.get('/api/agreements/graph', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'cloud.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = Query.safeParse(request.query);
    if (!parsed.success) throw badRequest('Invalid query parameters');

    const graph = await getAgreementGraph(
      deps.agreementContext(),
      principal.orgId,
      parsed.data.podId ?? null,
      await viewerPodIds(principal.id, deps.today()),
    );

    return reply.send({ data: graph });
  });

  app.post('/api/agreements', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = ProposeBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid proposal payload');
    const { podAId, podBId, terms } = parsed.data;

    const resource = await resolvePodResource(deps.db, podAId);
    const allowed = await guard(request, reply, 'cloud.propose', resource);
    if (!allowed) return reply;

    const podB = await getPod(deps.db, podBId);
    if (!podB) throw notFound('Counterparty pod not found');

    const agreement = await proposeAgreement(deps.agreementContext(), {
      orgId: principal.orgId,
      podAId,
      podBId,
      terms,
      actorUserId: principal.id,
    });

    return reply.code(201).send({
      data: await listViewOf(agreement.id, deps),
    });
  });

  app.get<{ Params: { id: string } }>('/api/agreements/:id', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'cloud.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const detail = await getAgreementDetail(
      deps.agreementContext(),
      request.params.id,
      await viewerPodIds(principal.id, deps.today()),
    );
    return reply.send({ data: detail });
  });

  app.post<{ Params: { id: string } }>('/api/agreements/:id/respond', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = RespondBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid response payload');

    const resource = await resolvePodResource(deps.db, parsed.data.actorPodId);
    const allowed = await guard(request, reply, 'cloud.respond', resource);
    if (!allowed) return reply;

    const agreement = await respondToAgreement(deps.agreementContext(), {
      agreementId: request.params.id,
      actorUserId: principal.id,
      actorPodId: parsed.data.actorPodId,
      decision: parsed.data.decision,
      terms: parsed.data.terms,
      note: parsed.data.note ?? null,
    });

    return reply.send({ data: await listViewOf(agreement.id, deps) });
  });

  app.post<{ Params: { id: string } }>('/api/agreements/:id/renegotiate', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = RenegotiateBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid renegotiation payload');

    const resource = await resolvePodResource(deps.db, parsed.data.actorPodId);
    const allowed = await guard(request, reply, 'cloud.respond', resource);
    if (!allowed) return reply;

    const agreement = await requestRenegotiation(deps.agreementContext(), {
      agreementId: request.params.id,
      actorUserId: principal.id,
      actorPodId: parsed.data.actorPodId,
      terms: parsed.data.terms,
      note: parsed.data.note ?? null,
    });

    return reply.send({ data: await listViewOf(agreement.id, deps) });
  });

  app.post<{ Params: { id: string } }>('/api/agreements/:id/archive', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = ArchiveBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid archive payload');

    const resource = await resolvePodResource(deps.db, parsed.data.actorPodId);
    const allowed = await guard(request, reply, 'cloud.respond', resource);
    if (!allowed) return reply;

    const result = await confirmArchive(deps.agreementContext(), {
      agreementId: request.params.id,
      actorUserId: principal.id,
      actorPodId: parsed.data.actorPodId,
      note: parsed.data.note ?? null,
    });

    return reply.send({
      data: {
        agreement: await listViewOf(result.agreement.id, deps),
        confirmations: result.confirmations,
        archived: result.archived,
      },
    });
  });

  app.post<{ Params: { id: string } }>('/api/agreements/:id/renew', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = RenewBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid renewal payload');

    const resource = await resolvePodResource(deps.db, parsed.data.actorPodId);
    const allowed = await guard(request, reply, 'cloud.respond', resource);
    if (!allowed) return reply;

    const agreement = await renewAgreement(deps.agreementContext(), {
      agreementId: request.params.id,
      actorUserId: principal.id,
      actorPodId: parsed.data.actorPodId,
    });

    return reply.send({ data: await listViewOf(agreement.id, deps) });
  });
}

/** Re-read one agreement as a list view, so every response has the same shape. */
async function listViewOf(
  agreementId: UUID,
  deps: { db: Database; today: () => ISODate },
) {
  const row = await getAgreement(deps.db, agreementId);
  if (!row) throw notFound('Agreement not found');
  return toListView(row, deps.today());
}
