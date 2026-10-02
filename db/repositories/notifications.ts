/**
 * Notification persistence (Module 11).
 *
 * Rows are written by the dispatcher (subscribed to the event bus) and read by
 * the `/notifications` screen. Needs-Action clearing is NOT done here with a
 * flag: the service re-queries the related entity's live state, so this file
 * deliberately exposes no "dismiss" mutation — only mark-read (informational)
 * and mark-actioned (recorded once the service confirms completion).
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { Notification, NotificationPreference, UUID } from '../../core/types';
import { toNotification, toNotificationPreference } from './rows';

export interface CreateNotificationInput {
  orgId: UUID;
  recipientUserId: UUID;
  triggerType: string;
  urgency: Notification['urgency'];
  title: string;
  contextText?: string | null;
  deepLink?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: UUID | null;
  sourceEventId?: UUID | null;
}

/**
 * Inserts a notification, deduplicating on (recipient, source_event) so a
 * replayed event cannot spam. Returns null when the row already existed.
 */
export async function createNotification(
  db: Queryable,
  input: CreateNotificationInput,
): Promise<Notification | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `INSERT INTO notification
       (org_id, recipient_user_id, trigger_type, urgency, title, context_text,
        deep_link, related_entity_type, related_entity_id, source_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (recipient_user_id, source_event_id)
       WHERE source_event_id IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [
      input.orgId,
      input.recipientUserId,
      input.triggerType,
      input.urgency,
      input.title,
      input.contextText ?? null,
      input.deepLink ?? null,
      input.relatedEntityType ?? null,
      input.relatedEntityId ?? null,
      input.sourceEventId ?? null,
    ],
  );
  return row ? toNotification(row) : null;
}

export async function listNotificationsForUser(
  db: Queryable,
  userId: UUID,
  limit = 100,
): Promise<Notification[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM notification WHERE recipient_user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toNotification);
}

export async function markNotificationRead(
  db: Queryable,
  notificationId: UUID,
  userId: UUID,
): Promise<Notification | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `UPDATE notification SET read_at = now()
      WHERE id = $1 AND recipient_user_id = $2
      RETURNING *`,
    [notificationId, userId],
  );
  return row ? toNotification(row) : null;
}

/** Recorded only after the service has confirmed the underlying action is done. */
export async function markNotificationActioned(
  db: Queryable,
  notificationId: UUID,
): Promise<void> {
  await db.query(
    `UPDATE notification SET actioned_at = now(), read_at = COALESCE(read_at, now())
      WHERE id = $1`,
    [notificationId],
  );
}

export async function markAllReadForUser(db: Queryable, userId: UUID): Promise<number> {
  const result = await db.query(
    `UPDATE notification SET read_at = now()
      WHERE recipient_user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return (result as { rowCount?: number }).rowCount ?? 0;
}

export async function countUnread(db: Queryable, userId: UUID): Promise<number> {
  const row = await queryOne<{ n: string }>(
    db,
    'SELECT COUNT(*)::text AS n FROM notification WHERE recipient_user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(row?.n ?? 0);
}

// --- preferences -----------------------------------------------------------

export async function listPreferencesForUser(
  db: Queryable,
  userId: UUID,
): Promise<NotificationPreference[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM notification_preference WHERE user_id = $1 ORDER BY urgency_level, channel',
    [userId],
  );
  return rows.map(toNotificationPreference);
}

/**
 * Upserts one (urgency, channel) preference. Urgent + in_app cannot be
 * disabled — the dispatcher enforces the minimum, but the store also refuses it
 * so a direct write cannot bypass the rule (11: urgent items are never muted).
 */
export async function upsertPreference(
  db: Queryable,
  input: {
    userId: UUID;
    urgencyLevel: Notification['urgency'];
    channel: import('../../core/types').NotificationChannel;
    enabled: boolean;
  },
): Promise<NotificationPreference> {
  if (input.urgencyLevel === 'urgent' && input.channel === 'in_app' && !input.enabled) {
    // Kept as a no-op that returns the forced-on state rather than throwing:
    // the caller is telling the truth about intent, and the rule is that the
    // channel stays on.
    input = { ...input, enabled: true };
  }
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO notification_preference (user_id, urgency_level, channel, enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, urgency_level, channel)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
     RETURNING *`,
    [input.userId, input.urgencyLevel, input.channel, input.enabled],
  );
  return toNotificationPreference(row);
}
