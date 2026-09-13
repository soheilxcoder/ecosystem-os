/**
 * Governance data access (Module 08, workflow 3).
 *
 * Two tracks, two tables, two sets of functions — the source model forbids them
 * sharing a state machine, so they do not share a repository function either.
 * The invariant that a pod can never be on both tracks is enforced by the
 * `entry_trial_track_guard` / `accountability_case_track_guard` triggers before
 * any of these writes succeed.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  AccountabilityCase,
  AccountabilityResult,
  AccountabilityStageValue,
  EntryRecommendation,
  EntryResult,
  EntryTrial,
  PanelMember,
  PanelVoteValue,
  Pod,
  RuleChange,
  TrialCriterionRow,
  UUID,
} from '../../core/types';
import {
  toAccountabilityCase,
  toEntryTrial,
  toPanelMember,
  toPod,
  toRuleChange,
} from './rows';

// ---------------------------------------------------------------------------
// Shared: which track is a pod on?
// ---------------------------------------------------------------------------

export interface PodGovernanceState {
  pod: Pod;
  openTrial: EntryTrial | null;
  openCase: AccountabilityCase | null;
}

export async function getOpenTrial(
  db: Queryable,
  podId: UUID,
): Promise<EntryTrial | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM entry_trial WHERE pod_id = $1 AND final_result IS NULL',
    [podId],
  );
  return row ? toEntryTrial(row) : null;
}

export async function getTrial(db: Queryable, podId: UUID): Promise<EntryTrial | null> {
  const row = await queryOne<any>(db, 'SELECT * FROM entry_trial WHERE pod_id = $1', [podId]);
  return row ? toEntryTrial(row) : null;
}

export async function getOpenAccountabilityCase(
  db: Queryable,
  podId: UUID,
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM accountability_case WHERE pod_id = $1 AND final_result IS NULL',
    [podId],
  );
  return row ? toAccountabilityCase(row) : null;
}

/**
 * The pod's most recent case, decided or not.
 *
 * Reads use this so a closed case still renders its outcome; writes must ask
 * for the open one, because a decided case is immutable.
 */
export async function getLatestAccountabilityCase(
  db: Queryable,
  podId: UUID,
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(
    db,
    `SELECT * FROM accountability_case
      WHERE pod_id = $1
      ORDER BY final_result NULLS FIRST, opened_at DESC
      LIMIT 1`,
    [podId],
  );
  return row ? toAccountabilityCase(row) : null;
}

export async function getAccountabilityCase(
  db: Queryable,
  caseId: UUID,
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(db, 'SELECT * FROM accountability_case WHERE id = $1', [caseId]);
  return row ? toAccountabilityCase(row) : null;
}

export async function loadGovernanceState(
  db: Queryable,
  podId: UUID,
): Promise<PodGovernanceState | null> {
  const podRow = await queryOne<any>(db, 'SELECT * FROM pod WHERE id = $1', [podId]);
  if (!podRow) return null;
  return {
    pod: toPod(podRow),
    openTrial: await getOpenTrial(db, podId),
    openCase: await getOpenAccountabilityCase(db, podId),
  };
}

// ---------------------------------------------------------------------------
// Track 1 — Entry Trial
// ---------------------------------------------------------------------------

export async function createEntryTrial(
  db: Queryable,
  input: {
    orgId: UUID;
    podId: UUID;
    startDate: string;
    decisionDueDate: string;
    criteria?: TrialCriterionRow[];
  },
): Promise<EntryTrial> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date, criteria)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.orgId,
      input.podId,
      input.startDate,
      input.decisionDueDate,
      JSON.stringify(input.criteria ?? []),
    ],
  );
  return toEntryTrial(row);
}

