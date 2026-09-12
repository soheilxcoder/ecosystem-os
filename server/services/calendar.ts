/**
 * Calendar service — the one place that answers "what day of the cycle is it?"
 *
 * Modules never do day arithmetic themselves; they call `getCurrentPhase()` here
 * (06-MODULE-SPRINT-CALENDAR.md, "Business logic").
 *
 * Two rules are enforced in this service, not just documented:
 *  1. A configuration change takes effect from the **next** cycle onward. The
 *     active cycle keeps the boundaries it was created with, so a mid-cycle rule
 *     change cannot desynchronise the pitch and review windows.
 *  2. Pause days extend the cycle: the stored end date is recomputed whenever
 *     they change, and phase boundaries are re-derived from cycle-day numbers.
 */

import type { Database, Queryable } from '../../db/client';
import type { UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import {
  CalendarError,
  DEFAULT_CYCLE_LENGTH_DAYS,
  DEFAULT_PHASE_BOUNDARIES,
  computeCycleEndDate,
  getCurrentPhase,
  milestonesFor,
  parsePauseDays,
  parsePhaseBoundaries,
  type CyclePhaseState,
  type PhaseBoundaries,
} from '../../core/calendar';
import {
  createCycle,
  getActiveCycle,
  upsertPendingConfig,
  getEffectiveConfig,
  completeCycle,
  listCycles,
  setPauseDays,
  upsertReminders,
  type SprintCycleRow,
} from '../../db/repositories/calendar';
import { getPod } from '../../db/repositories/pods';
import { recordAudit } from '../../db/repositories/audit';
import type { EventBus } from '../../core/events';

export interface CalendarScope {
  orgId: UUID;
  /** Holding calendar to prefer; falls back to the org-wide calendar. */
  holdingId?: UUID | null;
  /** When given, the holding is resolved from the pod. */
  podId?: UUID | null;
}

export interface PhaseSnapshot extends CyclePhaseState {
  cycleId: UUID;
  cycleNumber: number;
  orgId: UUID;
  holdingId: UUID | null;
  pauseDays: ISODate[];
  /**
   * The boundaries this cycle was created with. Carried on the snapshot so
   * every window check uses the cycle's real boundaries rather than guessing
   * them from the phase the day happens to fall in — a config change must never
   * retroactively move a window.
   */
  phaseBoundaries: PhaseBoundaries;
  milestones: Array<{ type: string; label: string; day: number; date: ISODate }>;
}

/** Resolve a scope to the holding whose calendar should be used. */
export async function resolveScope(
  db: Queryable,
  scope: CalendarScope,
): Promise<{ orgId: UUID; holdingId: UUID | null }> {
  if (scope.podId) {
    const pod = await getPod(db, scope.podId);
    if (!pod) throw new CalendarError(`Pod ${scope.podId} not found`);
    return { orgId: pod.orgId, holdingId: pod.holdingId };
  }
  return { orgId: scope.orgId, holdingId: scope.holdingId ?? null };
}

/**
 * The shared phase-resolution entry point.
 *
 * @returns null when no cycle exists for the scope yet.
 */
export async function getCurrentPhaseForScope(
  db: Queryable,
  scope: CalendarScope,
  date: ISODate,
): Promise<PhaseSnapshot | null> {
  const resolved = await resolveScope(db, scope);
  const cycle = await getActiveCycle(db, resolved);
  if (!cycle) return null;

  const state = getCurrentPhase(cycle, date);
  return {
    ...state,
    cycleId: cycle.id,
    cycleNumber: cycle.cycleNumber,
    orgId: cycle.orgId,
    holdingId: cycle.holdingId,
    pauseDays: cycle.pauseDays,
    phaseBoundaries: cycle.phaseBoundaries,
    milestones: milestonesFor(cycle),
  };
}

/** The active cycle for a scope, or null. */
export async function getCycle(
  db: Queryable,
  scope: CalendarScope,
): Promise<SprintCycleRow | null> {
  const resolved = await resolveScope(db, scope);
  return getActiveCycle(db, resolved);
}

export interface StartCycleInput {
  orgId: UUID;
  holdingId?: UUID | null;
  startDate: ISODate;
  createdBy?: UUID | null;
}

/**
 * Start the first (or next) cycle for a scope, using the configuration version
 * that is effective for that cycle number.
 */
export async function startCycle(
  db: Queryable,
  input: StartCycleInput,
  deps: { bus?: EventBus } = {},
): Promise<SprintCycleRow> {
  const holdingId = input.holdingId ?? null;
  const existing = await db.query<{ max: string | null }>(
    `SELECT max(cycle_number)::text AS max FROM sprint_cycle
      WHERE org_id = $1 AND (holding_id = $2 OR (holding_id IS NULL AND $2 IS NULL))`,
    [input.orgId, holdingId],
  );
  const cycleNumber = Number(existing.rows[0]?.max ?? 0) + 1;

  const config = await getEffectiveConfig(db, { orgId: input.orgId, holdingId }, cycleNumber);
  const boundaries: PhaseBoundaries = config?.phaseBoundaries ?? {
    ...DEFAULT_PHASE_BOUNDARIES,
  };
  const cycleLengthDays = config?.cycleLengthDays ?? DEFAULT_CYCLE_LENGTH_DAYS;
  if (boundaries.p5_end !== cycleLengthDays) {
    boundaries.p5_end = cycleLengthDays;
  }

  const endDate = computeCycleEndDate(input.startDate, cycleLengthDays, []);
  const cycle = await createCycle(db, {
    orgId: input.orgId,
    holdingId,
    cycleNumber,
    startDate: input.startDate,
    endDate,
    phaseBoundaries: boundaries,
  });

  await upsertReminders(
    db,
    cycle.id,
    milestonesFor(cycle).map((milestone) => ({ type: milestone.type, date: milestone.date })),
  );

  await deps.bus?.publish({
    type: 'calendar.cycle_started',
    aggregateType: 'sprint_cycle',
    aggregateId: cycle.id,
    orgId: input.orgId,
    actorUserId: input.createdBy ?? null,
    payload: { cycleNumber, startDate: cycle.startDate, endDate: cycle.endDate },
  });

  return cycle;
}

export interface UpdateCalendarConfigInput {
  orgId: UUID;
  holdingId?: UUID | null;
  cycleLengthDays?: number;
  phaseBoundaries?: PhaseBoundaries;
  pauseDays?: ISODate[];
  note?: string | null;
  actorUserId?: UUID | null;
}

/**
 * Record a new calendar configuration version.
 *
 * The change is written as a new row effective from the **next** cycle, so the
 * cycle in flight is untouched (enforced here, not only in the UI). Pause days
 * are the exception in the sense that they are applied to the active cycle
 * immediately — they only extend it, never move a boundary backwards, and the UI
 * must show "Adjusted for N pause day(s)".
 */
export async function updateCalendarConfig(
  db: Database,
  input: UpdateCalendarConfigInput,
  deps: { bus?: EventBus } = {},
): Promise<{ configVersion: number; pauseDays: ISODate[]; effectiveFromCycleNumber: number }> {
  const holdingId = input.holdingId ?? null;
  const active = await getActiveCycle(db, { orgId: input.orgId, holdingId });

  if (input.cycleLengthDays !== undefined && input.cycleLengthDays < 1) {
    throw new CalendarError('cycle_length_days must be at least 1');
  }
  const boundaries = input.phaseBoundaries
    ? parsePhaseBoundaries(input.phaseBoundaries)
    : ({ ...DEFAULT_PHASE_BOUNDARIES } as PhaseBoundaries);

  const cycleLengthDays = input.cycleLengthDays ?? boundaries.p5_end;
  if (boundaries.p5_end !== cycleLengthDays) {
    throw new CalendarError(
      `phase_boundaries.p5_end (${boundaries.p5_end}) must equal cycle_length_days (${cycleLengthDays})`,
    );
  }

  const effectiveFromCycleNumber = active ? active.cycleNumber + 1 : 1;
  // The target cycle has not started yet, so an existing pending version for it
  // is updated in place instead of creating a second version for the same cycle.
  const config = await upsertPendingConfig(db, {
    orgId: input.orgId,
    holdingId,
    cycleLengthDays,
    phaseBoundaries: boundaries,
    effectiveFromCycleNumber,
    note: input.note ?? null,
    createdBy: input.actorUserId ?? null,
  });

  // Pause days extend the current cycle without renumbering its days.
  let pauseDays: ISODate[] = [];
  if (input.pauseDays && input.pauseDays.length > 0 && active) {
    pauseDays = parsePauseDays([...active.pauseDays, ...input.pauseDays]);
    const endDate = computeCycleEndDate(active.startDate, active.phaseBoundaries.p5_end, pauseDays);
    const updated = await setPauseDays(db, active.id, pauseDays, endDate);
    if (updated) {
      await upsertReminders(
        db,
        updated.id,
        milestonesFor(updated).map((m) => ({ type: m.type, date: m.date })),
      );
    }
  }

  await recordAudit(db, {
    actorUserId: input.actorUserId ?? null,
    action: 'calendar.config_changed',
    entityType: 'cycle_config',
    entityId: config.id,
    metadata: {
      cycleLengthDays,
      phaseBoundaries: boundaries,
      effectiveFromCycleNumber,
      pauseDaysAdded: input.pauseDays ?? [],
    },
  });

  await deps.bus?.publish({
    type: 'calendar.config_changed',
    aggregateType: 'cycle_config',
    aggregateId: config.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    payload: { effectiveFromCycleNumber, cycleLengthDays, phaseBoundaries: boundaries },
  });

  return { configVersion: config.effectiveFromCycleNumber, pauseDays, effectiveFromCycleNumber };
}

/** Close the active cycle and open the next one. */
export async function rollCycle(
  db: Database,
  scope: { orgId: UUID; holdingId: UUID | null },
  deps: { bus?: EventBus } = {},
): Promise<{ completed: SprintCycleRow | null; next: SprintCycleRow }> {
  return db.transaction(async (tx) => {
    const active = await getActiveCycle(tx, scope);
    if (active) {
      await completeCycle(tx, active.id);
    }
    // The next cycle begins the day after this one's last counted day
    // (15-BUSINESS-RULES-APPENDIX.md: the cycle restarts immediately).
    const startDate = active ? addOneDay(active.endDate) : todayFallback();
    const next = await startCycle(tx, { orgId: scope.orgId, holdingId: scope.holdingId, startDate });
    return { completed: active, next };
  });
}

function addOneDay(date: ISODate): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function todayFallback(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

export async function listCycleHistory(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
  limit = 12,
): Promise<SprintCycleRow[]> {
  return listCycles(db, scope, limit);
}
