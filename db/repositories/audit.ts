/**
 * Append-only audit log + domain event outbox.
 *
 * 13-TECHNICAL-ARCHITECTURE.md §6: every state-changing action across all
 * modules is recorded. The table itself refuses UPDATE/DELETE (enforced by a
 * database trigger), so application bugs cannot quietly rewrite history.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany } from '../client';
import type { AuditLogEntry, UUID } from '../../core/types';
import { toAuditLogEntry } from './rows';

export interface RecordAuditInput {
  actorUserId: UUID | null;
  action: string;
  entityType?: string | null;
  entityId?: UUID | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ip?: string | null;
}

export async function recordAudit(
  db: Queryable,
  input: RecordAuditInput,
): Promise<AuditLogEntry> {
  return toAuditLogEntry(
    await insertOne(
      db,
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata, request_id, ip)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING *`,
      [
        input.actorUserId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.requestId ?? null,
        input.ip ?? null,
      ],
    ),
  );
}

export async function listAuditForEntity(
  db: Queryable,
  entityType: string,
  entityId: UUID,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM audit_log
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [entityType, entityId, limit],
  );
  return rows.map(toAuditLogEntry);
}

export async function listRecentAudit(db: Queryable, limit = 100): Promise<AuditLogEntry[]> {
  const rows = await queryMany(
    db,
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return rows.map(toAuditLogEntry);
}

/** Writes a published domain event into the durable outbox. */
export async function persistDomainEvent(
  db: Queryable,
  event: {
    id: UUID;
    type: string;
    aggregateType: string | null;
    aggregateId: UUID | null;
    payload: unknown;
    actorUserId: UUID | null;
    orgId: UUID | null;
    occurredAt: string;
  },
): Promise<void> {
  await insertOne(
    db,
    `INSERT INTO domain_event
       (id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, org_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::timestamptz)
     RETURNING id`,
    [
      event.id,
      event.type,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload ?? {}),
      event.actorUserId,
      event.orgId,
      event.occurredAt,
    ],
  );
}

export interface DomainEventRow {
  id: UUID;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: UUID | null;
  payload: Record<string, unknown>;
  actor_user_id: UUID | null;
  org_id: UUID | null;
  occurred_at: string;
  processed_at: string | null;
}

export async function listUnprocessedEvents(
  db: Queryable,
  limit = 100,
): Promise<DomainEventRow[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM domain_event
      WHERE processed_at IS NULL
      ORDER BY occurred_at
      LIMIT $1`,
    [limit],
  );
  return rows as DomainEventRow[];
}

export async function markEventProcessed(db: Queryable, eventId: UUID): Promise<void> {
  await db.query('UPDATE domain_event SET processed_at = now() WHERE id = $1', [eventId]);
}
