/**
 * Coaching endpoints (Module 07).
 *
 * The six routes `07` lists, plus the handful the screens need to be usable
 * (opening one session, editing one, a pod's request flow, and a coach stating
 * their own capacity).
 *
 * The access-control shape worth knowing before reading the handlers:
 *
 * **Who is asking decides which session columns exist.** `resolveSessionViewer`
 * turns a permission check into a `SessionViewer`, and the service picks a
 * repository function from that viewer. A pod-scoped viewer reads the
 * `coaching_session_pod_visible` view, whose column list has no `private_notes`,
 * so the value is never fetched — not fetched-then-hidden. 07 requires this at
 * the query layer and requires it to hold against Company X's *other* hubs, so
 * `coach.view_private_notes` and `hub.manage_coaches` are checked separately and
 * only the Coaching Hub role satisfies the second.
 *
 * A coach's permission is also narrowed by *assignment*: holding the coach role
 * is not enough to open another coach's pods. `assertAssignedCoach` in the
 * service enforces that, so the role matrix stays about roles and the module
 * keeps its own fact.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import type { Principal, UUID } from '../../core/types';
import { COACHING_SESSION_TYPES } from '../../core/types';
import {
  assignCoach,
  declineSessionRequest,
  editSession,
  getCoachConsole,
  getMyCoach,
  getPodHealth,
  getPodHealthHistory,
  getRoster,
  getSession,
  listSessions,
  logSession,
  publishReassignmentReminders,
  refreshHealthSignals,
  requestSession,
  setCoachCapacity,
  type CoachingServiceContext,
  type SessionViewer,
} from '../services/coaching';
import { getPod, listPodsForUser } from '../../db/repositories/pods';
import { getCycleById } from '../../db/repositories/calendar';
import { guard, resolvePodResource } from '../middleware/auth';
import { badRequest, forbidden, notFound } from '../errors';

const SessionType = z.enum(COACHING_SESSION_TYPES);

const LogSessionBody = z.object({
  podId: z.string().uuid(),
  occurredAt: z.string().min(1),
  sessionType: SessionType,
  privateNotes: z.string().min(1, 'Private notes are required'),
  /**
   * Omitted or null means `[Save Private]`. A string means
   * `[Save & Share Summary with Pod]`. The distinction is preserved all the way
   * to the database column, because 07's whole point is that sharing is a
   * deliberate act and must be distinguishable afterwards.
   */
  podVisibleSummary: z.string().max(1000).nullish(),
  requestId: z.string().uuid().nullish(),
});

const EditSessionBody = z.object({
  occurredAt: z.string().min(1).optional(),
  sessionType: SessionType.optional(),
  privateNotes: z.string().min(1).optional(),
  // `.nullable()` matters: an explicit null withdraws a shared summary, which
  // is different from not mentioning the field at all.
  podVisibleSummary: z.string().max(1000).nullable().optional(),
});

const RequestSessionBody = z.object({
  podId: z.string().uuid(),
  topic: z.string().min(1).max(300),
  urgency: z.enum(['low', 'normal', 'high']).optional(),
  preferredTimes: z.string().max(500).nullish(),
});

const AssignBody = z.object({
  coachUserId: z.string().uuid(),
  podId: z.string().uuid(),
  startCycleId: z.string().uuid().nullish(),
  /** Required by the service when the pod already has a coach. */
  reasonForChange: z.string().max(1000).nullish(),
});

const CapacityBody = z.object({
  capacity: z.enum(['comfortable', 'stretched']),
  schedulingUrl: z.string().url().max(500).nullish(),
});

