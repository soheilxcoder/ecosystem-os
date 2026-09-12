/**
 * Pods & Teams endpoints (Module 03).
 *
 * Every time-boxed rule is enforced by the service layer, so a request made
 * outside its window is rejected with 409 even if the UI would have disabled
 * the button.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import { getPod, listPodMembers, listPods } from '../../db/repositories/pods';
import { getCyclePlan } from '../../db/repositories/pods';
import { listCheckins } from '../../db/repositories/pods';
import { getCurrentPhaseForScope } from '../services/calendar';
import {
  castVote,
  finalizeElection,
  getCheckins,
  getElection,
  getPodHistory,
  logCheckin,
  savePitch,
  finalizePitch,
  setCyclePriorities,
  type PodServiceContext,
} from '../services/pods';
import { guard, resolvePodResource } from '../middleware/auth';
import { badRequest, notFound } from '../errors';

const CheckinBody = z.object({
  body: z.string().min(1).max(500),
  atRiskFlag: z.boolean().optional(),
});

const PrioritiesBody = z.object({ priorities: z.array(z.string().min(1)).min(1).max(5) });

const VoteBody = z.object({ candidateUserId: z.string().uuid() });

const PitchBody = z.object({
  previousSummary: z.string().max(5000).nullable().optional(),
  keyResults: z
    .array(
      z.object({
        metric: z.string().min(1),
        target: z.string().min(1),
        actual: z.string().min(1),
      }),
    )
    .optional(),
  nextPlan: z.string().max(5000).nullable().optional(),
  budgetContext: z.string().max(2000).nullable().optional(),
  attachments: z.array(z.unknown()).optional(),
});

export function registerPodRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate; podContext: () => PodServiceContext },
): void {
  app.get('/api/pods', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'pod.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const pods = await listPods(deps.db, principal.orgId);
    return reply.send({ data: pods });
  });

  /** Everything the pod overview screen needs, in one call. */
  app.get<{ Params: { podId: string } }>('/api/pods/:podId/overview', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view', resource);
    if (!allowed) return reply;

    const pod = await getPod(deps.db, request.params.podId);
    if (!pod) throw notFound('Pod not found');

    const phase = await getCurrentPhaseForScope(
      deps.db,
      { orgId: principal.orgId, podId: pod.id },
      deps.today(),
    );

    const [members, checkins, election, plan] = await Promise.all([
      listPodMembers(deps.db, request.params.podId),
      getCheckins(deps.podContext(), pod.id, principal.orgId),
      getElection(deps.podContext(), { podId: pod.id, orgId: principal.orgId }),
      phase ? getCyclePlan(deps.db, pod.id, phase.cycleId) : Promise.resolve(null),
    ]);

    return reply.send({
      data: {
        pod,
        members,
        phase,
        checkins: checkins?.checkins ?? [],
        election: phase && election && phase.day <= phase.phaseBoundaries.p1_end ? election : null,
        priorities: plan ?? [],
      },
    });
  });

  app.get<{ Params: { podId: string } }>('/api/pods/:podId', async (request, reply) => {
    await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view', resource);
    if (!allowed) return reply;

    const pod = await getPod(deps.db, request.params.podId);
    if (!pod) throw notFound('Pod not found');
    return reply.send({ data: pod });
  });

  app.get<{ Params: { podId: string } }>('/api/pods/:podId/members', async (request, reply) => {
    await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view_members', resource);
    if (!allowed) return reply;

    const members = await listPodMembers(deps.db, request.params.podId);
    return reply.send({ data: members });
  });

  // --- cycle priorities (Days 1–3, Pod Lead) --------------------------------

  app.put<{ Params: { podId: string } }>('/api/pods/:podId/priorities', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.set_priorities', resource);
    if (!allowed) return reply;

    const parsed = PrioritiesBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw badRequest('Between one and five priorities are required');
    }

    const priorities = await setCyclePriorities(deps.podContext(), {
      podId: request.params.podId,
      orgId: principal.orgId,
      actorUserId: principal.id,
      priorities: parsed.data.priorities,
    });
    return reply.send({ data: priorities });
  });

  // --- weekly check-ins (Days 4–80) ----------------------------------------

  app.get<{ Params: { podId: string }; Querystring: { cycleId?: string } }>(
    '/api/pods/:podId/checkins',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.view', resource);
      if (!allowed) return reply;

      const result = await getCheckins(deps.podContext(), request.params.podId, principal.orgId);
      if (result && request.query.cycleId && request.query.cycleId !== result.cycleId) {
        const rows = await listCheckins(deps.db, request.params.podId, request.query.cycleId);
        return reply.send({ data: rows });
      }
      return reply.send({ data: result?.checkins ?? [] });
    },
  );

  app.post<{ Params: { podId: string } }>('/api/pods/:podId/checkins', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.log_checkin', resource);
    if (!allowed) return reply;

    const parsed = CheckinBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'A check-in needs a note of up to 500 characters',
        issues: parsed.error.issues,
      });
    }

    const checkin = await logCheckin(deps.podContext(), {
      podId: request.params.podId,
      orgId: principal.orgId,
      authorUserId: principal.id,
      body: parsed.data.body,
      atRiskFlag: parsed.data.atRiskFlag,
    });
    return reply.code(201).send({ data: checkin });
  });

  // --- pitch (Days 81–85) ---------------------------------------------------

  app.get<{ Params: { podId: string; cycleId: string } }>(
    '/api/pods/:podId/pitch/:cycleId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.view', resource);
      if (!allowed) return reply;

      const { getPitch } = await import('../../db/repositories/pods');
      const pitch = await getPitch(deps.db, request.params.podId, request.params.cycleId);
      return reply.send({ data: pitch });
    },
  );

  app.put<{ Params: { podId: string; cycleId: string } }>(
    '/api/pods/:podId/pitch/:cycleId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.edit_pitch', resource);
      if (!allowed) return reply;

      const parsed = PitchBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Invalid pitch payload',
          issues: parsed.error.issues,
        });
      }

      const pitch = await savePitch(deps.podContext(), {
        podId: request.params.podId,
        orgId: principal.orgId,
        actorUserId: principal.id,
        previousSummary: parsed.data.previousSummary,
        keyResults: parsed.data.keyResults,
        nextPlan: parsed.data.nextPlan,
        budgetContext: parsed.data.budgetContext,
        attachments: parsed.data.attachments,
      });
      return reply.send({ data: pitch });
    },
  );

  app.post<{ Params: { podId: string; cycleId: string } }>(
    '/api/pods/:podId/pitch/:cycleId/submit',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.submit_pitch', resource);
      if (!allowed) return reply;

      const pitch = await finalizePitch(deps.podContext(), {
        podId: request.params.podId,
        orgId: principal.orgId,
        actorUserId: principal.id,
      });
      return reply.send({ data: pitch });
    },
  );

  // --- Pod Lead election (Days 1–3) ----------------------------------------

  app.get<{ Params: { podId: string } }>('/api/pods/:podId/election', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.vote_pod_lead', resource);
    if (!allowed) return reply;

    const election = await getElection(deps.podContext(), {
      podId: request.params.podId,
      orgId: principal.orgId,
    });
    return reply.send({ data: election });
  });

  app.post<{ Params: { podId: string } }>('/api/pods/:podId/pod-lead-vote', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.vote_pod_lead', resource);
    if (!allowed) return reply;

    const parsed = VoteBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'A candidate user id is required',
        issues: parsed.error.issues,
      });
    }

    const result = await castVote(deps.podContext(), {
      podId: request.params.podId,
      orgId: principal.orgId,
      voterUserId: principal.id,
      candidateUserId: parsed.data.candidateUserId,
    });
    return reply.send({ data: result });
  });

  app.post<{ Params: { podId: string } }>(
    '/api/pods/:podId/pod-lead-election/finalize',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.set_priorities', resource);
      if (!allowed) return reply;

      const result = await finalizeElection(deps.podContext(), {
        podId: request.params.podId,
        orgId: principal.orgId,
        actorUserId: principal.id,
      });
      return reply.send({ data: result });
    },
  );

  // --- history --------------------------------------------------------------

  app.get<{ Params: { podId: string } }>('/api/pods/:podId/history', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view_history', resource);
    if (!allowed) return reply;

    const pitches = await getPodHistory(deps.podContext(), request.params.podId);
    return reply.send({ data: pitches });
  });

  /** CSV export of the pod's cycle history (available to members and hub roles). */
  app.get<{ Params: { podId: string } }>(
    '/api/pods/:podId/history.csv',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'pod.export_history', resource);
      if (!allowed) return reply;

      const pitches = await getPodHistory(deps.podContext(), request.params.podId);
      const header = 'cycle_id,status,submitted_at,auto_submitted,previous_summary\n';
      const rows = pitches
        .map((pitch) =>
          [
            pitch.cycleId,
            pitch.status,
            pitch.submittedAt ?? '',
            pitch.autoSubmitted ? 'true' : 'false',
            csvCell(pitch.previousSummary ?? ''),
          ].join(','),
        )
        .join('\n');

      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="pod-${request.params.podId}-history.csv"`)
        .send(header + rows);
    },
  );
}

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${escaped}"`;
}