export async function setTrialCriteria(
  db: Queryable,
  trialId: UUID,
  criteria: readonly TrialCriterionRow[],
): Promise<EntryTrial | null> {
  const row = await queryOne<any>(
    db,
    'UPDATE entry_trial SET criteria = $2::jsonb WHERE id = $1 RETURNING *',
    [trialId, JSON.stringify(criteria)],
  );
  return row ? toEntryTrial(row) : null;
}

export async function setTrialRepresentative(
  db: Queryable,
  trialId: UUID,
  side: 'pod' | 'hub',
  userId: UUID,
): Promise<EntryTrial | null> {
  const column = side === 'pod' ? 'pod_rep_user_id' : 'deployment_hub_user_id';
  const row = await queryOne<any>(
    db,
    `UPDATE entry_trial SET ${column} = $2 WHERE id = $1 RETURNING *`,
    [trialId, userId],
  );
  return row ? toEntryTrial(row) : null;
}

export async function setEntryRecommendation(
  db: Queryable,
  trialId: UUID,
  side: 'pod' | 'hub',
  recommendation: EntryRecommendation,
): Promise<EntryTrial | null> {
  const column =
    side === 'pod' ? 'pod_rep_recommendation' : 'deployment_hub_recommendation';
  const row = await queryOne<any>(
    db,
    `UPDATE entry_trial SET ${column} = $2 WHERE id = $1 AND decided_at IS NULL RETURNING *`,
    [trialId, recommendation],
  );
  return row ? toEntryTrial(row) : null;
}

export async function finalizeEntryTrial(
  db: Queryable,
  trialId: UUID,
  result: EntryResult,
): Promise<EntryTrial | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE entry_trial
        SET final_result = $2, decided_at = now()
      WHERE id = $1 AND final_result IS NULL
      RETURNING *`,
    [trialId, result],
  );
  return row ? toEntryTrial(row) : null;
}

export async function listTrialsDue(
  db: Queryable,
  orgId: UUID,
  today: string,
): Promise<EntryTrial[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM entry_trial
      WHERE org_id = $1 AND final_result IS NULL AND decision_due_date <= $2
      ORDER BY decision_due_date`,
    [orgId, today],
  );
  return rows.map(toEntryTrial);
}

// ---------------------------------------------------------------------------
// Track 2 — Accountability Path
// ---------------------------------------------------------------------------

export async function createAccountabilityCase(
  db: Queryable,
  input: { orgId: UUID; podId: UUID; stage?: AccountabilityStageValue },
): Promise<AccountabilityCase> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO accountability_case (org_id, pod_id, current_stage)
     VALUES ($1, $2, $3) RETURNING *`,
    [input.orgId, input.podId, input.stage ?? 'transparency'],
  );
  return toAccountabilityCase(row);
}

export async function setAccountabilityStage(
  db: Queryable,
  caseId: UUID,
  stage: AccountabilityStageValue,
  extra: {
    triggerStage2At?: string | null;
    correctionStartDate?: string | null;
    correctionEndDate?: string | null;
    assignedCoachUserId?: UUID | null;
    conflictCaseId?: UUID | null;
  } = {},
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE accountability_case
        SET current_stage = $2,
            stage_2_triggered_at = COALESCE($3::timestamptz, stage_2_triggered_at),
            correction_start_date = COALESCE($4::date, correction_start_date),
            correction_end_date = COALESCE($5::date, correction_end_date),
            assigned_coach_user_id = COALESCE($6::uuid, assigned_coach_user_id),
            conflict_case_id = COALESCE($7::uuid, conflict_case_id)
      WHERE id = $1 AND final_result IS NULL
      RETURNING *`,
    [
      caseId,
      stage,
      extra.triggerStage2At ?? null,
      extra.correctionStartDate ?? null,
      extra.correctionEndDate ?? null,
      extra.assignedCoachUserId ?? null,
      extra.conflictCaseId ?? null,
    ],
  );
  return row ? toAccountabilityCase(row) : null;
}

