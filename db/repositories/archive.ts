/**
 * Archive persistence (Module 10).
 *
 * An index, not a store: rows carry a title, summary and a pointer
 * (entity_type + entity_id) back to the module of origin. Search filters over
 * those fields; it never returns the source record itself, and the read path
 * deep-links to the source so the two can never drift apart.
 *
 * Privacy: the only indexable entity types are the transactional records the
 * source modules emit. A coaching session's private notes are not one of them
 * and no event payload carries them, so they are structurally unable to appear
 * in a search result.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { ArchiveEntityType, ArchiveIndexEntry, LessonLearned, UUID } from '../../core/types';
import { toArchiveIndexEntry, toLessonLearned } from './rows';

export interface CreateArchiveEntryInput {
  orgId: UUID;
  entityType: ArchiveEntityType;
  entityId?: UUID | null;
  title: string;
  summary?: string | null;
  podIds?: UUID[];
  holdingId?: UUID | null;
  tags?: string[];
  occurredAt?: string | null;
  sourceEventId?: UUID | null;
}

/**
 * Inserts an index row, deduplicating on (entity_type, entity_id, source_event)
 * so a replayed event cannot index the same record twice. Returns null when the
 * row already existed.
 */
export async function createArchiveEntry(
  db: Queryable,
  input: CreateArchiveEntryInput,
): Promise<ArchiveIndexEntry | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `INSERT INTO archive_index_entry
       (org_id, entity_type, entity_id, title, summary, pod_ids, holding_id, tags,
        occurred_at, source_event_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, COALESCE($9::timestamptz, now()), $10)
     ON CONFLICT (entity_type, entity_id, source_event_id)
       WHERE source_event_id IS NOT NULL AND entity_id IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [
      input.orgId,
      input.entityType,
      input.entityId ?? null,
      input.title,
      input.summary ?? null,
      JSON.stringify(input.podIds ?? []),
      input.holdingId ?? null,
      JSON.stringify(input.tags ?? []),
      input.occurredAt ?? null,
      input.sourceEventId ?? null,
    ],
  );
  return row ? toArchiveIndexEntry(row) : null;
}

export interface ArchiveSearchParams {
  orgId: UUID;
  q?: string | null;
  entityType?: ArchiveEntityType | null;
  podId?: UUID | null;
  holdingId?: UUID | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
}

/**
 * Filtered search over the index. `q` matches title, summary and tags; the
 * other params are exact/range filters. Results are reverse-chronological.
 */
export async function searchArchive(
  db: Queryable,
  params: ArchiveSearchParams,
): Promise<ArchiveIndexEntry[]> {
  const clauses: string[] = ['org_id = $1'];
  const values: unknown[] = [params.orgId];
  let next = 2;

  if (params.q && params.q.trim()) {
    const needle = `%${params.q.trim().toLowerCase()}%`;
    clauses.push(
      `(lower(title) LIKE $${next} OR lower(coalesce(summary, '')) LIKE $${next} OR lower(tags::text) LIKE $${next})`,
    );
    values.push(needle);
    next += 1;
  }
  if (params.entityType) {
    clauses.push(`entity_type = $${next}`);
    values.push(params.entityType);
    next += 1;
  }
  if (params.podId) {
    clauses.push(`pod_ids @> $${next}::jsonb`);
    values.push(JSON.stringify([params.podId]));
    next += 1;
  }
  if (params.holdingId) {
    clauses.push(`holding_id = $${next}`);
    values.push(params.holdingId);
    next += 1;
  }
  if (params.dateFrom) {
    clauses.push(`occurred_at >= $${next}::timestamptz`);
    values.push(params.dateFrom);
    next += 1;
  }
  if (params.dateTo) {
    clauses.push(`occurred_at <= $${next}::timestamptz`);
    values.push(params.dateTo);
    next += 1;
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM archive_index_entry
      WHERE ${clauses.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${next}`,
    [...values, limit],
  );
  return rows.map(toArchiveIndexEntry);
}

/** Org-wide or pod-scoped reverse-chronological activity feed. */
export async function listArchiveActivity(
  db: Queryable,
  input: { orgId: UUID; podId?: UUID | null; limit?: number },
): Promise<ArchiveIndexEntry[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  if (input.podId) {
    const rows = await queryMany<Record<string, unknown>>(
      db,
      `SELECT * FROM archive_index_entry
        WHERE org_id = $1 AND pod_ids @> $2::jsonb
        ORDER BY occurred_at DESC LIMIT $3`,
      [input.orgId, JSON.stringify([input.podId]), limit],
    );
    return rows.map(toArchiveIndexEntry);
  }
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM archive_index_entry WHERE org_id = $1 ORDER BY occurred_at DESC LIMIT $2',
    [input.orgId, limit],
  );
  return rows.map(toArchiveIndexEntry);
}

// --- lessons learned -------------------------------------------------------

export interface CreateLessonInput {
  orgId: UUID;
  relatedEntityType?: string | null;
  relatedEntityId?: UUID | null;
  whatHappened: string;
  whatWedDoDifferently?: string | null;
  tags?: string[];
  createdBy?: UUID | null;
}

export async function createLessonLearned(
  db: Queryable,
  input: CreateLessonInput,
): Promise<LessonLearned> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO lesson_learned
       (org_id, related_entity_type, related_entity_id, what_happened,
        what_wed_do_differently, tags, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING *`,
    [
      input.orgId,
      input.relatedEntityType ?? null,
      input.relatedEntityId ?? null,
      input.whatHappened,
      input.whatWedDoDifferently ?? null,
      JSON.stringify(input.tags ?? []),
      input.createdBy ?? null,
    ],
  );
  return toLessonLearned(row);
}

export async function listLessons(
  db: Queryable,
  input: { orgId: UUID; tag?: string | null; limit?: number },
): Promise<LessonLearned[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  if (input.tag) {
    const rows = await queryMany<Record<string, unknown>>(
      db,
      `SELECT * FROM lesson_learned
        WHERE org_id = $1 AND tags @> $2::jsonb
        ORDER BY created_at DESC LIMIT $3`,
      [input.orgId, JSON.stringify([input.tag]), limit],
    );
    return rows.map(toLessonLearned);
  }
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM lesson_learned WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2',
    [input.orgId, limit],
  );
  return rows.map(toLessonLearned);
}
