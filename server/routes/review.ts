/**
 * Peer review & governance endpoints (Module 08).
 *
 * Endpoint list per 08-MODULE-PEER-REVIEW-GOVERNANCE.md. The three workflows
 * stay on separate route trees — /review/queue + /review/:pitchId/score,
 * /review/cases, and /review/entry + /review/accountability — because they are
 * three different processes and the model forbids merging them.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import type { UUID } from '../../core/types';
import { getPod } from '../../db/repositories/pods';
import { getPitchPodId } from '../../db/repositories/review';
import { guard, resolvePodResource } from '../middleware/auth';
import type { ResourceRef } from '../../core/permissions';
import { badRequest, forbidden } from '../errors';
import {
  assignReviewersForCycle,
  escalateToRuleReview,
  getCase,
  getPitchReviews,
  getReviewQueue,
  listCases,
  logCaseEntry,
  openCase,
  recommendResolution,
  saveReview,
  type ReviewServiceContext,
} from '../services/review';
import {
  advanceStage,
  castPanelVote,
  evaluateStage2Trigger,
  getAccountabilityView,
  getEntryTrialView,
  listRuleHistory,
  listGovernanceOverview,
  listRules,
  openAccountabilityCase,
  proposeRuleChange,
  recordEntryDecision,
  startEntryTrial,
  updateTrialCriteria,
  type GovernanceServiceContext,
} from '../services/governance';
import { getCurrentPhaseForScope } from '../services/calendar';

const ScoreBody = z.object({
  score: z.number().min(0).max(100).nullable(),
  comments: z.string().max(4000).nullable(),
  rubricAnswers: z.record(z.union([z.string(), z.number()])).optional(),
  submit: z.boolean().default(true),
});

const CriterionBody = z.object({
  label: z.string().trim().min(1).max(200),
  met: z.boolean().nullable(),
});

const TrialStartBody = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  criteria: z.array(CriterionBody).max(40).optional(),
});

const CriteriaBody = z.object({ criteria: z.array(CriterionBody).max(40) });

const EntryDecisionBody = z.object({
  side: z.enum(['pod', 'hub']),
  recommendation: z.enum(['join', 'discontinue']),
});

const OpenCaseBody = z.object({
  podAId: z.string().uuid(),
  podBId: z.string().uuid(),
  resolverUserId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
});

const CaseLogBody = z.object({
  authorRole: z.enum(['resolver', 'pod_a', 'pod_b', 'system']),
  body: z.string().trim().min(1).max(4000),
});

const RecommendBody = z.object({ text: z.string().trim().min(20).max(4000) });

const StageBody = z.object({
  to: z.enum(['transparency', 'reduced_share', 'mediation', 'correction_period']),
  coachUserId: z.string().uuid().nullable().optional(),
  conflictCaseId: z.string().uuid().nullable().optional(),
  correctionDays: z.number().int().min(7).max(90).optional(),
});

const PanelVoteBody = z.object({
  vote: z.enum(['continue', 'dissolve']),
  comment: z.string().trim().min(1).max(2000).nullable(),
});

const TriggerBody = z.object({ score: z.number().min(0).max(100) });

const RuleBody = z.object({
  ruleName: z.string().min(1).max(80),
  newValue: z.unknown(),
  justification: z.string().min(1).max(4000),
  effectiveCycleNumber: z.number().int().min(1),
});

export function registerReviewRoutes(
  app: FastifyInstance,
  deps: {
    db: Database;
    today: () => ISODate;
    reviewContext: () => ReviewServiceContext;
    governanceContext: () => GovernanceServiceContext;
  },
): void {
  const { db, today, reviewContext, governanceContext } = deps;

  /**
   * The resource a Peer Validator's own seat governs.
   *
   * The seat is scoped to a pod or to a cycle, never to the whole org, so the
   * permission check has to name the scope the caller actually holds — an
   * org-wide check would refuse every real validator.
   */
  async function validatorResource(userId: UUID, onDate: ISODate): Promise<ResourceRef> {
    const { rows } = await db.query<{ scope_type: string; scope_id: string | null }>(
      `SELECT scope_type, scope_id FROM role_assignment
        WHERE user_id = $1 AND role_type = 'peer_validator'
          AND revoked_at IS NULL AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $2::date)`,
      [userId, onDate],
    );
    const resource: ResourceRef = {};
    for (const row of rows) {
      if (row.scope_type === 'pod' && row.scope_id) resource.podId ??= row.scope_id;
      if (row.scope_type === 'cycle' && row.scope_id) resource.cycleId ??= row.scope_id;
    }
    return resource;
  }

  /** A pod the caller currently holds a seat in, used to check pod-scoped powers. */
  async function ownPodIdFor(userId: UUID, onDate: ISODate): Promise<UUID | null> {
    const { rows } = await db.query<{ scope_id: UUID }>(
      `SELECT scope_id FROM role_assignment
        WHERE user_id = $1 AND scope_type = 'pod'
          AND role_type IN ('pod_lead', 'pod_member')
          AND revoked_at IS NULL AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $2::date)
        LIMIT 1`,
      [userId, onDate],
    );
    return rows[0]?.scope_id ?? null;
  }

  /** Which track every pod is on — the `/review` overview. */
  app.get('/api/review/tracks', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'pod.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await listGovernanceOverview(governanceContext(), principal.orgId) });
  });

  // ---------------------------------------------------------------------
  // Workflow 1 — Peer review
  // ---------------------------------------------------------------------

  /** The reviewer's own queue: the pitches they were assigned this cycle. */
  app.get('/api/review/queue', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const seat = await validatorResource(principal.id, today());
    const allowed = await guard(request, reply, 'review.view_assigned', {
      orgId: principal.orgId,
      ...seat,
    });
    if (!allowed) return reply;

    const parsed = z
      .object({ reviewerUserId: z.string().uuid() })
      .safeParse(request.query);
    if (!parsed.success) throw badRequest('reviewerUserId is required');
    if (parsed.data.reviewerUserId !== principal.id) {
      const isAdmin = await request.auth.can('hub.view_trials', { orgId: principal.orgId });
      if (!isAdmin.allowed) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'You can only read your own review queue',
        });
      }
    }

    return reply.send({
      data: await getReviewQueue(reviewContext(), parsed.data.reviewerUserId, principal.orgId),
    });
  });

  /**
   * Assign panels for the cycle. Idempotent — it fills gaps and leaves existing
   * assignments alone, and the conflict-of-interest exclusions are applied here
   * rather than anywhere a client can influence.
   */
  app.post('/api/review/assignments', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = z.object({ cycleId: z.string().uuid().optional() }).safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest('Invalid assignment payload');

    let cycleId = parsed.data.cycleId ?? null;
    if (!cycleId) {
      const phase = await getCurrentPhaseForScope(db, { orgId: principal.orgId }, today());
      if (!phase) throw badRequest('No active sprint cycle to assign reviewers for');
      cycleId = phase.cycleId;
    }

    return reply.send({
      data: await assignReviewersForCycle(reviewContext(), principal.orgId, cycleId),
    });
  });

  app.post<{ Params: { pitchId: string } }>(
    '/api/review/:pitchId/score',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const seat = await validatorResource(principal.id, today());
      const allowed = await guard(request, reply, 'review.submit_score', {
        orgId: principal.orgId,
        ...seat,
      });
      if (!allowed) return reply;

      const parsed = ScoreBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid review payload');

      const result = await saveReview(reviewContext(), {
        pitchId: request.params.pitchId,
        reviewerUserId: principal.id,
        orgId: principal.orgId,
        score: parsed.data.score,
        comments: parsed.data.comments,
        rubricAnswers: parsed.data.rubricAnswers ?? null,
        submit: parsed.data.submit,
      });

      return reply.send({ data: result });
    },
  );

  app.get<{ Params: { pitchId: string } }>(
    '/api/review/:pitchId/reviews',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();

      // Two audiences may read a pitch's reviews: the validators assigned to
      // it, and the pod it belongs to — the comments exist for that pod.
      const seat = await validatorResource(principal.id, today());
      const asValidator = await request.auth.can('review.view_assigned', {
        orgId: principal.orgId,
        ...seat,
      });

      if (!asValidator.allowed) {
        const podId = await getPitchPodId(db, request.params.pitchId);
        if (!podId) throw badRequest('Pitch not found');
        const asOwner = await request.auth.can(
          'pod.view',
          await resolvePodResource(db, podId),
        );
        if (!asOwner.allowed) {
          throw forbidden('Only the assigned reviewers and the reviewed pod can read these reviews');
        }
      }

      const summary = await getPitchReviews(
        reviewContext(),
        request.params.pitchId,
        principal.orgId,
      );
      if (!summary) throw badRequest('Pitch not found');
      return reply.send({ data: summary });
    },
  );

  // ---------------------------------------------------------------------
  // Workflow 2 — Conflict resolution
  // ---------------------------------------------------------------------

  app.get('/api/review/cases', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'case.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = z
      .object({
        userId: z.string().uuid().optional(),
        resolverUserId: z.string().uuid().optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) throw badRequest('Invalid case query');

    return reply.send({
      data: await listCases(reviewContext(), {
        orgId: principal.orgId,
        userId: parsed.data.userId,
        resolverUserId: parsed.data.resolverUserId,
      }),
    });
  });

  app.post('/api/review/cases', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const parsed = OpenCaseBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid conflict case payload');

    const resource = await resolvePodResource(db, parsed.data.podAId);
    const allowed = await guard(request, reply, 'case.view', resource);
    if (!allowed) return reply;

    return reply.code(201).send({
      data: await openCase(reviewContext(), {
        ...parsed.data,
        orgId: principal.orgId,
        actorUserId: principal.id,
      }),
    });
  });

  app.get<{ Params: { id: string } }>('/api/review/cases/:id', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'case.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const found = await getCase(reviewContext(), request.params.id);
    if (!found) return reply.code(404).send({ error: 'not_found', message: 'Case not found' });
    return reply.send({ data: found });
  });

  app.post<{ Params: { id: string } }>(
    '/api/review/cases/:id/log',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'case.log_mediation', { orgId: principal.orgId });
      if (!allowed) return reply;

      const parsed = CaseLogBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid log entry');

      return reply.send({
        data: await logCaseEntry(reviewContext(), {
          caseId: request.params.id,
          actorUserId: principal.id,
          authorRole: parsed.data.authorRole,
          body: parsed.data.body,
          orgId: principal.orgId,
        }),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/review/cases/:id/recommend',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'case.recommend', { orgId: principal.orgId });
      if (!allowed) return reply;

      const parsed = RecommendBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid recommendation');

      return reply.send({
        data: await recommendResolution(reviewContext(), {
          caseId: request.params.id,
          actorUserId: principal.id,
          orgId: principal.orgId,
          text: parsed.data.text,
        }),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/review/cases/:id/escalate',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'case.recommend', { orgId: principal.orgId });
      if (!allowed) return reply;

      return reply.send({
        data: await escalateToRuleReview(reviewContext(), {
          caseId: request.params.id,
          actorUserId: principal.id,
          orgId: principal.orgId,
        }),
      });
    },
  );

  // ---------------------------------------------------------------------
  // Workflow 3a — 90-Day Entry Rule
  // ---------------------------------------------------------------------

  app.get<{ Params: { podId: string } }>(
    '/api/review/entry/:podId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.view_track', resource);
      if (!allowed) return reply;

      return reply.send({ data: await getEntryTrialView(governanceContext(), request.params.podId) });
    },
  );

  app.post<{ Params: { podId: string } }>(
    '/api/review/entry/:podId/start',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'hub.deploy_unit', resource);
      if (!allowed) return reply;

      const parsed = TrialStartBody.safeParse(request.body ?? {});
      if (!parsed.success) throw badRequest('Invalid trial payload');

      return reply.code(201).send({
        data: await startEntryTrial(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          startDate: parsed.data.startDate,
          criteria: parsed.data.criteria,
        }),
      });
    },
  );

  app.post<{ Params: { podId: string } }>(
    '/api/review/entry/:podId/criteria',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'hub.deploy_unit', resource);
      if (!allowed) return reply;

      const parsed = CriteriaBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid criteria payload');

      return reply.send({
        data: await updateTrialCriteria(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          criteria: parsed.data.criteria,
        }),
      });
    },
  );

  /** One half of the bilateral decision; the result is stamped when both are in. */
  app.post<{ Params: { podId: string } }>(
    '/api/review/entry/:podId/decision',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.entry_decision', resource);
      if (!allowed) return reply;

      const parsed = EntryDecisionBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid decision payload');

      return reply.send({
        data: await recordEntryDecision(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          side: parsed.data.side,
          recommendation: parsed.data.recommendation,
        }),
      });
    },
  );

  // ---------------------------------------------------------------------
  // Workflow 3b — Accountability & Dissolution Path
  // ---------------------------------------------------------------------

  app.get<{ Params: { podId: string } }>(
    '/api/review/accountability/:podId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.view_track', resource);
      if (!allowed) return reply;

      return reply.send({
        data: await getAccountabilityView(governanceContext(), request.params.podId),
      });
    },
  );

  app.post<{ Params: { podId: string } }>(
    '/api/review/accountability/:podId/open',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.advance_stage', resource);
      if (!allowed) return reply;

      return reply.code(201).send({
        data: await openAccountabilityCase(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
        }),
      });
    },
  );

  /**
   * Evaluate the stage-2 threshold. Triggered by data, not by a manager: the
   * reduction it writes is a visible adjustment record for Module 05.
   */
  app.post<{ Params: { podId: string } }>(
    '/api/review/accountability/:podId/evaluate',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.advance_stage', resource);
      if (!allowed) return reply;

      const parsed = TriggerBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid evaluation payload');

      return reply.send({
        data: await evaluateStage2Trigger(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          score: parsed.data.score,
        }),
      });
    },
  );

  app.post<{ Params: { podId: string } }>(
    '/api/review/accountability/:podId/stage',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const resource = await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.advance_stage', resource);
      if (!allowed) return reply;

      const parsed = StageBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid stage payload');

      return reply.send({
        data: await advanceStage(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          to: parsed.data.to,
          coachUserId: parsed.data.coachUserId ?? null,
          conflictCaseId: parsed.data.conflictCaseId ?? null,
          correctionDays: parsed.data.correctionDays,
        }),
      });
    },
  );

  app.post<{ Params: { podId: string } }>(
    '/api/review/accountability/:podId/panel-vote',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const ownPodId = await ownPodIdFor(principal.id, today());
      const resource = ownPodId
        ? await resolvePodResource(db, ownPodId)
        : await resolvePodResource(db, request.params.podId);
      const allowed = await guard(request, reply, 'governance.panel_vote', resource);
      if (!allowed) return reply;

      const parsed = PanelVoteBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid vote payload');

      // A panel member votes as the lead of *their own* pod, not of the pod
      // under review, so the seat they hold is the one being checked.

      return reply.send({
        data: await castPanelVote(governanceContext(), {
          podId: request.params.podId,
          actorUserId: principal.id,
          vote: parsed.data.vote,
          comment: parsed.data.comment,
        }),
      });
    },
  );

  // ---------------------------------------------------------------------
  // Rule versioning — shared, next cycle only, publicly viewable
  // ---------------------------------------------------------------------

  app.get('/api/hub/rules', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await listRules(governanceContext(), principal.orgId) });
  });

  app.get('/api/hub/rules/history', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await listRuleHistory(governanceContext(), principal.orgId) });
  });

  app.post('/api/hub/rules/propose', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = RuleBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('Invalid rule change payload');

    return reply.code(201).send({
      data: await proposeRuleChange(governanceContext(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        ruleName: parsed.data.ruleName,
        newValue: parsed.data.newValue,
        justification: parsed.data.justification,
        effectiveCycleNumber: parsed.data.effectiveCycleNumber,
      }),
    });
  });
}