/**
 * Mark stage 2's reduction as written into the budget calculation.
 *
 * The spec is explicit that this is a tracked adjustment Module 05 reads — not
 * an off-the-books manual cut.
 */
export async function markReductionApplied(
  db: Queryable,
  caseId: UUID,
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE accountability_case
        SET reduction_applied = true,
            stage_2_triggered_at = COALESCE(stage_2_triggered_at, now())
      WHERE id = $1 AND final_result IS NULL
      RETURNING *`,
    [caseId],
  );
  return row ? toAccountabilityCase(row) : null;
}

export async function listAccountabilityCases(
  db: Queryable,
  orgId: UUID,
  options: { openOnly?: boolean } = {},
): Promise<AccountabilityCase[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM accountability_case
      WHERE org_id = $1 ${options.openOnly ? 'AND final_result IS NULL' : ''}
      ORDER BY opened_at DESC`,
    [orgId],
  );
  return rows.map(toAccountabilityCase);
}

export async function finalizeAccountabilityCase(
  db: Queryable,
  caseId: UUID,
  result: AccountabilityResult,
): Promise<AccountabilityCase | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE accountability_case
        SET final_result = $2, decided_at = now()
      WHERE id = $1 AND final_result IS NULL
      RETURNING *`,
    [caseId, result],
  );
  return row ? toAccountabilityCase(row) : null;
}

// --- Panel vote -------------------------------------------------------------

export async function addPanelMember(
  db: Queryable,
  caseId: UUID,
  userId: UUID,
  roleLabel: string,
): Promise<PanelMember | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO accountability_panel_member (case_id, user_id, role_label)
     VALUES ($1, $2, $3)
     ON CONFLICT (case_id, user_id) DO NOTHING
     RETURNING *`,
    [caseId, userId, roleLabel],
  );
  return row ? toPanelMember(row) : null;
}

export async function listPanelMembers(
  db: Queryable,
  caseId: UUID,
): Promise<PanelMember[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM accountability_panel_member WHERE case_id = $1 ORDER BY created_at, id',
    [caseId],
  );
  return rows.map(toPanelMember);
}

