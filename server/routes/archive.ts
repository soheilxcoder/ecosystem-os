/**
 * Archive endpoints (Module 10).
 *
 * The archive is an index, not a store: every result is a title, a summary and
 * a deep link back to the module of origin. Nothing here returns the underlying
 * record, so the source modules stay the system of record and the two cannot
 * drift apart.
 *
 * Privacy: the only rows that can ever be returned are the ones the indexer
 * wrote, and the indexer only ever sees transactional events (pitches, CLOUs,
 * budget locks, governance records, lessons). A coaching session's private
 * notes are not an indexable entity and never appear in any payload, so search
 * structurally cannot leak them.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import type { ArchiveEntityType, ArchiveIndexEntry, UUID } from '../../core/types';
import {
  createArchiveEntry,
  createLessonLearned,
  listArchiveActivity,
  listLessons,
  searchArchive,
} from '../../db/repositories/archive';
import { guard } from '../middleware/auth';
import { badRequest } from '../errors';

const ENTITY_TYPES: ArchiveEntityType[] = [
  'pitch',
  'cloud',
  'budget_cycle',
  'accountability_case',
  'entry_trial',
  'rule_change',
  'lesson',
  'pod',
  'correction',
];

/** The module each indexed entity lives in — drives the search-result link. */
function deepLinkFor(entry: ArchiveIndexEntry): string {
  switch (entry.entityType) {
    case 'pitch':
      return '/pod';
    case 'cloud':
      return '/agreements';
    case 'budget_cycle':
      return '/budget/current-cycle';
    case 'accountability_case':
    case 'entry_trial':
      return '/pod';
    case 'rule_change':
      return '/dashboard';
    case 'lesson':
      return '/archive/lessons';
    case 'pod':
      return '/hub/deployment';
    case 'correction':
      return '/hub/architecture';
    default:
      return '/archive/decisions';
  }
}

function withLink(entry: ArchiveIndexEntry) {
  return { ...entry, deepLink: deepLinkFor(entry) };
}

export function registerArchiveRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate },
): void {
  // -------------------------------------------------------------------------
  // GET /api/archive/search?q=&entityType=&podId=&holdingId=&dateFrom=&dateTo=
  // -------------------------------------------------------------------------
  app.get<{
    Querystring: {
      q?: string;
      entityType?: string;
      podId?: string;
      holdingId?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string;
    };
  }>('/api/archive/search', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'archive.search', { orgId: principal.orgId });
    if (!allowed) return;

    const entityType = request.query.entityType as ArchiveEntityType | undefined;
    if (entityType && !ENTITY_TYPES.includes(entityType)) {
      throw badRequest(`Unknown entity type "${entityType}"`);
    }

    const results = await searchArchive(deps.db, {
      orgId: principal.orgId,
      q: request.query.q ?? null,
      entityType: entityType ?? null,
      podId: request.query.podId ?? null,
      holdingId: request.query.holdingId ?? null,
      dateFrom: request.query.dateFrom ?? null,
      dateTo: request.query.dateTo ?? null,
      limit: request.query.limit ? Number(request.query.limit) : undefined,
    });

    return { data: { count: results.length, results: results.map(withLink) } };
  });

  // -------------------------------------------------------------------------
  // GET /api/archive/activity?podId=&limit=
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { podId?: string; limit?: string } }>(
    '/api/archive/activity',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'archive.search', { orgId: principal.orgId });
      if (!allowed) return;

      const items = await listArchiveActivity(deps.db, {
        orgId: principal.orgId,
        podId: request.query.podId ?? null,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
      });
      return { data: { count: items.length, items: items.map(withLink) } };
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/archive/lessons?tag=&limit=
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { tag?: string; limit?: string } }>(
    '/api/archive/lessons',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'archive.search', { orgId: principal.orgId });
      if (!allowed) return;

      const items = await listLessons(deps.db, {
        orgId: principal.orgId,
        tag: request.query.tag ?? null,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
      });
      return { data: { count: items.length, items } };
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/archive/lessons
  //
  // A lesson is authored, not event-derived, so the route writes both the
  // lesson row and its index entry in one go.
  // -------------------------------------------------------------------------
  const LessonBody = z.object({
    whatHappened: z.string().min(10, 'Describe what happened'),
    whatWedDoDifferently: z.string().max(2000).nullish(),
    tags: z.array(z.string().min(1).max(60)).max(10).optional(),
    relatedEntityType: z.string().max(60).nullish(),
    relatedEntityId: z.string().uuid().nullish(),
  });

  app.post('/api/archive/lessons', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'archive.search', { orgId: principal.orgId });
    if (!allowed) return;

    const body = LessonBody.safeParse(request.body);
    if (!body.success) {
      throw badRequest(body.error.issues[0]?.message ?? 'Invalid lesson payload');
    }

    const lesson = await createLessonLearned(deps.db, {
      orgId: principal.orgId,
      relatedEntityType: body.data.relatedEntityType ?? null,
      relatedEntityId: body.data.relatedEntityId ?? null,
      whatHappened: body.data.whatHappened.trim(),
      whatWedDoDifferently: body.data.whatWedDoDifferently ?? null,
      tags: body.data.tags ?? [],
      createdBy: principal.id,
    });

    // Index the lesson so it shows up in search alongside event-derived records.
    // The display title is a short prefix; the summary carries the full text so
    // every word of the lesson stays searchable (search matches title+summary+tags).
    await createArchiveEntry(deps.db, {
      orgId: principal.orgId,
      entityType: 'lesson',
      entityId: lesson.id,
      title: `Lesson learned: ${lesson.whatHappened.slice(0, 80)}`,
      summary: lesson.whatWedDoDifferently
        ? `${lesson.whatHappened}\n\nNext time: ${lesson.whatWedDoDifferently}`
        : lesson.whatHappened,
      podIds: [],
      holdingId: null,
      tags: ['lesson', ...lesson.tags],
      occurredAt: lesson.createdAt,
      sourceEventId: null,
    });

    return reply.code(201).send({ data: { lesson } });
  });
}
