/** Sprint Calendar endpoints (Module 06). */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../db/client';
import type { ISODate } from '../../core/time';
import { CalendarError } from '../../core/calendar';
import {
  getCurrentPhaseForScope,
  listCycleHistory,
  resolveScope,
  startCycle,
  updateCalendarConfig,
} from '../services/calendar';
import { listConfigVersions } from '../../db/repositories/calendar';
import { guard } from '../middleware/auth';
import { badRequest } from '../errors';
import type { PodServiceContext } from '../services/pods';
import { autoSubmitExpiredPitches } from '../services/pods';

const PhaseBoundariesSchema = z.object({
  p1_end: z.number().int().positive(),
  p2_end: z.number().int().positive(),
  p3_end: z.number().int().positive(),
  p4_end: z.number().int().positive(),
  p5_end: z.number().int().positive(),
});

const ConfigBody = z.object({
  cycleLengthDays: z.number().int().min(7).max(365).optional(),
  phaseBoundaries: PhaseBoundariesSchema.optional(),
  pauseDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  holdingId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
});

const StartCycleBody = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  holdingId: z.string().uuid().nullable().optional(),
});

export function registerCalendarRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate; podContext: () => PodServiceContext },
): void {
  /**
   * The current phase for the org, a holding or a pod.
   * Every dashboard, pod screen and module reads this endpoint rather than
   * computing cycle days itself.
   */
  app.get<{
    Querystring: { scope?: string; podId?: string; holdingId?: string; date?: string };
  }>('/api/calendar/current', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const { scope = 'org', podId, holdingId, date } = request.query;

    const target = podId ? { orgId: principal.orgId, podId } : { orgId: principal.orgId, holdingId: holdingId ?? null };
    const allowed = await guard(request, reply, 'calendar.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const onDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : deps.today();
    const phase = await getCurrentPhaseForScope(deps.db, target, onDate);
    if (!phase) {
      return reply.code(404).send({
        error: 'no_active_cycle',
        message: 'No sprint cycle has been started for this scope yet',
      });
    }
    return reply.send({ data: { scope, ...phase } });
  });

  /** Shared phase-resolution endpoint for a specific date (06-MODULE-SPRINT-CALENDAR.md). */
  app.get<{ Querystring: { podId?: string; holdingId?: string; date?: string } }>(
    '/api/calendar/phase',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'calendar.view', { orgId: principal.orgId });
      if (!allowed) return reply;

      const { podId, holdingId, date } = request.query;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw badRequest('A `date` parameter is required (YYYY-MM-DD)');
      }
      const phase = await getCurrentPhaseForScope(
        deps.db,
        podId ? { orgId: principal.orgId, podId } : { orgId: principal.orgId, holdingId: holdingId ?? null },
        date,
      );
      if (!phase) {
        return reply.code(404).send({ error: 'no_active_cycle', message: 'No sprint cycle for this scope' });
      }
      return reply.send({ data: phase });
    },
  );

  /** Past cycles, newest first. */
  app.get<{ Querystring: { holdingId?: string; limit?: string } }>(
    '/api/calendar/history',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'calendar.view', { orgId: principal.orgId });
      if (!allowed) return reply;

      const limit = Math.min(50, Math.max(1, Number(request.query.limit ?? 12) || 12));
      const cycles = await listCycleHistory(
        deps.db,
        { orgId: principal.orgId, holdingId: request.query.holdingId ?? null },
        limit,
      );
      return reply.send({ data: cycles });
    },
  );

  /** Configuration versions — Architecture Hub only. */
  app.get<{ Querystring: { holdingId?: string } }>('/api/calendar/config', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'calendar.configure', { orgId: principal.orgId });
    if (!allowed) return reply;

    const versions = await listConfigVersions(deps.db, {
      orgId: principal.orgId,
      holdingId: request.query.holdingId ?? null,
    });
    return reply.send({ data: versions });
  });

  /**
   * Change the calendar configuration.
   *
   * The change is versioned and takes effect from the next cycle; the active
   * cycle keeps the boundaries it was created with. Pause days are applied to
   * the running cycle immediately, because they only extend it.
   */
  app.post('/api/calendar/config', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'calendar.configure', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = ConfigBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Invalid calendar configuration',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await updateCalendarConfig(
        deps.db,
        {
          orgId: principal.orgId,
          holdingId: parsed.data.holdingId ?? null,
          cycleLengthDays: parsed.data.cycleLengthDays,
          phaseBoundaries: parsed.data.phaseBoundaries,
          pauseDays: parsed.data.pauseDays,
          note: parsed.data.note ?? null,
          actorUserId: principal.id,
        },
        { bus: app.bus },
      );
      return reply.send({ data: result });
    } catch (error) {
      if (error instanceof CalendarError) {
        return reply.code(400).send({ error: 'invalid_configuration', message: error.message });
      }
      throw error;
    }
  });

  /** Start the first or next cycle (Architecture Hub / Deployment Hub). */
  app.post('/api/calendar/cycles', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'calendar.configure', { orgId: principal.orgId });
    if (!allowed) return reply;

    const parsed = StartCycleBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'A start date is required (YYYY-MM-DD)',
        issues: parsed.error.issues,
      });
    }

    const cycle = await startCycle(
      deps.db,
      {
        orgId: principal.orgId,
        holdingId: parsed.data.holdingId ?? null,
        startDate: parsed.data.startDate,
        createdBy: principal.id,
      },
      { bus: app.bus },
    );
    return reply.code(201).send({ data: cycle });
  });

  /**
   * Run the auto-submit sweep for drafts whose Day-85 deadline has passed.
   * Also invoked by the scheduler, and exposed so it can be triggered and
   * tested deterministically.
   */
  app.post('/api/calendar/jobs/auto-submit', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'calendar.configure', { orgId: principal.orgId });
    if (!allowed) return reply;

    const submitted = await autoSubmitExpiredPitches(deps.podContext(), [principal.orgId]);
    return reply.send({ data: { submitted } });
  });

  /** Downloadable .ics for a milestone ("Add to my calendar"). */
  app.get<{ Querystring: { podId?: string; holdingId?: string; index?: string } }>(
    '/api/calendar/milestone.ics',
    async (request, reply) => {
      const principal = await request.auth.requirePrincipal();
      const allowed = await guard(request, reply, 'calendar.view', { orgId: principal.orgId });
      if (!allowed) return reply;

      const phase = await getCurrentPhaseForScope(
        deps.db,
        request.query.podId
          ? { orgId: principal.orgId, podId: request.query.podId }
          : { orgId: principal.orgId, holdingId: request.query.holdingId ?? null },
        deps.today(),
      );
      if (!phase) {
        return reply.code(404).send({ error: 'no_active_cycle', message: 'No sprint cycle for this scope' });
      }

      const index = Number(request.query.index ?? 0);
      const milestone = phase.milestones[index] ?? phase.milestones[0];
      if (!milestone) {
        return reply.code(404).send({ error: 'not_found', message: 'No milestones for this cycle' });
      }

      const ics = buildIcs({
        uid: `${phase.cycleId}-${milestone.type}`,
        start: milestone.date,
        summary: `Cycle ${phase.cycleNumber} · ${milestone.label}`,
        description: `${milestone.label} — cycle day ${milestone.day}.`,
      });

      return reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', `attachment; filename="cycle-${phase.cycleNumber}-${milestone.type}.ics"`)
        .send(ics);
    },
  );

  /** Holding of a pod, for the UI context switcher. */
  app.get<{ Params: { podId: string } }>('/api/calendar/pod-scope/:podId', async (request, reply) => {
    await request.auth.requirePrincipal();
    const scope = await resolveScope(deps.db, {
      orgId: (await request.auth.requirePrincipal()).orgId,
      podId: request.params.podId,
    });
    return reply.send({ data: scope });
  });
}

interface IcsInput {
  uid: string;
  start: ISODate;
  summary: string;
  description: string;
}

/** Minimal RFC 5545 all-day event — enough for "Add to my calendar". */
export function buildIcs(input: IcsInput): string {
  const compact = input.start.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ecosystem OS//Sprint Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@ecosystem-os`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact}`,
    `SUMMARY:${escapeIcs(input.summary)}`,
    `DESCRIPTION:${escapeIcs(input.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function escapeIcs(value: string): string {
  return value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n').slice(0, 200);
}