export async function castPanelVote(
  db: Queryable,
  memberId: UUID,
  vote: PanelVoteValue,
  comment: string | null,
): Promise<PanelMember | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE accountability_panel_member
        SET vote = $2, comment = $3, voted_at = now()
      WHERE id = $1 AND vote IS NULL
      RETURNING *`,
    [memberId, vote, comment],
  );
  return row ? toPanelMember(row) : null;
}

// ---------------------------------------------------------------------------
// Rule versioning (never retroactive)
// ---------------------------------------------------------------------------

export async function createRuleChange(
  db: Queryable,
  input: {
    orgId: UUID;
    ruleName: string;
    oldValue: unknown;
    newValue: unknown;
    proposedBy: UUID | null;
    justification: string;
    effectiveCycleId: UUID | null;
    effectiveCycleNumber: number;
  },
): Promise<RuleChange> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO rule_change
       (org_id, rule_name, old_value, new_value, proposed_by, justification,
        effective_cycle_id, effective_cycle_number)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.orgId,
      input.ruleName,
      JSON.stringify(input.oldValue ?? null),
      JSON.stringify(input.newValue ?? null),
      input.proposedBy,
      input.justification,
      input.effectiveCycleId,
      input.effectiveCycleNumber,
    ],
  );
  return toRuleChange(row);
}

export async function approveRuleChange(
  db: Queryable,
  changeId: UUID,
): Promise<RuleChange | null> {
  const row = await queryOne<any>(
    db,
    'UPDATE rule_change SET approved_at = now() WHERE id = $1 AND approved_at IS NULL RETURNING *',
    [changeId],
  );
  return row ? toRuleChange(row) : null;
}

export async function listRuleChanges(
  db: Queryable,
  orgId: UUID,
  ruleName?: string,
): Promise<RuleChange[]> {
  const params: unknown[] = [orgId];
  let where = 'WHERE org_id = $1';
  if (ruleName) {
    params.push(ruleName);
    where += ` AND rule_name = $${params.length}`;
  }
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM rule_change ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(toRuleChange);
}

export async function latestRuleValue(
  db: Queryable,
  orgId: UUID,
  ruleName: string,
): Promise<unknown> {
  const rows = await queryMany<any>(
    db,
    `SELECT new_value FROM rule_change
      WHERE org_id = $1 AND rule_name = $2 AND approved_at IS NOT NULL
      ORDER BY effective_cycle_number DESC, created_at DESC
      LIMIT 1`,
    [orgId, ruleName],
  );
  return rows[0]?.new_value ?? null;
}

// ---------------------------------------------------------------------------
// Governance configuration
// ---------------------------------------------------------------------------

export interface GovernanceSettings {
  accountabilityStage2ScoreThreshold: number | null;
  accountabilityPanelSize: number;
  accountabilityCorrectionDays: number;
  reviewReviewersPerPitch: number;
  reviewCommentMinLength: number;
}

export async function getGovernanceSettings(
  db: Queryable,
  orgId: UUID,
): Promise<GovernanceSettings> {
  const row = await queryOne<any>(
    db,
    `SELECT accountability_stage2_score_threshold, accountability_panel_size,
            accountability_correction_days, review_reviewers_per_pitch,
            review_comment_min_length
       FROM org_governance_config WHERE org_id = $1`,
    [orgId],
  );
  if (!row) {
    return {
      accountabilityStage2ScoreThreshold: null,
      accountabilityPanelSize: 3,
      accountabilityCorrectionDays: 30,
      reviewReviewersPerPitch: 3,
      reviewCommentMinLength: 140,
    };
  }
  return {
    accountabilityStage2ScoreThreshold:
      row.accountability_stage2_score_threshold === null ||
      row.accountability_stage2_score_threshold === undefined
        ? null
        : Number(row.accountability_stage2_score_threshold),
    accountabilityPanelSize: Number(row.accountability_panel_size ?? 3),
    accountabilityCorrectionDays: Number(row.accountability_correction_days ?? 30),
    reviewReviewersPerPitch: Number(row.review_reviewers_per_pitch ?? 3),
    reviewCommentMinLength: Number(row.review_comment_min_length ?? 140),
  };
}

export async function updateGovernanceSettings(
  db: Queryable,
  orgId: UUID,
  patch: Partial<GovernanceSettings>,
  updatedBy: UUID,
): Promise<GovernanceSettings> {
  await queryOne<any>(
    db,
    `INSERT INTO org_governance_config (org_id, updated_by) VALUES ($1, $2)
       ON CONFLICT (org_id) DO UPDATE SET updated_by = $2`,
    [orgId, updatedBy],
  );
  const sets: string[] = [];
  const params: unknown[] = [orgId];
  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.accountabilityStage2ScoreThreshold !== undefined) {
    push('accountability_stage2_score_threshold', patch.accountabilityStage2ScoreThreshold);
  }
  if (patch.accountabilityPanelSize !== undefined) {
    push('accountability_panel_size', patch.accountabilityPanelSize);
  }
  if (patch.accountabilityCorrectionDays !== undefined) {
    push('accountability_correction_days', patch.accountabilityCorrectionDays);
  }
  if (patch.reviewReviewersPerPitch !== undefined) {
    push('review_reviewers_per_pitch', patch.reviewReviewersPerPitch);
  }
  if (patch.reviewCommentMinLength !== undefined) {
    push('review_comment_min_length', patch.reviewCommentMinLength);
  }

  if (sets.length > 0) {
    await queryOne<any>(
      db,
      `UPDATE org_governance_config SET ${sets.join(', ')} WHERE org_id = $1`,
      params,
    );
  }
  return getGovernanceSettings(db, orgId);
}
