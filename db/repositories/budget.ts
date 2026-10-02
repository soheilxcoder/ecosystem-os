/**
 * Budget market data access (Module 05).
 *
 * Two rules shape this file:
 *
 *  1. **A provisional cycle is recomputed wholesale; a locked one is not
 *     touched at all.** `replaceBudgetResults` deletes and rewrites every row
 *     for a cycle, which is only ever legal while the cycle is provisional —
 *     the `pod_budget_result_lock_final` and `budget_cycle_lock_final` triggers
 *     refuse it afterwards. Rewriting row-by-row instead would risk a partially
 *     updated allocation that no longer sums to the pool.
 *
 *  2. **Every write records its inputs, not just its output.** A score
 *     component carries the raw values and the normalization method it was
 *     derived with, and a result carries the fixed-cost snapshot behind its
 *     floor. This is what lets the breakdown screen answer "where did this
 *     number come from" from the database alone, rather than by re-deriving it
 *     against data that may since have changed.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  BudgetCycle,
  BudgetCycleStatus,
  BudgetComponentType,
  FinancialSyncRecord,
  PodBudgetResult,
  PodGoalAlignment,
  PodScoreComponent,
  StrategicGoal,
  UUID,
} from '../../core/types';
import {
  toBudgetCycle,
  toDateString,
  toFinancialSyncRecord,
  toPodBudgetResult,
  toPodGoalAlignment,
  toPodScoreComponent,
  toStrategicGoal,
} from './rows';

// ---------------------------------------------------------------------------
// Budget cycles
// ---------------------------------------------------------------------------

export async function getBudgetCycle(
  db: Queryable,
  budgetCycleId: UUID,
): Promise<BudgetCycle | null> {
  const row = await queryOne<any>(db, 'SELECT * FROM budget_cycle WHERE id = $1', [budgetCycleId]);
  return row ? toBudgetCycle(row) : null;
}

/** The budget cycle attached to a sprint cycle — the normal lookup path. */
export async function getBudgetCycleForSprint(
  db: Queryable,
  cycleId: UUID,
): Promise<BudgetCycle | null> {
  const row = await queryOne<any>(db, 'SELECT * FROM budget_cycle WHERE cycle_id = $1', [cycleId]);
  return row ? toBudgetCycle(row) : null;
}

export async function getBudgetCycleByNumber(
  db: Queryable,
  orgId: UUID,
  cycleNumber: number,
): Promise<BudgetCycle | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM budget_cycle WHERE org_id = $1 AND cycle_number = $2',
    [orgId, cycleNumber],
  );
  return row ? toBudgetCycle(row) : null;
}

/** Newest first, for `/budget/history`. */
export async function listBudgetCycles(
  db: Queryable,
  orgId: UUID,
  limit = 24,
): Promise<BudgetCycle[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM budget_cycle
      WHERE org_id = $1
      ORDER BY cycle_number DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return rows.map(toBudgetCycle);
}

export interface CreateBudgetCycleInput {
  orgId: UUID;
  cycleId: UUID;
  cycleNumber: number;
  totalPool: number;
  formulaWeights: Record<string, number>;
  capFraction?: number;
}

