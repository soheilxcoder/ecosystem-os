/**
 * Notification endpoints (Module 11).
 *
 * The inbox is per-user and the two tabs from the module spec are server-shaped:
 *   - `all`           → everything the caller was told.
 *   - `needs_action`  → action-required/urgent items whose underlying action is
 *                       still outstanding.
 *
 * The Needs-Action tab is truthful by construction: before returning it, the
 * handler re-queries each item's related entity (via the dispatcher's
 * `isActionCompleted`) and marks done ones as actioned. There is no "dismiss"
 * endpoint — the only way an item leaves the tab is by completing the action.
 *
 * Preferences are a 3×3 urgency×channel matrix. The one invariant — urgent
 * items always reach the user in-app — is enforced both here (a PUT that tries
 * to turn it off is rejected) and in the repository (the upsert ignores it).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import type { Notification, NotificationUrgency, UUID } from '../../core/types';
import {
  countUnread,
  listNotificationsForUser,
  listPreferencesForUser,
  markAllReadForUser,
  markNotificationRead,
  upsertPreference,
} from '../../db/repositories/notifications';
import {
  isActionCompleted,
  sweepActionedNotifications,
} from '../services/notifications';
import { guard } from '../middleware/auth';
import { badRequest, notFound } from '../errors';

const URGENCIES: NotificationUrgency[] = ['informational', 'action_required', 'urgent'];
const CHANNELS = ['in_app', 'email', 'digest'] as const;

export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate },
): void {
  // -------------------------------------------------------------------------
  // GET /api/notifications?tab=all|needs_action&limit=
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { tab?: string; limit?: string } }>(
    '/api/notifications',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
      if (!allowed) return;

      // Truth first: clear any item whose action has since been completed.
      await sweepActionedNotifications({ db: deps.db, today: deps.today }, principal.id);

      const limit = Math.min(Math.max(Number(request.query.limit ?? 100), 1), 200);
      const all = await listNotificationsForUser(deps.db, principal.id, limit);
      const unread = await countUnread(deps.db, principal.id);

      const tab = request.query.tab === 'needs_action' ? 'needs_action' : 'all';
      const items =
        tab === 'needs_action'
          ? all.filter(
              (n) =>
                (n.urgency === 'action_required' || n.urgency === 'urgent') &&
                !n.actionedAt,
            )
          : all;

      return { data: { tab, unread, items } };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/notifications/counts
  //
  // A deliberately cheap summary for the shell's bell badge: total unread, plus
  // how many urgent items are still outstanding. It does NOT run the entity
  // sweep — the inbox does that when it opens; the badge only needs a hint.
  // -------------------------------------------------------------------------
  app.get('/api/notifications/counts', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return;

    const unread = await countUnread(deps.db, principal.id);
    const urgentRow = await deps.db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notification
        WHERE recipient_user_id = $1 AND urgency = 'urgent' AND actioned_at IS NULL`,
      [principal.id],
    );
    return { data: { unread, urgent: Number(urgentRow.rows[0]?.n ?? 0) } };
  });

  // -------------------------------------------------------------------------
  // POST /api/notifications/:id/read
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/api/notifications/:id/read',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
      if (!allowed) return;

      const updated = await markNotificationRead(deps.db, request.params.id, principal.id);
      if (!updated) throw notFound('Notification not found');
      return { data: { notification: updated } };
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/notifications/read-all
  // -------------------------------------------------------------------------
  app.post('/api/notifications/read-all', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return;
    const marked = await markAllReadForUser(deps.db, principal.id);
    return { data: { marked } };
  });

  // -------------------------------------------------------------------------
  // POST /api/notifications/sweep
  //
  // Re-evaluates outstanding Needs-Action items against live entity state and
  // returns the list that remains. Exposed so the UI can refresh after a user
  // completes an action elsewhere, without inventing a dismiss flag.
  // -------------------------------------------------------------------------
  app.post('/api/notifications/sweep', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return;

    await sweepActionedNotifications({ db: deps.db, today: deps.today }, principal.id);
    const all = await listNotificationsForUser(deps.db, principal.id, 200);
    const remaining = all.filter(
      (n: Notification) =>
        (n.urgency === 'action_required' || n.urgency === 'urgent') && !n.actionedAt,
    );
    return { data: { needsAction: remaining } };
  });

  // -------------------------------------------------------------------------
  // GET /api/notifications/preferences
  //
  // Returns the full 3×3 matrix with defaults filled in so the UI renders a
  // complete grid without guessing.
  // -------------------------------------------------------------------------
  app.get('/api/notifications/preferences', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return;

    const stored = await listPreferencesForUser(deps.db, principal.id);
    const matrix = URGENCIES.flatMap((urgency) =>
      CHANNELS.map((channel) => {
        const match = stored.find((p) => p.urgencyLevel === urgency && p.channel === channel);
        const enabled =
          match?.enabled ??
          (channel === 'in_app'
            ? true
            : channel === 'email'
              ? urgency !== 'informational'
              : urgency === 'informational');
        return {
          urgency,
          channel,
          enabled,
          locked: urgency === 'urgent' && channel === 'in_app',
        };
      }),
    );
    return { data: { matrix } };
  });

  // -------------------------------------------------------------------------
  // PUT /api/notifications/preferences
  // -------------------------------------------------------------------------
  const PreferenceBody = z.object({
    urgency: z.enum(URGENCIES as [NotificationUrgency, ...NotificationUrgency[]]),
    channel: z.enum(CHANNELS),
    enabled: z.boolean(),
  });

  app.put('/api/notifications/preferences', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return;

    const body = PreferenceBody.safeParse(request.body);
    if (!body.success) throw badRequest('Invalid preference payload');

    const { urgency, channel, enabled } = body.data;
    if (urgency === 'urgent' && channel === 'in_app' && !enabled) {
      throw badRequest('Urgent items always reach you in-app — that channel cannot be turned off');
    }

    const preference = await upsertPreference(deps.db, {
      userId: principal.id,
      urgencyLevel: urgency,
      channel,
      enabled,
    });
    return { data: { preference } };
  });
}
