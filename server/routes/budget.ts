/**
 * Internal Budget Market endpoints (Module 05).
 *
 * The permission matrix already carries this module's five actions
 * (`budget.view`, `budget.view_breakdown`, `budget.simulate`,
 * `budget.configure_pool`, `budget.lock_cycle`), so every handler here resolves
 * its resource and asks, rather than trusting a role name off the session.
 *
 * Two shapes are deliberate:
 *
 *  - `GET` handlers are org-wide readable, because cross-pod transparency is
 *    the default (00-OVERVIEW.md §5.5). A pod seeing another pod's *public*
 *    budget total is the point of the module.
 *  - `POST /cycle/compute` and `POST /cycle/:id/lock` are Architecture Hub only,
 *    and the lock returns its checklist on failure so "the button was disabled"
 *    is never the only explanation the caller gets.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import { isScoreComponentKey } from '../../core/budget';
import {
  computeBudget,
  getCurrentCycleOverview,
  getPodBreakdown,
  getPodHistory,
  lockChecklist,
  lockCycle,
  simulate,
  withComponentHistory,
  type BudgetServiceContext,
} from '../services/budget';
import { getPod } from '../../db/repositories/pods';
import { recordFinancialSync } from '../../db/repositories/budget';
import { guard, resolvePodResource } from '../middleware/auth';
import { badRequest, notFound } from '../errors';

const ComponentScores = z.object({
  financial: z.number().min(0).max(100),
  peer_review: z.number().min(0).max(100),
  strategic: z.number().min(0).max(100),
});

const ComputeBody = z.object({
  cycleId: z.string().uuid(),
  cycleNumber: z.number().int().positive(),
  totalPool: z.number().nonnegative(),
  capFraction: z.number().positive().max(1).optional(),
  financialNormalization: z.enum(['percentile_rank', 'min_max', 'target']).optional(),
});

const SimulateBody = z.object({
  targetPodId: z.string().uuid(),
  components: ComponentScores,
  totalPool: z.number().nonnegative().optional(),
});

const LockBody = z.object({
  /**
   * Locking with unresolved inputs is possible but is an override, so it has to
   * be asked for explicitly and is written to the audit log with what it
   * overrode. The default path refuses.
   */
  force: z.boolean().optional(),
});