export async function createBudgetCycle(
  db: Queryable,
  input: CreateBudgetCycleInput,
): Promise<BudgetCycle | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO budget_cycle (org_id, cycle_id, cycle_number, total_pool, formula_weights, cap_fraction)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (cycle_id) DO UPDATE
       SET total_pool = EXCLUDED.total_pool,
           formula_weights = EXCLUDED.formula_weights,
           cap_fraction = EXCLUDED.cap_fraction,
           updated_at = now()
     RETURNING *`,
    [
      input.orgId,
      input.cycleId,
      input.cycleNumber,
      input.totalPool,
      JSON.stringify(input.formulaWeights),
      input.capFraction ?? 0.3,
    ],
  );
  return row ? toBudgetCycle(row) : null;
}

export interface BudgetCycleTotalsInput {
  reservedForSurvival: number;
  distributablePool: number;
  capAmount: number;
  totalCapped: number;
  totalRedistributed: number;
  unallocated: number;
  shortfall: number;
  survivalScaled: boolean;
}

/** Written on every recomputation of a provisional cycle. */
export async function updateBudgetCycleTotals(
  db: Queryable,
  budgetCycleId: UUID,
  totals: BudgetCycleTotalsInput,
): Promise<BudgetCycle | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE budget_cycle
        SET reserved_for_survival = $2,
            distributable_pool    = $3,
            cap_amount            = $4,
            total_capped          = $5,
            total_redistributed   = $6,
            unallocated           = $7,
            shortfall             = $8,
            survival_scaled       = $9,
            calculated_at         = now(),
            updated_at            = now()
      WHERE id = $1
     RETURNING *`,
    [
      budgetCycleId,
      totals.reservedForSurvival,
      totals.distributablePool,
      totals.capAmount,
      totals.totalCapped,
      totals.totalRedistributed,
      totals.unallocated,
      totals.shortfall,
      totals.survivalScaled,
    ],
  );
  return row ? toBudgetCycle(row) : null;
}

/**
 * Lock the cycle at Day 90. Sets every result's `locked` flag in the same
 * statement so the two can never disagree — the deferred constraint trigger
 * `pod_budget_result_cycle_lock` would reject the transaction if they did.
 */
export async function lockBudgetCycle(
  db: Queryable,
  budgetCycleId: UUID,
  input: { lockedBy: UUID; auditHash: string },
): Promise<BudgetCycle | null> {
  await queryMany<any>(
    db,
    `UPDATE pod_budget_result SET locked = true, updated_at = now()
      WHERE budget_cycle_id = $1 AND locked = false`,
    [budgetCycleId],
  );
  const row = await queryOne<any>(
    db,
    `UPDATE budget_cycle
        SET status = 'locked', locked_at = now(), locked_by = $2, audit_hash = $3
      WHERE id = $1
     RETURNING *`,
    [budgetCycleId, input.lockedBy, input.auditHash],
  );
  return row ? toBudgetCycle(row) : null;
}

// ---------------------------------------------------------------------------
// Score components
// ---------------------------------------------------------------------------

export interface UpsertScoreComponentInput {
  budgetCycleId: UUID;
  cycleId: UUID;
  podId: UUID;
  componentType: BudgetComponentType;
  rawInputs: Record<string, unknown>;
  normalizationMethod: string;
  score: number;
  explanation?: string | null;
}

/**
 * Recomputing a provisional cycle overwrites its components in place: the
 * previous value is not history worth keeping, because it was never announced.
 * Once the cycle is locked the budget_cycle trigger makes this a hard error.
 */