export function registerCoachingRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate; coachingContext: () => CoachingServiceContext },
): void {
  /**
   * Whether this principal holds the Coaching Hub seat.
   *
   * Checked separately from the coach role because the two see different scopes:
   * the Hub sees every pod's private notes, a coach only their own assignments.
   * `hub.manage_coaches` is the action that already encodes the Hub seat, so
   * this asks the matrix rather than pattern-matching a role name.
   */
  async function isCoachingHub(request: FastifyRequest, orgId: UUID): Promise<boolean> {
    const result = await request.auth.can('hub.manage_coaches', { orgId });
    return result.allowed;
  }

  /**
   * Resolves the caller into a `SessionViewer` for one pod.
   *
   * Order matters and is deliberate:
   *   1. Coaching Hub → sees everything, for any pod in the org.
   *   2. The pod's assigned coach → sees everything, for that pod only.
   *   3. A member of that pod → pod-visible history only.
   *
   * A user who is both a coach elsewhere and a pod member here lands in (3) for
   * this pod, which is correct: their coach role does not travel to a pod they
   * are not assigned to.
   */
  async function resolveSessionViewer(
    request: FastifyRequest,
    principal: Principal,
    podId: UUID,
  ): Promise<SessionViewer> {
    if (await isCoachingHub(request, principal.orgId)) {
      return { kind: 'coaching_hub' };
    }

    const coachAllowed = await request.auth.can('coach.view_private_notes', {
      orgId: principal.orgId,
      podId,
    });
    if (coachAllowed.allowed) {
      return { kind: 'coach', coachUserId: principal.id };
    }

    return { kind: 'pod', podId };
  }

  /**
   * Confirms the caller may act on this pod at all — member, lead, coach or Hub.
   *
   * `pod.view` is the matrix's own answer and already covers members and leads;
   * the coach and Hub seats are added by the checks above. This exists so a
   * stranger cannot enumerate pods through the coaching endpoints.
   */
  async function assertPodAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    principal: Principal,
    podId: UUID,
  ): Promise<boolean> {
    const pod = await getPod(deps.db, podId);
    if (!pod) {
      await reply.code(404).send({ error: 'not_found', message: `Pod ${podId} not found` });
      return false;
    }
    if (pod.orgId !== principal.orgId) {
      await reply.code(403).send({
        error: 'forbidden',
        message: 'That pod belongs to a different organisation',
      });
      return false;
    }

    const hub = await isCoachingHub(request, principal.orgId);
    if (hub) return true;

    const allowed = await guard(request, reply, 'pod.view', {
      orgId: pod.orgId,
      holdingId: pod.holdingId,
      podId,
    });
    return allowed !== null;
  }

  // -------------------------------------------------------------------------
  // GET /api/coaching/my-coach?podId=
  // -------------------------------------------------------------------------
  /**
   * The pod member's view: who our coach is, how to reach them, when they
   * rotate, and the sessions they chose to share.
   *
   * `podId` is optional — when omitted it resolves to the caller's own pod,
   * which is what the nav item means by "my coach". A caller in several pods
   * must name one, rather than have the endpoint pick silently.
   */
  app.get<{ Querystring: { podId?: string } }>('/api/coaching/my-coach', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    let podId = request.query.podId ?? null;

    if (!podId) {
      const mine = await listPodsForUser(deps.db, principal.id);
      if (mine.length === 0) {
        return reply.code(404).send({
          error: 'no_pod',
          message:
            'You are not a member of any pod, so there is no coach to show. ' +
            'The Coaching Hub assigns a coach when a pod is deployed.',
        });
      }
      if (mine.length > 1) {
        // Refusing rather than guessing: showing the wrong pod's coach would be
        // a privacy leak in miniature, and the screen can offer a picker.
        return reply.code(400).send({
          error: 'pod_id_required',
          message: 'You belong to several pods — pass ?podId= to choose one',
          pods: mine.map((pod) => ({ id: pod.id, name: pod.name })),
        });
      }
      podId = mine[0]!.id;
    }

    if (!(await assertPodAccess(request, reply, principal, podId))) return reply;

    const view = await getMyCoach(deps.coachingContext(), {
      orgId: principal.orgId,
      podId,
    });

    return reply.send({ data: view });
  });

  // -------------------------------------------------------------------------
  // GET /api/coaching/console?coachUserId=
  // -------------------------------------------------------------------------
  /**
   * The coach's console: their assigned pods, each pod's health signal, the
   * reassignment countdown and any red-streak suggestion.
   *
   * `coachUserId` defaults to the caller. Supplying someone else's id requires
   * the Coaching Hub seat — a coach cannot read a colleague's console, because
   * that console carries private notes for pods the caller is not assigned to.
   */
  app.get<{ Querystring: { coachUserId?: string } }>(
    '/api/coaching/console',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const requested = request.query.coachUserId ?? null;
      const coachUserId = requested ?? principal.id;

      if (requested && requested !== principal.id) {
        if (!(await isCoachingHub(request, principal.orgId))) {
          throw forbidden(
            'Only the Coaching Hub may open another coach\u2019s console',
            'not_coaching_hub',
          );
        }
      } else {
        const allowed = await guard(request, reply, 'coach.view_pods', {
          orgId: principal.orgId,
        });
        if (!allowed) return reply;
      }

      const console = await getCoachConsole(deps.coachingContext(), {
        orgId: principal.orgId,
        coachUserId,
      });

      return reply.send({ data: console });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/coaching/sessions
  // -------------------------------------------------------------------------
  /**
   * Logs a session. The two buttons on the session screen both arrive here and
   * differ only in whether `podVisibleSummary` is present.
   *
   * The coach is always the caller: there is no `coachUserId` in the body, so a
   * request cannot log a session on somebody else's behalf.
   */
  app.post('/api/coaching/sessions', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = LogSessionBody.parse(request.body);

    const resource = await resolvePodResource(deps.db, body.podId);
    const allowed = await guard(request, reply, 'coach.log_session', resource);
    if (!allowed) return reply;

    const session = await logSession(deps.coachingContext(), {
      orgId: principal.orgId,
      coachUserId: principal.id,
      podId: body.podId,
      occurredAt: body.occurredAt,
      sessionType: body.sessionType,
      privateNotes: body.privateNotes,
      podVisibleSummary: body.podVisibleSummary ?? null,
      requestId: body.requestId ?? null,
      actorUserId: principal.id,
    });

    return reply.code(201).send({ data: session });
  });

  // -------------------------------------------------------------------------
  // GET /api/coaching/sessions/:sessionId
  // -------------------------------------------------------------------------
  /**
   * One session, shaped by who asks.
   *
   * A pod member gets the pod-visible projection: every session appears in the
   * pod's history (07 §my-coach: "date, brief topic/note if the coach chose to
   * share one"), so an unshared session reads as a date with no note rather
   * than vanishing. What never appears is `private_notes` — the view's column
   * list does not contain it. A genuinely unknown id is a 404 for everyone.
   */
  app.get<{ Params: { sessionId: string } }>(
    '/api/coaching/sessions/:sessionId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const sessionId = request.params.sessionId;

      // The pod is read from the session rather than the query string, so a
      // caller cannot widen their own access by naming a different pod.
      const owned = await deps.db.query<{ pod_id: UUID }>(
        'SELECT pod_id FROM coaching_session WHERE id = $1',
        [sessionId],
      );
      const podId = owned.rows[0]?.pod_id;
      if (!podId) throw notFound(`Coaching session ${sessionId} not found`);

      if (!(await assertPodAccess(request, reply, principal, podId))) return reply;

      const viewer = await resolveSessionViewer(request, principal, podId);
      const session = await getSession(deps.coachingContext(), { sessionId, viewer });

      return reply.send({
        data: {
          session,
          /**
           * Tells the screen which shape it received, so it renders the
           * private-notes editor or the shared-summary card without inferring it
           * from the presence of a field.
           */
          includesPrivateNotes: viewer.kind !== 'pod',
        },
      });
    },
  );

  /** A pod's session history, through the same viewer resolution. */
  app.get<{ Querystring: { podId: string; limit?: string } }>(
    '/api/coaching/sessions',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const podId = request.query.podId;
      if (!podId) throw badRequest('podId is required');

      if (!(await assertPodAccess(request, reply, principal, podId))) return reply;

      const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 200);
      const viewer = await resolveSessionViewer(request, principal, podId);
      const sessions = await listSessions(deps.coachingContext(), { podId, viewer, limit });

      return reply.send({ data: { podId, sessions, includesPrivateNotes: viewer.kind !== 'pod' } });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /api/coaching/sessions/:sessionId
  // -------------------------------------------------------------------------
  /**
   * Edits a session, including withdrawing a summary that was shared.
   *
   * Passing `podVisibleSummary: null` un-shares it. That is allowed and audited:
   * a coach who released something too candid should be able to take it back,
   * and the audit row records that the sharing state changed.
   */
  app.patch<{ Params: { sessionId: string } }>(
    '/api/coaching/sessions/:sessionId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const body = EditSessionBody.parse(request.body);

      const allowed = await guard(request, reply, 'coach.log_session', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const session = await editSession(deps.coachingContext(), {
        sessionId: request.params.sessionId,
        coachUserId: principal.id,
        occurredAt: body.occurredAt,
        sessionType: body.sessionType,
        privateNotes: body.privateNotes,
        podVisibleSummary: body.podVisibleSummary,
        actorUserId: principal.id,
      });

      return reply.send({ data: session });
    },
  );

  // -------------------------------------------------------------------------
  // Session requests — the pod's way in
  // -------------------------------------------------------------------------
  app.post('/api/coaching/requests', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = RequestSessionBody.parse(request.body);

    const resource = await resolvePodResource(deps.db, body.podId);
    const allowed = await guard(request, reply, 'pod.view', resource);
    if (!allowed) return reply;

    // A request is only meaningful from inside the pod: the coach needs to know
    // who is asking, and an outsider should not be able to book a pod's coach.
    const mine = await listPodsForUser(deps.db, principal.id);
    const isMember = mine.some((pod) => pod.id === body.podId);
    if (!isMember && !(await isCoachingHub(request, principal.orgId))) {
      throw forbidden(
        'Only a member of the pod may request a session with its coach',
        'not_pod_member',
      );
    }

    const created = await requestSession(deps.coachingContext(), {
      orgId: principal.orgId,
      podId: body.podId,
      requestedBy: principal.id,
      topic: body.topic,
      urgency: body.urgency ?? 'normal',
      preferredTimes: body.preferredTimes ?? null,
    });

    return reply.code(201).send({ data: created });
  });

  app.post<{ Params: { requestId: string } }>(
    '/api/coaching/requests/:requestId/decline',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();

      const allowed = await guard(request, reply, 'coach.view_pods', {
        orgId: principal.orgId,
      });
      if (!allowed) return reply;

      const declined = await declineSessionRequest(deps.coachingContext(), {
        requestId: request.params.requestId,
        coachUserId: principal.id,
        actorUserId: principal.id,
      });

      return reply.send({ data: declined });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/coaching/roster  (Coaching Hub only)
  // -------------------------------------------------------------------------
  /**
   * The assignment matrix: every coach with their pods, every pod with its
   * coach, ratio guidance and the review-due queue.
   *
   * Gated on `hub.manage_coaches`, which only the Coaching Hub holds. The other
   * hubs do not — 07 singles out that even Company X's own hubs are outside a
   * coach's private material, and the roster is the screen where the Hub sees
   * health signals for pods it does not coach.
   */
  app.get('/api/coaching/roster', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();

    const allowed = await guard(request, reply, 'hub.manage_coaches', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const roster = await getRoster(deps.coachingContext(), { orgId: principal.orgId });

    return reply.send({ data: roster });
  });

  // -------------------------------------------------------------------------
  // POST /api/coaching/assignments  (Coaching Hub only)
  // -------------------------------------------------------------------------
  /**
   * Assigns or reassigns a coach.
   *
   * The response always includes `ratioWarning` and `podCountAfter`. A warning
   * is not a failure — the assignment has already been written by the time the
   * caller reads it, which is exactly what 07 asks for ("warn but not block").
   * The screen shows the sentence; nothing refuses.
   */
  app.post('/api/coaching/assignments', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = AssignBody.parse(request.body);

    const allowed = await guard(request, reply, 'hub.manage_coaches', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const result = await assignCoach(deps.coachingContext(), {
      orgId: principal.orgId,
      coachUserId: body.coachUserId,
      podId: body.podId,
      startCycleId: body.startCycleId ?? null,
      reasonForChange: body.reasonForChange ?? null,
      actorUserId: principal.id,
    });

    return reply.code(201).send({ data: result });
  });

  /** A coach states their own capacity. Never settable by the Hub. */
  app.put('/api/coaching/profile', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const body = CapacityBody.parse(request.body);

    const allowed = await guard(request, reply, 'coach.view_pods', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const profile = await setCoachCapacity(deps.coachingContext(), {
      orgId: principal.orgId,
      coachUserId: principal.id,
      capacity: body.capacity,
      schedulingUrl: body.schedulingUrl ?? null,
    });

    return reply.send({ data: profile });
  });

  // -------------------------------------------------------------------------
  // GET /api/coaching/pod-health/:podId?cycleId=
  // -------------------------------------------------------------------------
  /**
   * One pod's health signal with the factors and provenance behind it.
   *
   * Health is org-readable like budget totals: it is derived from data the pods
   * already publish (their own check-ins, announced scores, submitted reviews)
   * and a coach covering several holdings needs to see across them. The private
   * material in this module is the session notes, not the signal.
   *
   * Computes on read when the cycle has no stored signal yet, so the endpoint is
   * useful before any nightly job has run.
   */
  app.get<{ Params: { podId: string }; Querystring: { cycleId?: string; history?: string } }>(
    '/api/coaching/pod-health/:podId',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const podId = request.params.podId;

      const resource = await resolvePodResource(deps.db, podId);
      const allowed = await guard(request, reply, 'budget.view', resource);
      if (!allowed) return reply;

      const context = deps.coachingContext();

      // `?history=` returns the stored trend instead of one cycle, and never
      // recomputes — a history chart should show what was actually reported.
      if (request.query.history !== undefined) {
        const limit = Math.min(Math.max(Number(request.query.history) || 12, 1), 36);
        const rows = await getPodHealthHistory(context, podId, limit);
        return reply.send({ data: { podId, history: rows } });
      }

      let cycleId = request.query.cycleId ?? null;
      if (!cycleId) {
        const pod = await getPod(deps.db, podId);
        if (!pod) throw notFound(`Pod ${podId} not found`);
        const active = await deps.db.query<{ id: UUID }>(
          `SELECT id FROM sprint_cycle
            WHERE org_id = $1 AND status = 'active'
              AND (holding_id = $2 OR holding_id IS NULL)
            ORDER BY holding_id NULLS LAST
            LIMIT 1`,
          [pod.orgId, pod.holdingId],
        );
        cycleId = active.rows[0]?.id ?? null;
        if (!cycleId) {
          return reply.code(404).send({
            error: 'no_active_cycle',
            message:
              'No sprint cycle is active yet, so there is no period to score health against.',
          });
        }
      }

      const cycle = await getCycleById(deps.db, cycleId);
      if (!cycle) throw notFound(`Cycle ${cycleId} not found`);

      const computed = await getPodHealth(context, {
        orgId: principal.orgId,
        podId,
        cycleId,
      });

      return reply.send({
        data: { signal: computed, cycleNumber: cycle.cycleNumber },
      });
    },
  );

  /**
   * Recomputes health for every pod in a cycle.
   *
   * Coaching Hub and coach only: it is a write (it upserts stored signals and
   * can publish red-transition events), so it is not open to every pod even
   * though reading a signal is.
   */
  app.post<{ Querystring: { cycleId?: string } }>(
    '/api/coaching/pod-health/refresh',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();

      const hub = await isCoachingHub(request, principal.orgId);
      if (!hub) {
        const allowed = await guard(request, reply, 'coach.view_pods', {
          orgId: principal.orgId,
        });
        if (!allowed) return reply;
      }

      let cycleId = request.query.cycleId ?? null;
      if (!cycleId) {
        const active = await deps.db.query<{ id: UUID }>(
          `SELECT id FROM sprint_cycle
            WHERE org_id = $1 AND status = 'active' AND holding_id IS NULL
            LIMIT 1`,
          [principal.orgId],
        );
        cycleId = active.rows[0]?.id ?? null;
        if (!cycleId) {
          return reply.code(404).send({
            error: 'no_active_cycle',
            message: 'No org-wide sprint cycle is active, so there is nothing to refresh.',
          });
        }
      }

      const result = await refreshHealthSignals(deps.coachingContext(), {
        orgId: principal.orgId,
        cycleId,
      });

      return reply.send({ data: result });
    },
  );

  /**
   * Publishes reassignment-due reminders.
   *
   * Idempotent per (assignment, urgency) through the audit log, so a scheduler
   * can call it every cycle without spamming the Hub. Still only a reminder: the
   * move itself needs a human at the roster.
   */
  app.post('/api/coaching/reassignment-reminders', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();

    const allowed = await guard(request, reply, 'hub.manage_coaches', {
      orgId: principal.orgId,
    });
    if (!allowed) return reply;

    const published = await publishReassignmentReminders(deps.coachingContext(), {
      orgId: principal.orgId,
    });

    return reply.send({ data: { published } });
  });
}
