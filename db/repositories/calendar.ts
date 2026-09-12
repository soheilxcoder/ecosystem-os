/** Sprint cycle + calendar configuration data access (Module 06). */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import { toDateString } from './rows';
import { parsePauseDays, parsePhaseBoundaries, type PhaseBoundaries } from '../../core/calendar';

export interface CycleConfigRow {
  id: UUID;
  orgId: UUID;
  holdingId: UUID | null;
  cycleLengthDays: number;
  phaseBoundaries: PhaseBoundaries;
  effectiveFromCycleNumber: number;
  note: string | null;
  createdBy: UUID | null;
  createdAt: string;
}

export interface SprintCycleRow {
  id: UUID;
  orgId: UUID;
  holdingId: UUID | null;
  cycleNumber: number;
  startDate: ISODate;
  endDate: ISODate;
  phaseBoundaries: PhaseBoundaries;
  pauseDays: ISODate[];
  status: 'active' | 'completed';
  createdAt: string;
}

export interface MilestoneReminderRow {
  id: UUID;
  cycleId: UUID;
  milestoneType: string;
  targetDate: ISODate;
  notified: boolean;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function toCycleConfig(row: any): CycleConfigRow {
  return {
    id: row.id,
    orgId: row.org_id,
    holdingId: row.holding_id ?? null,
    cycleLengthDays: Number(row.cycle_length_days),
    phaseBoundaries: parsePhaseBoundaries(row.phase_boundaries),
    effectiveFromCycleNumber: Number(row.effective_from_cycle_number),
    note: row.note ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toSprintCycle(row: any): SprintCycleRow {
  return {
    id: row.id,
    orgId: row.org_id,
    holdingId: row.holding_id ?? null,
    cycleNumber: Number(row.cycle_number),
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    phaseBoundaries: parsePhaseBoundaries(row.phase_boundaries),
    pauseDays: parsePauseDays(row.pause_days ?? []),
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

function toReminder(row: any): MilestoneReminderRow {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    milestoneType: row.milestone_type,
    targetDate: toDateString(row.target_date),
    notified: Boolean(row.notified),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

// --- configuration ---------------------------------------------------------

/**
 * The configuration version that governs a given cycle number: the latest
 * version whose `effective_from_cycle_number` is not in the future.
 */
export async function getEffectiveConfig(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
  cycleNumber: number,
): Promise<CycleConfigRow | null> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM cycle_config
      WHERE org_id = $1
        AND (holding_id = $2 OR (holding_id IS NULL AND $2 IS NULL))
        AND effective_from_cycle_number <= $3
      ORDER BY effective_from_cycle_number DESC, created_at DESC
      LIMIT 1`,
    [scope.orgId, scope.holdingId, cycleNumber],
  );
  return rows[0] ? toCycleConfig(rows[0]) : null;
}

export async function listConfigVersions(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
): Promise<CycleConfigRow[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM cycle_config
      WHERE org_id = $1 AND (holding_id = $2 OR (holding_id IS NULL AND $2 IS NULL))
      ORDER BY effective_from_cycle_number DESC, created_at DESC`,
    [scope.orgId, scope.holdingId],
  );
  return rows.map(toCycleConfig);
}

/**
 * Record a configuration version for `effectiveFromCycleNumber`.
 *
 * A version that has not taken effect yet (its cycle has not started) is
 * replaced rather than duplicated — otherwise two changes made inside the same
 * cycle would collide on the version key.
 */
export async function upsertPendingConfig(
  db: Queryable,
  input: {
    orgId: UUID;
    holdingId: UUID | null;
    cycleLengthDays: number;
    phaseBoundaries: PhaseBoundaries;
    effectiveFromCycleNumber: number;
    note?: string | null;
    createdBy?: UUID | null;
  },
): Promise<CycleConfigRow> {
  const row = await queryOne(
    db,
    `UPDATE cycle_config
        SET cycle_length_days = $3,
            phase_boundaries = $4::jsonb,
            note = COALESCE($5, note),
            created_by = COALESCE($6, created_by),
            created_at = now()
      WHERE org_id = $1
        AND (holding_id = $2 OR (holding_id IS NULL AND $2 IS NULL))
        AND effective_from_cycle_number = $7
      RETURNING *`,
    [
      input.orgId,
      input.holdingId,
      input.cycleLengthDays,
      JSON.stringify(input.phaseBoundaries),
      input.note ?? null,
      input.createdBy ?? null,
      input.effectiveFromCycleNumber,
    ],
  );
  if (row) return toCycleConfig(row);

  return toCycleConfig(
    await insertOne(
      db,
      `INSERT INTO cycle_config
         (org_id, holding_id, cycle_length_days, phase_boundaries,
          effective_from_cycle_number, note, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING *`,
      [
        input.orgId,
        input.holdingId,
        input.cycleLengthDays,
        JSON.stringify(input.phaseBoundaries),
        input.effectiveFromCycleNumber,
        input.note ?? null,
        input.createdBy ?? null,
      ],
    ),
  );
}

export interface CreateCycleConfigInput {
  orgId: UUID;
  holdingId: UUID | null;
  cycleLengthDays: number;
  phaseBoundaries: PhaseBoundaries;
  effectiveFromCycleNumber: number;
  note?: string | null;
  createdBy?: UUID | null;
}

export async function createCycleConfig(
  db: Queryable,
  input: CreateCycleConfigInput,
): Promise<CycleConfigRow> {
  return toCycleConfig(
    await insertOne(
      db,
      `INSERT INTO cycle_config
         (org_id, holding_id, cycle_length_days, phase_boundaries,
          effective_from_cycle_number, note, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING *`,
      [
        input.orgId,
        input.holdingId,
        input.cycleLengthDays,
        JSON.stringify(input.phaseBoundaries),
        input.effectiveFromCycleNumber,
        input.note ?? null,
        input.createdBy ?? null,
      ],
    ),
  );
}

// --- cycles ----------------------------------------------------------------

/**
 * The active cycle for a scope.
 *
 * A holding may run its own calendar (staggered rollouts like the Pars pilot);
 * when it does not, the org-wide calendar applies. The lookup is therefore
 * two-step rather than one clever OR — the fallback must never be skipped, or
 * pod-scoped queries (which always resolve to a holding) would find nothing.
 */
export async function getActiveCycle(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
): Promise<SprintCycleRow | null> {
  if (scope.holdingId) {
    const holdingRow = await queryOne(
      db,
      `SELECT * FROM sprint_cycle
        WHERE org_id = $1 AND status = 'active' AND holding_id = $2
        LIMIT 1`,
      [scope.orgId, scope.holdingId],
    );
    if (holdingRow) return toSprintCycle(holdingRow);
  }

  const orgRow = await queryOne(
    db,
    `SELECT * FROM sprint_cycle
      WHERE org_id = $1 AND status = 'active' AND holding_id IS NULL
      LIMIT 1`,
    [scope.orgId],
  );
  return orgRow ? toSprintCycle(orgRow) : null;
}

export async function getCycleByNumber(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
  cycleNumber: number,
): Promise<SprintCycleRow | null> {
  const row = await queryOne(
    db,
    `SELECT * FROM sprint_cycle
      WHERE org_id = $1 AND cycle_number = $2
        AND (holding_id = $3 OR (holding_id IS NULL AND $3 IS NULL))
      LIMIT 1`,
    [scope.orgId, cycleNumber, scope.holdingId],
  );
  return row ? toSprintCycle(row) : null;
}

export async function listCycles(
  db: Queryable,
  scope: { orgId: UUID; holdingId: UUID | null },
  limit = 12,
): Promise<SprintCycleRow[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM sprint_cycle
      WHERE org_id = $1 AND (holding_id = $2 OR (holding_id IS NULL AND $2 IS NULL))
      ORDER BY cycle_number DESC
      LIMIT $3`,
    [scope.orgId, scope.holdingId, limit],
  );
  if (rows.length > 0 || !scope.holdingId) return rows.map(toSprintCycle);

  // The holding has no calendar of its own: show the org-wide history.
  const orgRows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM sprint_cycle
      WHERE org_id = $1 AND holding_id IS NULL
      ORDER BY cycle_number DESC
      LIMIT $2`,
    [scope.orgId, limit],
  );
  return orgRows.map(toSprintCycle);
}

export interface CreateCycleInput {
  orgId: UUID;
  holdingId: UUID | null;
  cycleNumber: number;
  startDate: ISODate;
  endDate: ISODate;
  phaseBoundaries: PhaseBoundaries;
  pauseDays?: ISODate[];
}

export async function createCycle(db: Queryable, input: CreateCycleInput): Promise<SprintCycleRow> {
  return toSprintCycle(
    await insertOne(
      db,
      `INSERT INTO sprint_cycle
         (org_id, holding_id, cycle_number, start_date, end_date, phase_boundaries, pause_days)
       VALUES ($1, $2, $3, $4::date, $5::date, $6::jsonb, $7::jsonb)
       RETURNING *`,
      [
        input.orgId,
        input.holdingId,
        input.cycleNumber,
        input.startDate,
        input.endDate,
        JSON.stringify(input.phaseBoundaries),
        JSON.stringify(input.pauseDays ?? []),
      ],
    ),
  );
}

/**
 * Replace a cycle's pause days. The end date is recomputed because pause days
 * extend the cycle rather than compressing it.
 */
export async function setPauseDays(
  db: Queryable,
  cycleId: UUID,
  pauseDays: ISODate[],
  endDate: ISODate,
): Promise<SprintCycleRow | null> {
  const row = await queryOne(
    db,
    `UPDATE sprint_cycle
        SET pause_days = $2::jsonb, end_date = $3::date
      WHERE id = $1
      RETURNING *`,
    [cycleId, JSON.stringify(pauseDays), endDate],
  );
  return row ? toSprintCycle(row) : null;
}

export async function completeCycle(db: Queryable, cycleId: UUID): Promise<SprintCycleRow | null> {
  const row = await queryOne(
    db,
    `UPDATE sprint_cycle SET status = 'completed' WHERE id = $1 RETURNING *`,
    [cycleId],
  );
  return row ? toSprintCycle(row) : null;
}

// --- reminders -------------------------------------------------------------

export async function upsertReminders(
  db: Queryable,
  cycleId: UUID,
  reminders: Array<{ type: string; date: ISODate }>,
): Promise<MilestoneReminderRow[]> {
  const rows: MilestoneReminderRow[] = [];
  for (const reminder of reminders) {
    const row = await queryOne(
      db,
      `INSERT INTO cycle_milestone_reminder (cycle_id, milestone_type, target_date)
       VALUES ($1, $2, $3::date)
       ON CONFLICT (cycle_id, milestone_type)
       DO UPDATE SET target_date = EXCLUDED.target_date, notified = false
       RETURNING *`,
      [cycleId, reminder.type, reminder.date],
    );
    if (row) rows.push(toReminder(row));
  }
  return rows;
}

export async function listReminders(db: Queryable, cycleId: UUID): Promise<MilestoneReminderRow[]> {
  const rows = await queryMany(
    db,
    'SELECT * FROM cycle_milestone_reminder WHERE cycle_id = $1 ORDER BY target_date',
    [cycleId],
  );
  return rows.map(toReminder);
}

// --- governance settings ---------------------------------------------------

export interface GovernanceConfig {
  orgId: UUID;
  tieBreakRule: 'longest_tenure' | 'lead_tiebreak' | 'random';
  allowLeadReElection: boolean;
}

export async function getGovernanceConfig(
  db: Queryable,
  orgId: UUID,
): Promise<GovernanceConfig> {
  const row = await queryOne<{ tie_break_rule: string; allow_lead_re_election: boolean }>(
    db,
    'SELECT tie_break_rule, allow_lead_re_election FROM org_governance_config WHERE org_id = $1',
    [orgId],
  );
  if (!row) {
    return { orgId, tieBreakRule: 'longest_tenure', allowLeadReElection: false };
  }
  return {
    orgId,
    tieBreakRule: row.tie_break_rule as GovernanceConfig['tieBreakRule'],
    allowLeadReElection: Boolean(row.allow_lead_re_election),
  };
}

export async function upsertGovernanceConfig(
  db: Queryable,
  input: {
    orgId: UUID;
    tieBreakRule?: GovernanceConfig['tieBreakRule'];
    allowLeadReElection?: boolean;
    updatedBy?: UUID | null;
  },
): Promise<GovernanceConfig> {
  await queryOne(
    db,
    `INSERT INTO org_governance_config (org_id, tie_break_rule, allow_lead_re_election, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id)
     DO UPDATE SET tie_break_rule = COALESCE($2, org_governance_config.tie_break_rule),
                   allow_lead_re_election = COALESCE($3, org_governance_config.allow_lead_re_election),
                   updated_by = COALESCE($4, org_governance_config.updated_by),
                   updated_at = now()
     RETURNING *`,
    [input.orgId, input.tieBreakRule ?? null, input.allowLeadReElection ?? null, input.updatedBy ?? null],
  );
  return getGovernanceConfig(db, input.orgId);
}