export function registerBudgetRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate; budgetContext: () => BudgetServiceContext },
): void {
  /**
   * Everything `/budget/current-cycle` renders: the cycle, its totals, every
   * pod's allocation, the stored components and the lock checklist.
   *
   * Returns 404-shaped data (not an error) when no cycle has been calculated
   * yet, so the screen can say what has to happen first instead of failing.
   */
  app.get('/api/budget/cycle/current', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'budget.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const holdingId =
      typeof request.query === 'object' && request.query !== null
        ? ((request.query as Record<string, string>).holdingId ?? null)
        : null;

    const overview = await getCurrentCycleOverview(deps.budgetContext(), {
      orgId: principal.orgId,
      holdingId,
    });

    if (!overview) {
      return reply.code(404).send({
        error: 'no_budget_cycle',
        message:
          'No budget cycle has been calculated yet. The Architecture Hub sets the total pool and runs the calculation for the active sprint cycle.',
      });
    }

    return reply.send({ data: overview });
  });

  /**
   * The full calculation for one pod — 05's "show the formula taken to its
   * fullest": components with their raw inputs, the arithmetic line, the pool
   * math, and every adjustment as its own line.
   */
  app.get<{ Params: { podId: string }; Querystring: { cycleId?: string; cycleNumber?: string } }>(
    '/api/budget/pod/:podId/breakdown',
    async (request, reply) => {
      const resource = await resolvePodResource(deps.db, request.params.podId);
      const allowed = await guard(request, reply, 'budget.view_breakdown', resource);
      if (!allowed) return reply;

      const cycleNumber = request.query.cycleNumber
        ? Number(request.query.cycleNumber)
        : null;
      if (request.query.cycleNumber !== undefined && !Number.isInteger(cycleNumber)) {
        throw badRequest('cycleNumber must be a whole number');
      }

      const breakdown = await getPodBreakdown(deps.budgetContext(), {
        podId: request.params.podId,
        budgetCycleId: request.query.cycleId ?? null,
        cycleNumber,
      });

      return reply.send({ data: breakdown });
    },
  );

  /** One pod's score and budget across cycles, with its component sub-scores. */
  app.get<{ Querystring: { podId?: string; limit?: string } }>(
    '/api/budget/history',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const podId = request.query.podId;

      if (!podId) {
        throw badRequest('podId is required — history is always one pod\u2019s trend');
      }

      const resource = await resolvePodResource(deps.db, podId);
      const allowed = await guard(request, reply, 'budget.view', resource);
      if (!allowed) return reply;

      const limit = Math.min(Math.max(Number(request.query.limit ?? 24) || 24, 1), 60);
      const context = deps.budgetContext();
      const rows = await getPodHistory(context, podId, limit);
      const withComponents = await withComponentHistory(context, podId, rows);

      return reply.send({ data: { podId, orgId: principal.orgId, rows: withComponents } });
    },
  );

  /**
   * "What if our peer review score were ten points higher?"
   *
   * Stateless: it re-runs the real allocation with one pod's scores replaced and
   * returns. Nothing is written, which is the guarantee the screen's disclaimer
   * banner states.
   */
  app.post('/api/budget/simulate', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = SimulateBody.parse(request.body);

    const resource = await resolvePodResource(deps.db, body.targetPodId);
    const allowed = await guard(request, reply, 'budget.simulate', resource);
    if (!allowed) return reply;

    const result = await simulate(deps.budgetContext(), {
      orgId: principal.orgId,
      targetPodId: body.targetPodId,
      components: body.components,
      totalPool: body.totalPool,
    });

    return reply.send({ data: result });
  });

  /**
   * Set the pool and run the calculation. Architecture Hub only.
   *
   * Recomputing a provisional cycle is expected and idempotent; recomputing a
   * locked one is refused by the service with 409, because the numbers were
   * already announced.
   */
  app.post('/api/budget/cycle/compute', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = ComputeBody.parse(request.body);
    const allowed = await guard(request, reply, 'budget.configure_pool', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const result = await computeBudget(deps.budgetContext(), {
      orgId: principal.orgId,
      cycleId: body.cycleId,
      cycleNumber: body.cycleNumber,
      totalPool: body.totalPool,
      capFraction: body.capFraction,
      financialNormalization: body.financialNormalization,
      actorUserId: principal.id,
    });

    return reply.code(201).send({ data: result });
  });

  /** What stands between this cycle and a lock — rendered verbatim on screen. */
  app.get<{ Params: { id: string } }>(
    '/api/budget/cycle/:id/checklist',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'budget.lock_cycle', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const checklist = await lockChecklist(deps.budgetContext(), request.params.id);
      return reply.send({ data: checklist });
    },
  );

  /**
   * Lock the cycle at Day 89–90. Architecture Hub only, and only once the
   * calculation has run with no unresolved inputs — otherwise 409 with the list
   * of what is missing, so the refusal explains itself.
   */
  app.post<{ Params: { id: string } }>(
    '/api/budget/cycle/:id/lock',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'budget.lock_cycle', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const body = LockBody.parse(request.body ?? {});

      const { budgetCycle } = await lockCycle(deps.budgetContext(), {
        budgetCycleId: request.params.id,
        actorUserId: principal.id,
        force: body.force ?? false,
      });

      return reply.send({ data: budgetCycle });
    },
  );

  /**
   * Record a connector sync. The pod's own Pod Lead may push figures for their
   * pod; the Architecture Hub may push for any pod.
   *
   * Exists as an endpoint because 14-ROADMAP allows a CSV stand-in for the real
   * connector in this phase, and a stand-in still has to go through the same
   * door so the banner and the checklist behave identically.
   */
  const SyncBody = z.object({
    podId: z.string().uuid(),
    sourceSystem: z.string().min(1).max(120),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(['ok', 'failed', 'stale']),
    revenue: z.number().nullable().optional(),
    costs: z.number().nullable().optional(),
    profit: z.number().nullable().optional(),
    currency: z.string().min(3).max(8).optional(),
    error: z.string().max(500).nullable().optional(),
    cycleId: z.string().uuid().nullable().optional(),
  });

  app.post('/api/budget/financial-sync', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = SyncBody.parse(request.body);

    const pod = await getPod(deps.db, body.podId);
    if (!pod) throw notFound(`Pod ${body.podId} not found`);

    // A Pod Lead may report their own pod's figures; otherwise it is a hub
    // action. `can()` is used rather than `guard()` because this is a branch
    // between two permissions, not a gate — `guard()` would already have sent a
    // response by the time the second check ran.
    const podResource = { podId: pod.id, holdingId: pod.holdingId, orgId: pod.orgId };
    const ownPod = await request.auth.can('pod.submit_pitch', podResource);
    const hub = await request.auth.can('budget.configure_pool', { orgId: pod.orgId });
    if (!ownPod.allowed && !hub.allowed) {
      return guard(request, reply, 'budget.configure_pool', { orgId: pod.orgId })
        .then(() => reply);
    }

    if (body.status === 'ok' && (body.profit ?? null) === null) {
      throw badRequest('A successful sync must carry at least a profit figure');
    }

    const record = await recordFinancialSync(deps.db, {
      podId: body.podId,
      cycleId: body.cycleId ?? null,
      sourceSystem: body.sourceSystem,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      status: body.status,
      revenue: body.revenue ?? null,
      costs: body.costs ?? null,
      profit: body.profit ?? null,
      currency: body.currency ?? 'IRR',
      error: body.error ?? null,
    });

    return reply.code(201).send({ data: record });
  });
}