export async function upsertScoreComponent(
  db: Queryable,
  input: UpsertScoreComponentInput,
): Promise<PodScoreComponent | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO pod_score_component
       (budget_cycle_id, cycle_id, pod_id, component_type, raw_inputs,
        normalization_method, score, explanation, calculated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())
     ON CONFLICT (budget_cycle_id, pod_id, component_type) DO UPDATE
       SET raw_inputs = EXCLUDED.raw_inputs,
           normalization_method = EXCLUDED.normalization_method,
           score = EXCLUDED.score,
           explanation = EXCLUDED.explanation,
           calculated_at = now()
     RETURNING *`,
    [
      input.budgetCycleId,
      input.cycleId,
      input.podId,
      input.componentType,
      JSON.stringify(input.rawInputs),
      input.normalizationMethod,
      input.score,
      input.explanation ?? null,
    ],
  );
  return row ? toPodScoreComponent(row) : null;
}

export async function listScoreComponents(
  db: Queryable,
  budgetCycleId: UUID,
  podId?: UUID,
): Promise<PodScoreComponent[]> {
  if (podId) {
    const rows = await queryMany<any>(
      db,
      `SELECT * FROM pod_score_component
        WHERE budget_cycle_id = $1 AND pod_id = $2
        ORDER BY component_type`,
      [budgetCycleId, podId],
    );
    return rows.map(toPodScoreComponent);
  }
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM pod_score_component WHERE budget_cycle_id = $1 ORDER BY pod_id, component_type',
    [budgetCycleId],
  );
  return rows.map(toPodScoreComponent);
}

// ---------------------------------------------------------------------------
// Allocation results
// ---------------------------------------------------------------------------

export interface BudgetResultInput {
  podId: UUID;
  unitScore: number;
  monthlyFixedCosts: number;
  survivalBudget: number;
  survivalBudgetApplied: boolean;
  rawBudgetShare: number;
  formulaShare: number;
  capApplied: boolean;
  capReduction: number;
  redistributedAmount: number;
  finalBudget: number;
  shareOfPoolPercent: number;
}

/**
 * Replace the whole allocation for a provisional cycle in one pass.
 *
 * The delete-then-insert is deliberate: a partial rewrite could leave a set of
 * results whose `final_budget` values no longer sum to the pool minus the
 * unallocated remainder, and nothing downstream would notice until somebody
 * compared the announced total against the sum of the parts.
 */
export async function replaceBudgetResults(
  db: Queryable,
  input: { budgetCycleId: UUID; cycleId: UUID; results: BudgetResultInput[] },
): Promise<PodBudgetResult[]> {
  await queryMany<any>(
    db,
    'DELETE FROM pod_budget_result WHERE budget_cycle_id = $1',
    [input.budgetCycleId],
  );

  const created: PodBudgetResult[] = [];
  for (const result of input.results) {
    const row = await insertOne<any>(
      db,
      `INSERT INTO pod_budget_result
         (budget_cycle_id, cycle_id, pod_id, unit_score, monthly_fixed_costs,
          survival_budget, survival_budget_applied, raw_budget_share, formula_share,
          cap_applied, cap_reduction, redistributed_amount, final_budget,
          share_of_pool_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.budgetCycleId,
        input.cycleId,
        result.podId,
        result.unitScore,
        result.monthlyFixedCosts,
        result.survivalBudget,
        result.survivalBudgetApplied,
        result.rawBudgetShare,
        result.formulaShare,
        result.capApplied,
        result.capReduction,
        result.redistributedAmount,
        result.finalBudget,
        result.shareOfPoolPercent,
      ],
    );
    if (row) created.push(toPodBudgetResult(row));
  }
  return created;
}

export async function listBudgetResults(
  db: Queryable,
  budgetCycleId: UUID,
): Promise<PodBudgetResult[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM pod_budget_result
      WHERE budget_cycle_id = $1
      ORDER BY final_budget DESC`,
    [budgetCycleId],
  );
  return rows.map(toPodBudgetResult);
}

export async function getBudgetResult(
  db: Queryable,
  budgetCycleId: UUID,
  podId: UUID,
): Promise<PodBudgetResult | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM pod_budget_result WHERE budget_cycle_id = $1 AND pod_id = $2',
    [budgetCycleId, podId],
  );
  return row ? toPodBudgetResult(row) : null;
}

/**
 * This pod's results across every cycle, newest first — the history screen's
 * score and budget trend.
 */
export async function listBudgetResultsForPod(
  db: Queryable,
  podId: UUID,
  limit = 24,
): Promise<Array<PodBudgetResult & { cycleNumber: number; status: BudgetCycleStatus }>> {
  const rows = await queryMany<any>(
    db,
    `SELECT r.*, c.cycle_number, c.status
       FROM pod_budget_result r
       JOIN budget_cycle c ON c.id = r.budget_cycle_id
      WHERE r.pod_id = $1
      ORDER BY c.cycle_number DESC
      LIMIT $2`,
    [podId, limit],
  );
  return rows.map((row) => ({
    ...toPodBudgetResult(row),
    cycleNumber: Number(row.cycle_number),
    status: row.status as BudgetCycleStatus,
  }));
}

// ---------------------------------------------------------------------------
// Financial connector
// ---------------------------------------------------------------------------

export interface RecordFinancialSyncInput {
  podId: UUID;
  cycleId?: UUID | null;
  sourceSystem: string;
  periodStart: string;
  periodEnd: string;
  status: FinancialSyncRecord['status'];
  revenue?: number | null;
  costs?: number | null;
  profit?: number | null;
  currency?: string;
  error?: string | null;
}

export async function recordFinancialSync(
  db: Queryable,
  input: RecordFinancialSyncInput,
): Promise<FinancialSyncRecord | null> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO financial_sync_record
       (pod_id, cycle_id, source_system, period_start, period_end, status,
        revenue, costs, profit, currency, fetched_at, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             CASE WHEN $6 = 'ok' THEN now() ELSE NULL END, $11)
     RETURNING *`,
    [
      input.podId,
      input.cycleId ?? null,
      input.sourceSystem,
      input.periodStart,
      input.periodEnd,
      input.status,
      input.revenue ?? null,
      input.costs ?? null,
      input.profit ?? null,
      input.currency ?? 'IRR',
      input.error ?? null,
    ],
  );
  return row ? toFinancialSyncRecord(row) : null;
}

