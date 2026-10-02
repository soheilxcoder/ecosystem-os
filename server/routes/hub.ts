/**
 * Strategic Hub Console endpoints (Module 09).
 *
 * Route map, straight from the module spec:
 *
 *   POST /api/hub/deployment/pods          — wizard Step 5, the ONLY pod creator
 *   GET  /api/hub/deployment/trials        — trial status tracker
 *   GET  /api/hub/deployment/setup-data    — wizard inputs (holdings, roster…)
 *   GET  /api/hub/architecture/model-health
 *   GET  /api/hub/strategic/reports        — published-only for investors
 *   POST /api/hub/strategic/reports
 *   POST /api/hub/strategic/reports/:id/publish
 *   GET/POST /api/hub/strategic/contacts   + interaction logging
 *   GET  /api/hub/pilots, POST /api/hub/pilots
 *   GET  /api/hub/pilots/:id
 *   POST /api/hub/pilots/:id/phase-update
 *   POST /api/hub/pilots/:id/criteria
 *   POST /api/hub/pilots/:id/decision
 *   GET  /api/hub/pilots/:id/expansion-prefill
 *
 * The permissions are the module's claim: `hub.deploy_unit` for deployment
 * writes, `hub.view_trials` for deployment reads, `hub.publish_investor_update`
 * for the strategic surface, `pilot.approve_expansion` (holding executive)
 * specifically for "expand", and `investor.view_report` for the portal — which
 * only ever lists PUBLISHED reports.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import {
  CONTACT_RELATIONSHIP_TYPES,
  CORRECTION_ENTITY_TYPES,
  CORRECTION_STATUSES,
  PILOT_DECISIONS,
  PILOT_PHASES,
  PILOT_PHASE_STATUSES,
} from '../../core/types';
import type {
  CorrectionEntityType,
  PilotPhase,
  PilotPhaseState,
  PilotPhaseStatus,
} from '../../core/types';
import {
  addContact,
  approveCorrection,
  createPilot,
  expansionPrefill,
  generateInvestorReport,
  getPilotOrThrow,
  launchPod,
  listCorrections,
  listExternalContacts,
  listPilotsForOrg,
  listReportsForOrg,
  listTrialStatus,
  logContactInteraction,
  proposeCorrection,
  publishReport,
  recordDecision,
  rejectCorrection,
  updatePilotCriteria,
  updatePilotPhaseState,
} from '../services/hub';
import { getRoster } from '../services/coaching';
import { createHolding, listUsersByOrg } from '../../db/repositories/users';
import { listActiveRolesForUser } from '../../db/repositories/roles';
import type { AuthzResult } from '../../core/permissions';
import { listRuleChanges } from '../../db/repositories/governance';
import { guard } from '../middleware/auth';
import { badRequest } from '../errors';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const uuid = z.string().uuid();

const LaunchPodBody = z.object({
  name: z.string().min(1).max(120),
  categoryTag: z.string().max(80).optional().nullable(),
  holdingId: uuid,
  memberEmails: z.array(z.string().email()).min(1).max(60),
  leadEmail: z.string().email().optional().nullable(),
  coachUserId: uuid.optional().nullable(),
  dataSourceSystem: z.string().max(120).optional().nullable(),
  trialStartDate: isoDate.optional(),
  criteria: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        met: z.boolean().optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
  pilotId: uuid.optional().nullable(),
});

const ReportBody = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
  holdingIds: z.array(uuid).default([]),
  podIds: z.array(uuid).default([]),
});

const PilotCreateBody = z.object({
  name: z.string().min(1).max(120),
  holdingId: uuid.optional().nullable(),
});

const PhaseUpdateBody = z.object({
  currentPhase: z.enum(PILOT_PHASES).optional(),
  phase: z.enum(PILOT_PHASES).optional(),
  status: z.enum(PILOT_PHASE_STATUSES).optional(),
  owner: z.string().max(160).optional().nullable(),
});

const CriteriaBody = z
  .object({
    decisionTimeBaseline: z.number().optional().nullable(),
    decisionTimeCurrent: z.number().optional().nullable(),
    satisfactionScore: z.number().optional().nullable(),
    profitBudgetRatioBaseline: z.number().optional().nullable(),
    profitBudgetRatioCurrent: z.number().optional().nullable(),
  })
  .strict();

const DecisionBody = z.object({
  decision: z.enum(PILOT_DECISIONS),
  lessonsLearned: z.string().max(4000).optional().nullable(),
});

const ContactBody = z.object({
  name: z.string().min(1).max(160),
  relationshipType: z.enum(CONTACT_RELATIONSHIP_TYPES),
  lastInteractionAt: isoDate.optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const InteractionBody = z.object({
  notes: z.string().max(4000).optional().nullable(),
});

export function registerHubRoutes(
  app: FastifyInstance,
  deps: { db: Database; bus: EventBus; today: () => ISODate },
): void {
  const context = () => ({ db: deps.db, bus: deps.bus, today: deps.today });

  // -------------------------------------------------------------------------
  // POST /api/hub/deployment/pods — the wizard's launch action
  // -------------------------------------------------------------------------
  app.post('/api/hub/deployment/pods', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = LaunchPodBody.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(`Invalid launch payload: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    }

    const result = await launchPod(context(), {
      orgId: principal.orgId,
      actorUserId: principal.id,
      ...parsed.data,
      criteria: parsed.data.criteria?.map((c) => ({ label: c.label, met: c.met ?? null })),
      trialStartDate: parsed.data.trialStartDate as ISODate | undefined,
    });
    return reply.code(201).send({ data: result });
  });

  // -------------------------------------------------------------------------
  // POST /api/hub/deployment/holdings — wizard Step 1 "new holding from zero"
  // -------------------------------------------------------------------------
  app.post('/api/hub/deployment/holdings', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = z
      .object({ name: z.string().min(1).max(120), code: z.string().max(12).optional().nullable() })
      .safeParse(request.body);
    if (!parsed.success) throw badRequest('The new holding needs a name');

    const holding = await createHolding(deps.db, {
      orgId: principal.orgId,
      name: parsed.data.name.trim(),
      code:
        parsed.data.code?.trim() ||
        parsed.data.name
          .trim()
          .slice(0, 3)
          .toUpperCase(),
    });
    return reply.code(201).send({ data: holding });
  });

  // -------------------------------------------------------------------------
  // GET /api/hub/deployment/trials — trial status tracker
  // -------------------------------------------------------------------------
  app.get('/api/hub/deployment/trials', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.view_trials', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await listTrialStatus(context(), principal.orgId) });
  });

  // -------------------------------------------------------------------------
  // GET /api/hub/deployment/setup-data — everything the wizard needs up front
  // -------------------------------------------------------------------------
  app.get('/api/hub/deployment/setup-data', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
    if (!allowed) return reply;

    const [users, roster] = await Promise.all([
      listUsersByOrg(deps.db, principal.orgId),
      getRoster({ db: deps.db, bus: deps.bus, today: deps.today }, { orgId: principal.orgId }),
    ]);

    return reply.send({
      data: {
        users: users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })),
        roster,
      },
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/hub/architecture/model-health — rule versioning pulse
  // -------------------------------------------------------------------------
  app.get('/api/hub/architecture/model-health', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    const changes = (await listRuleChanges(deps.db, principal.orgId)).slice(0, 20);
    const ruleNames = new Set(changes.map((c) => c.ruleName));
    const pending = changes.filter((c) => c.approvedAt === null);

    return reply.send({
      data: {
        activeRuleCount: ruleNames.size,
        pendingChangeCount: pending.length,
        changelog: changes,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Investor reports
  // -------------------------------------------------------------------------
  app.get('/api/hub/strategic/reports', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    // The Strategic Interactions hub sees drafts; investors only published.
    const strategic = await request.auth.can('hub.publish_investor_update', {
      orgId: principal.orgId,
    });
    if (strategic.allowed) {
      return reply.send({ data: await listReportsForOrg(deps.db, principal.orgId, false) });
    }
    // An investor seat is holding-scoped, so the guard needs that holding ref;
    // try each of the caller's active holding seats.
    const roles = await listActiveRolesForUser(deps.db, principal.id, deps.today());
    const holdingSeats = roles.filter(
      (r) => r.scopeType === 'holding' && (r.roleType === 'investor' || r.roleType === 'hub_strategic'),
    );
    let allowed: AuthzResult | null = null;
    for (const seat of holdingSeats) {
      const result = await request.auth.can('investor.view_report', {
        orgId: principal.orgId,
        holdingId: seat.scopeId,
      });
      if (result.allowed) {
        allowed = result;
        break;
      }
    }
    if (!allowed) {
      await reply.code(403).send({
        error: 'forbidden',
        message: 'Not allowed to perform "investor.view_report"',
        action: 'investor.view_report',
        reason: 'no_matching_holding_seat',
      });
      return reply;
    }
    return reply.send({ data: await listReportsForOrg(deps.db, principal.orgId, true) });
  });

  app.post('/api/hub/strategic/reports', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.publish_investor_update', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const parsed = ReportBody.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(`Invalid report request: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    }

    const { report, podCountInScope } = await generateInvestorReport(context(), {
      orgId: principal.orgId,
      actorUserId: principal.id,
      dateFrom: parsed.data.dateFrom as ISODate,
      dateTo: parsed.data.dateTo as ISODate,
      holdingIds: parsed.data.holdingIds,
      podIds: parsed.data.podIds,
    });
    return reply.code(201).send({ data: { ...report, podCountInScope } });
  });

  app.post<{ Params: { id: string } }>(
    '/api/hub/strategic/reports/:id/publish',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.publish_investor_update', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const published = await publishReport(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        reportId: request.params.id,
      });
      return reply.send({ data: published });
    },
  );

  // -------------------------------------------------------------------------
  // External contact log
  // -------------------------------------------------------------------------
  app.get('/api/hub/strategic/contacts', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.publish_investor_update', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    return reply.send({ data: await listExternalContacts(deps.db, principal.orgId) });
  });

  app.post('/api/hub/strategic/contacts', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.publish_investor_update', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const parsed = ContactBody.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(`Invalid contact: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    }
    const contact = await addContact(context(), {
      orgId: principal.orgId,
      actorUserId: principal.id,
      name: parsed.data.name,
      relationshipType: parsed.data.relationshipType,
      lastInteractionAt: parsed.data.lastInteractionAt as ISODate | null | undefined,
      notes: parsed.data.notes ?? null,
    });
    return reply.code(201).send({ data: contact });
  });

  app.post<{ Params: { id: string } }>(
    '/api/hub/strategic/contacts/:id/interaction',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.publish_investor_update', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const parsed = InteractionBody.safeParse(request.body);
      if (!parsed.success) throw badRequest('Invalid interaction payload');
      const updated = await logContactInteraction(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        contactId: request.params.id,
        notes: parsed.data.notes ?? null,
      });
      return reply.send({ data: updated });
    },
  );

  // -------------------------------------------------------------------------
  // Pilot programs
  // -------------------------------------------------------------------------
  app.get('/api/hub/pilots', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.view_trials', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await listPilotsForOrg(context(), principal.orgId) });
  });

  app.post('/api/hub/pilots', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = PilotCreateBody.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(`Invalid pilot: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    }
    const pilot = await createPilot(context(), {
      orgId: principal.orgId,
      actorUserId: principal.id,
      name: parsed.data.name,
      holdingId: parsed.data.holdingId ?? null,
    });
    return reply.code(201).send({ data: pilot });
  });

  app.get<{ Params: { id: string } }>('/api/hub/pilots/:id', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.view_trials', { orgId: principal.orgId });
    if (!allowed) return reply;

    return reply.send({ data: await getPilotOrThrow(deps.db, principal.orgId, request.params.id) });
  });

  app.post<{ Params: { id: string } }>(
    '/api/hub/pilots/:id/phase-update',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
      if (!allowed) return reply;

      const parsed = PhaseUpdateBody.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(`Invalid phase update: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
      }
      if (!parsed.data.currentPhase && !parsed.data.phase) {
        throw badRequest('Provide currentPhase or a phase to update');
      }

      const state: PilotPhaseState | undefined =
        parsed.data.phase && (parsed.data.status || parsed.data.owner !== undefined)
          ? {
              status: (parsed.data.status ?? 'in_progress') as PilotPhaseStatus,
              owner: parsed.data.owner ?? null,
            }
          : undefined;

      const updated = await updatePilotPhaseState(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        pilotId: request.params.id,
        currentPhase: parsed.data.currentPhase as PilotPhase | undefined,
        phase: parsed.data.phase as PilotPhase | undefined,
        state,
      });
      return reply.send({ data: updated });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/hub/pilots/:id/criteria',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
      if (!allowed) return reply;

      const parsed = CriteriaBody.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(`Invalid criteria: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
      }
      const updated = await updatePilotCriteria(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        pilotId: request.params.id,
        criteria: parsed.data,
      });
      return reply.send({ data: updated });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/hub/pilots/:id/decision',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();

      const parsed = DecisionBody.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(`Invalid decision: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
      }

      // Stop/repeat is the Deployment Hub's call; "expand" commits org
      // resources into a new unit, so the spec reserves it for the holding
      // executive (`pilot.approve_expansion`) — a different seat, checked
      // against the pilot's holding.
      if (parsed.data.decision === 'expand') {
        const pilot = await getPilotOrThrow(deps.db, principal.orgId, request.params.id);
        const approved = await guard(request, reply, 'pilot.approve_expansion', {
          orgId: principal.orgId,
          holdingId: pilot.holdingId,
        });
        if (!approved) return reply;
      } else {
        const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
        if (!allowed) return reply;
      }

      const updated = await recordDecision(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        pilotId: request.params.id,
        decision: parsed.data.decision,
        lessonsLearned: parsed.data.lessonsLearned ?? null,
      });
      return reply.send({ data: updated });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/hub/pilots/:id/expansion-prefill',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.deploy_unit', { orgId: principal.orgId });
      if (!allowed) return reply;

      return reply.send({
        data: await expansionPrefill(context(), principal.orgId, request.params.id),
      });
    },
  );

  // -------------------------------------------------------------------------
  // Correction records (13 §7) — the ONE path that may fix a locked number.
  // Only the Architecture Hub proposes/decides (two-person rule); the result is
  // public so the whole org can read what changed and why.
  // -------------------------------------------------------------------------
  app.get<{
    Querystring: { entityType?: string; entityId?: string; status?: string };
  }>('/api/hub/corrections', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'archive.search', { orgId: principal.orgId });
    if (!allowed) return reply;

    const entityType = request.query.entityType as CorrectionEntityType | undefined;
    if (entityType && !CORRECTION_ENTITY_TYPES.includes(entityType)) {
      throw badRequest(`Unknown entity type "${entityType}"`);
    }
    const status = request.query.status as 'pending' | 'approved' | 'rejected' | undefined;
    if (status && !CORRECTION_STATUSES.includes(status)) {
      throw badRequest(`Unknown status "${status}"`);
    }

    return reply.send({
      data: await listCorrections(context(), {
        orgId: principal.orgId,
        entityType,
        entityId: request.query.entityId ?? undefined,
        status,
      }),
    });
  });

  app.post('/api/hub/corrections', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = z
      .object({
        entityType: z.enum(CORRECTION_ENTITY_TYPES),
        entityId: uuid,
        fieldCorrected: z.string().min(1).max(80),
        correctedValue: z.unknown(),
        reason: z.string().min(10).max(4000),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(`Invalid correction: ${parsed.error.issues[0]?.message ?? 'bad input'}`);
    }

    const record = await proposeCorrection(context(), {
      orgId: principal.orgId,
      actorUserId: principal.id,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      fieldCorrected: parsed.data.fieldCorrected,
      correctedValue: parsed.data.correctedValue,
      reason: parsed.data.reason,
    });
    return reply.code(201).send({ data: record });
  });

  app.post<{ Params: { id: string } }>(
    '/api/hub/corrections/:id/approve',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
      if (!allowed) return reply;

      const record = await approveCorrection(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        correctionId: request.params.id,
      });
      return reply.send({ data: record });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/hub/corrections/:id/reject',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'hub.configure_rules', { orgId: principal.orgId });
      if (!allowed) return reply;

      const record = await rejectCorrection(context(), {
        orgId: principal.orgId,
        actorUserId: principal.id,
        correctionId: request.params.id,
      });
      return reply.send({ data: record });
    },
  );
}