/**
 * The newest sync attempt per pod, whatever its outcome — the banner has to be
 * able to say "failed at 14:02" and not just "no data".
 */
export async function latestFinancialSync(
  db: Queryable,
  podId: UUID,
): Promise<FinancialSyncRecord | null> {
  const row = await queryOne<any>(
    db,
    `SELECT * FROM financial_sync_record
      WHERE pod_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [podId],
  );
  return row ? toFinancialSyncRecord(row) : null;
}

export async function latestFinancialSyncs(
  db: Queryable,
  podIds: readonly UUID[],
): Promise<FinancialSyncRecord[]> {
  if (podIds.length === 0) return [];
  const rows = await queryMany<any>(
    db,
    `SELECT DISTINCT ON (pod_id) *
       FROM financial_sync_record
      WHERE pod_id = ANY($1::uuid[])
      ORDER BY pod_id, created_at DESC, id DESC`,
    [podIds],
  );
  return rows.map(toFinancialSyncRecord);
}

/** Raw figures for the cycle's normalization step, newest successful sync per pod. */
export async function financialFiguresForPeriod(
  db: Queryable,
  podIds: readonly UUID[],
  periodStart: string,
  periodEnd: string,
): Promise<FinancialSyncRecord[]> {
  if (podIds.length === 0) return [];
  const rows = await queryMany<any>(
    db,
    `SELECT DISTINCT ON (pod_id) *
       FROM financial_sync_record
      WHERE pod_id = ANY($1::uuid[])
        AND status = 'ok'
        AND period_start = $2
        AND period_end = $3
      ORDER BY pod_id, created_at DESC, id DESC`,
    [podIds, periodStart, periodEnd],
  );
  return rows.map(toFinancialSyncRecord);
}

// ---------------------------------------------------------------------------
// Strategic goals — the 25% component
// ---------------------------------------------------------------------------

export async function listStrategicGoals(
  db: Queryable,
  orgId: UUID,
  activeOnly = true,
): Promise<StrategicGoal[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM strategic_goal
      WHERE org_id = $1 AND ($2 = false OR active = true)
      ORDER BY label`,
    [orgId, activeOnly],
  );
  return rows.map(toStrategicGoal);
}

export async function createStrategicGoal(
  db: Queryable,
  input: { orgId: UUID; label: string; description?: string | null },
): Promise<StrategicGoal | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO strategic_goal (org_id, label, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, label) DO UPDATE SET description = EXCLUDED.description, active = true
     RETURNING *`,
    [input.orgId, input.label, input.description ?? null],
  );
  return row ? toStrategicGoal(row) : null;
}

export async function upsertGoalAlignment(
  db: Queryable,
  input: {
    orgId: UUID;
    cycleId: UUID;
    podId: UUID;
    goalId: UUID;
    score: number;
    weight?: number;
    scoredBy?: UUID | null;
    rationale?: string | null;
  },
): Promise<PodGoalAlignment | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO pod_goal_alignment
       (org_id, cycle_id, pod_id, goal_id, score, weight, scored_by, rationale)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (cycle_id, pod_id, goal_id) DO UPDATE
       SET score = EXCLUDED.score,
           weight = EXCLUDED.weight,
           scored_by = EXCLUDED.scored_by,
           rationale = EXCLUDED.rationale
     RETURNING *`,
    [
      input.orgId,
      input.cycleId,
      input.podId,
      input.goalId,
      input.score,
      input.weight ?? 1,
      input.scoredBy ?? null,
      input.rationale ?? null,
    ],
  );
  return row ? toPodGoalAlignment(row) : null;
}

export async function listGoalAlignments(
  db: Queryable,
  cycleId: UUID,
  podIds?: readonly UUID[],
): Promise<PodGoalAlignment[]> {
  if (podIds && podIds.length > 0) {
    const rows = await queryMany<any>(
      db,
      `SELECT * FROM pod_goal_alignment
        WHERE cycle_id = $1 AND pod_id = ANY($2::uuid[])
        ORDER BY pod_id`,
      [cycleId, podIds],
    );
    return rows.map(toPodGoalAlignment);
  }
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM pod_goal_alignment WHERE cycle_id = $1 ORDER BY pod_id',
    [cycleId],
  );
  return rows.map(toPodGoalAlignment);
}

// ---------------------------------------------------------------------------
// Peer review input — the 35% component
// ---------------------------------------------------------------------------

/**
 * Submitted review scores per pod for a sprint cycle. Only submitted reviews
 * count: a draft has no number yet, and including it would silently change a
 * pod's budget as somebody typed.
 */
export async function submittedReviewScoresByPod(
  db: Queryable,
  cycleId: UUID,
): Promise<Array<{ podId: UUID; scores: number[]; reviewerCount: number }>> {
  const rows = await queryMany<any>(
    db,
    `SELECT p.pod_id AS pod_id, r.score AS score
       FROM peer_review r
       JOIN pitch p ON p.id = r.pitch_id
      WHERE r.cycle_id = $1
        AND r.submitted_at IS NOT NULL
        AND r.score IS NOT NULL
      ORDER BY p.pod_id`,
    [cycleId],
  );

  const byPod = new Map<UUID, number[]>();
  for (const row of rows) {
    const scores = byPod.get(row.pod_id) ?? [];
    scores.push(Number(row.score));
    byPod.set(row.pod_id, scores);
  }
  return [...byPod.entries()].map(([podId, scores]) => ({
    podId,
    scores,
    reviewerCount: scores.length,
  }));
}

/**
 * Reviews assigned but not yet submitted, per pod. The lock checklist needs
 * this: 05 forbids locking while peer reviews are unresolved.
 */
export async function unresolvedReviewCounts(
  db: Queryable,
  cycleId: UUID,
): Promise<Array<{ podId: UUID; pending: number }>> {
  const rows = await queryMany<any>(
    db,
    `SELECT p.pod_id AS pod_id, COUNT(*)::int AS pending
       FROM peer_review r
       JOIN pitch p ON p.id = r.pitch_id
      WHERE r.cycle_id = $1
        AND r.submitted_at IS NULL
      GROUP BY p.pod_id
      ORDER BY p.pod_id`,
    [cycleId],
  );
  return rows.map((row) => ({ podId: row.pod_id, pending: Number(row.pending) }));
}

/** Cycle start/end for the connector's period, taken from the calendar module. */
export async function sprintCyclePeriod(
  db: Queryable,
  cycleId: UUID,
): Promise<{ start: string; end: string } | null> {
  const row = await queryOne<any>(
    db,
    'SELECT start_date, end_date FROM sprint_cycle WHERE id = $1',
    [cycleId],
  );
  if (!row) return null;
  return { start: toDateString(row.start_date), end: toDateString(row.end_date) };
}
