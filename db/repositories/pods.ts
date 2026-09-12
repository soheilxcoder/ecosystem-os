/** Pod + membership data access (Module 03). */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { Pod, PodMembership, PodStatus, UUID, User } from '../../core/types';
import type { ISODate } from '../../core/time';
import { toDateString, toPod, toPodMembership, toUser } from './rows';

/** Row shape of the pod+holding join used below. */
export interface PodJoinRow {
  id: string;
  holding_id: string;
  name: string;
  category_tag: string | null;
  status: string;
  created_at: string;
  trial_end_date: string | null;
  org_id: string;
  holding_name: string;
  member_count: number | string;
}

export interface PodWithHolding extends Pod {
  orgId: UUID;
  holdingName: string;
  memberCount: number;
}

const POD_SELECT = `
  SELECT p.*, h.org_id AS org_id, h.name AS holding_name,
         (SELECT count(*) FROM pod_membership m
           WHERE m.pod_id = p.id AND m.left_at IS NULL)::int AS member_count
    FROM pod p
    JOIN holding h ON h.id = p.holding_id
`;

export async function getPod(db: Queryable, podId: UUID): Promise<PodWithHolding | null> {
  const row = await queryOne<PodJoinRow>(db, `${POD_SELECT} WHERE p.id = $1`, [podId]);
  if (!row) return null;
  return { ...toPod(row), orgId: row.org_id, holdingName: row.holding_name, memberCount: Number(row.member_count ?? 0) };
}

export async function listPods(db: Queryable, orgId: UUID): Promise<PodWithHolding[]> {
  const rows = await queryMany<PodJoinRow>(db, `${POD_SELECT} WHERE h.org_id = $1 ORDER BY p.name`, [orgId]);
  return rows.map((row) => ({
    ...toPod(row),
    orgId: row.org_id,
    holdingName: row.holding_name,
    memberCount: Number(row.member_count ?? 0),
  }));
}

export async function listPodsByHolding(
  db: Queryable,
  holdingId: UUID,
): Promise<PodWithHolding[]> {
  const rows = await queryMany<PodJoinRow>(db, `${POD_SELECT} WHERE p.holding_id = $1 ORDER BY p.name`, [holdingId]);
  return rows.map((row) => ({
    ...toPod(row),
    orgId: row.org_id,
    holdingName: row.holding_name,
    memberCount: Number(row.member_count ?? 0),
  }));
}

export interface CreatePodInput {
  holdingId: UUID;
  name: string;
  categoryTag?: string | null;
  status?: PodStatus;
  trialEndDate?: ISODate | null;
}

export async function createPod(db: Queryable, input: CreatePodInput): Promise<Pod> {
  return toPod(
    await insertOne(
      db,
      `INSERT INTO pod (holding_id, name, category_tag, status, trial_end_date)
       VALUES ($1, $2, $3, $4, $5::date) RETURNING *`,
      [
        input.holdingId,
        input.name,
        input.categoryTag ?? null,
        input.status ?? 'trial',
        input.trialEndDate ?? null,
      ],
    ),
  );
}

export async function setPodStatus(db: Queryable, podId: UUID, status: PodStatus): Promise<Pod | null> {
  const row = await queryOne(db, 'UPDATE pod SET status = $2 WHERE id = $1 RETURNING *', [podId, status]);
  return row ? toPod(row) : null;
}

/** Pods a user currently belongs to (active membership), with holding context. */
export async function listPodsForUser(
  db: Queryable,
  userId: UUID,
): Promise<PodWithHolding[]> {
  const rows = await queryMany<PodJoinRow>(
    db,
    `${POD_SELECT}
      JOIN pod_membership pm ON pm.pod_id = p.id
      WHERE pm.user_id = $1 AND pm.left_at IS NULL
      ORDER BY p.name`,
    [userId],
  );
  return rows.map((row) => ({
    ...toPod(row),
    orgId: row.org_id,
    holdingName: row.holding_name,
    memberCount: Number(row.member_count ?? 0),
  }));
}

export interface PodMember extends User {
  joinedAt: ISODate;
  leftAt: ISODate | null;
}

export async function listPodMembers(db: Queryable, podId: UUID): Promise<PodMember[]> {
  const rows = await queryMany<Record<string, unknown> & { joined_at: unknown; left_at: unknown }>(
    db,
    `SELECT u.*, m.joined_at, m.left_at
       FROM pod_membership m
       JOIN app_user u ON u.id = m.user_id
      WHERE m.pod_id = $1 AND m.left_at IS NULL
      ORDER BY m.joined_at, u.full_name`,
    [podId],
  );
  return rows.map((row) => ({
    ...toUser(row),
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString().slice(0, 10) : String(row.joined_at).slice(0, 10),
    leftAt: row.left_at ? (row.left_at instanceof Date ? row.left_at.toISOString().slice(0, 10) : String(row.left_at).slice(0, 10)) : null,
  }));
}

export async function addPodMember(
  db: Queryable,
  input: { podId: UUID; userId: UUID; joinedAt?: ISODate },
): Promise<PodMembership> {
  return toPodMembership(
    await insertOne(
      db,
      `INSERT INTO pod_membership (pod_id, user_id, joined_at)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE))
       RETURNING *`,
      [input.podId, input.userId, input.joinedAt ?? null],
    ),
  );
}

/** Close a membership without deleting history (left_at is stamped, row kept). */
export async function removePodMember(
  db: Queryable,
  input: { podId: UUID; userId: UUID; leftAt: ISODate },
): Promise<PodMembership | null> {
  const row = await queryOne(
    db,
    `UPDATE pod_membership
        SET left_at = $3::date
      WHERE pod_id = $1 AND user_id = $2 AND left_at IS NULL
      RETURNING *`,
    [input.podId, input.userId, input.leftAt],
  );
  return row ? toPodMembership(row) : null;
}

// ---------------------------------------------------------------------------
// Cycle plan (priorities set during Days 1–3)
// ---------------------------------------------------------------------------

export async function getCyclePlan(
  db: Queryable,
  podId: UUID,
  cycleId: UUID,
): Promise<string[] | null> {
  const row = await queryOne<{ priorities: string[] }>(
    db,
    'SELECT priorities FROM pod_cycle_plan WHERE pod_id = $1 AND cycle_id = $2',
    [podId, cycleId],
  );
  return row ? (row.priorities ?? []) : null;
}

export async function upsertCyclePlan(
  db: Queryable,
  input: { podId: UUID; cycleId: UUID; priorities: string[]; updatedBy: UUID | null },
): Promise<string[]> {
  const row = await queryOne<{ priorities: string[] }>(
    db,
    `INSERT INTO pod_cycle_plan (pod_id, cycle_id, priorities, updated_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (pod_id, cycle_id)
     DO UPDATE SET priorities = EXCLUDED.priorities,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = now()
     RETURNING *`,
    [input.podId, input.cycleId, JSON.stringify(input.priorities), input.updatedBy],
  );
  return row?.priorities ?? input.priorities;
}

// ---------------------------------------------------------------------------
// Weekly check-ins (Days 4–80)
// ---------------------------------------------------------------------------

export interface CheckinRow {
  id: UUID;
  podId: UUID;
  cycleId: UUID;
  authorUserId: UUID | null;
  weekNumber: number;
  body: string;
  atRiskFlag: boolean;
  createdAt: string;
}

export async function listCheckins(
  db: Queryable,
  podId: UUID,
  cycleId: UUID,
  limit = 50,
): Promise<CheckinRow[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM weekly_checkin
      WHERE pod_id = $1 AND cycle_id = $2
      ORDER BY week_number DESC, created_at DESC
      LIMIT $3`,
    [podId, cycleId, limit],
  );
  return rows.map((row) => ({
    id: row.id as UUID,
    podId: row.pod_id as UUID,
    cycleId: row.cycle_id as UUID,
    authorUserId: (row.author_user_id as UUID) ?? null,
    weekNumber: Number(row.week_number),
    body: row.body as string,
    atRiskFlag: Boolean(row.at_risk_flag),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

export async function createCheckin(
  db: Queryable,
  input: {
    podId: UUID;
    cycleId: UUID;
    authorUserId: UUID | null;
    weekNumber: number;
    body: string;
    atRiskFlag?: boolean;
  },
): Promise<CheckinRow> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO weekly_checkin
       (pod_id, cycle_id, author_user_id, week_number, body, at_risk_flag)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.podId,
      input.cycleId,
      input.authorUserId,
      input.weekNumber,
      input.body,
      input.atRiskFlag ?? false,
    ],
  );
  return toCheckin(row);
}

function toCheckin(row: Record<string, unknown>): CheckinRow {
  return {
    id: row.id as UUID,
    podId: row.pod_id as UUID,
    cycleId: row.cycle_id as UUID,
    authorUserId: (row.author_user_id as UUID) ?? null,
    weekNumber: Number(row.week_number),
    body: row.body as string,
    atRiskFlag: Boolean(row.at_risk_flag),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Pitches (Days 81–85)
// ---------------------------------------------------------------------------

export interface PitchRow {
  id: UUID;
  podId: UUID;
  cycleId: UUID;
  status: 'draft' | 'submitted' | 'reviewed' | 'scored';
  previousSummary: string | null;
  keyResults: Array<{ metric: string; target: string; actual: string }>;
  nextPlan: string | null;
  budgetContext: string | null;
  attachments: unknown[];
  submittedAt: string | null;
  submittedBy: UUID | null;
  autoSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toPitch(row: any): PitchRow {
  return {
    id: row.id,
    podId: row.pod_id,
    cycleId: row.cycle_id,
    status: row.status,
    previousSummary: row.previous_summary ?? null,
    keyResults: (row.key_results ?? []) as PitchRow['keyResults'],
    nextPlan: row.next_plan ?? null,
    budgetContext: row.budget_context ?? null,
    attachments: (row.attachments ?? []) as unknown[],
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    submittedBy: row.submitted_by ?? null,
    autoSubmitted: Boolean(row.auto_submitted),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function getPitch(
  db: Queryable,
  podId: UUID,
  cycleId: UUID,
): Promise<PitchRow | null> {
  const row = await queryOne(db, 'SELECT * FROM pitch WHERE pod_id = $1 AND cycle_id = $2', [
    podId,
    cycleId,
  ]);
  return row ? toPitch(row) : null;
}

export async function listPitches(db: Queryable, podId: UUID, limit = 20): Promise<PitchRow[]> {
  const rows = await queryMany(
    db,
    `SELECT p.* FROM pitch p
       JOIN sprint_cycle c ON c.id = p.cycle_id
      WHERE p.pod_id = $1
      ORDER BY c.cycle_number DESC
      LIMIT $2`,
    [podId, limit],
  );
  return rows.map(toPitch);
}

export interface SavePitchInput {
  podId: UUID;
  cycleId: UUID;
  previousSummary?: string | null;
  keyResults?: unknown[];
  nextPlan?: string | null;
  budgetContext?: string | null;
  attachments?: unknown[];
}

/** Create-or-update the cycle's draft pitch. */
export async function upsertPitchDraft(
  db: Queryable,
  input: SavePitchInput,
): Promise<PitchRow> {
  const row = await queryOne(
    db,
    // COALESCE keeps the JSONB columns NOT NULL when the caller omits them:
    // passing an explicit NULL would override the column default.
    `INSERT INTO pitch
       (pod_id, cycle_id, previous_summary, key_results, next_plan, budget_context, attachments)
     VALUES ($1, $2, $3, COALESCE($4::jsonb, '[]'::jsonb), $5, $6, COALESCE($7::jsonb, '[]'::jsonb))
     ON CONFLICT (pod_id, cycle_id)
     DO UPDATE SET previous_summary = COALESCE(EXCLUDED.previous_summary, pitch.previous_summary),
                   key_results = CASE WHEN $4::text IS NULL THEN pitch.key_results ELSE EXCLUDED.key_results END,
                   next_plan = COALESCE(EXCLUDED.next_plan, pitch.next_plan),
                   budget_context = COALESCE(EXCLUDED.budget_context, pitch.budget_context),
                   attachments = CASE WHEN $7::text IS NULL THEN pitch.attachments ELSE EXCLUDED.attachments END,
                   updated_at = now()
     RETURNING *`,
    [
      input.podId,
      input.cycleId,
      input.previousSummary ?? null,
      input.keyResults ? JSON.stringify(input.keyResults) : null,
      input.nextPlan ?? null,
      input.budgetContext ?? null,
      input.attachments ? JSON.stringify(input.attachments) : null,
    ],
  );
  return toPitch(row);
}

export async function submitPitch(
  db: Queryable,
  input: { podId: UUID; cycleId: UUID; submittedBy: UUID | null; autoSubmitted?: boolean },
): Promise<PitchRow | null> {
  const row = await queryOne(
    db,
    `UPDATE pitch
        SET status = CASE WHEN status = 'draft' THEN 'submitted' ELSE status END,
            submitted_at = COALESCE(submitted_at, now()),
            submitted_by = COALESCE(submitted_by, $3),
            auto_submitted = CASE WHEN $4::boolean THEN true ELSE auto_submitted END,
            updated_at = now()
      WHERE pod_id = $1 AND cycle_id = $2
      RETURNING *`,
    [input.podId, input.cycleId, input.submittedBy, input.autoSubmitted ?? false],
  );
  return row ? toPitch(row) : null;
}

/** Drafts whose submission window has closed — candidates for auto-submission. */
export async function listSubmittableDrafts(
  db: Queryable,
  cycleIds: UUID[],
): Promise<PitchRow[]> {
  if (cycleIds.length === 0) return [];
  const rows = await queryMany(
    db,
    `SELECT * FROM pitch
      WHERE status = 'draft' AND cycle_id = ANY($1::uuid[])
      ORDER BY updated_at`,
    [cycleIds],
  );
  return rows.map(toPitch);
}

// ---------------------------------------------------------------------------
// Pod Lead terms and votes (Days 1–3)
// ---------------------------------------------------------------------------

export interface PodLeadTermRow {
  id: UUID;
  podId: UUID;
  cycleId: UUID;
  userId: UUID;
  startDate: ISODate;
  endDate: ISODate;
  voteTally: Record<string, number> | null;
  createdAt: string;
}

export function toPodLeadTerm(row: any): PodLeadTermRow {
  return {
    id: row.id as UUID,
    podId: row.pod_id as UUID,
    cycleId: row.cycle_id as UUID,
    userId: row.user_id as UUID,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    voteTally: (row.vote_tally as Record<string, number>) ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function listPodLeadTerms(db: Queryable, podId: UUID): Promise<PodLeadTermRow[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM pod_lead_term WHERE pod_id = $1 ORDER BY start_date DESC`,
    [podId],
  );
  return rows.map(toPodLeadTerm);
}

export async function createPodLeadTerm(
  db: Queryable,
  input: {
    podId: UUID;
    cycleId: UUID;
    userId: UUID;
    startDate: ISODate;
    endDate: ISODate;
    voteTally?: Record<string, number> | null;
  },
): Promise<PodLeadTermRow> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO pod_lead_term (pod_id, cycle_id, user_id, start_date, end_date, vote_tally)
     VALUES ($1, $2, $3, $4::date, $5::date, $6::jsonb)
     RETURNING *`,
    [
      input.podId,
      input.cycleId,
      input.userId,
      input.startDate,
      input.endDate,
      input.voteTally ? JSON.stringify(input.voteTally) : null,
    ],
  );
  return toPodLeadTerm(row);
}

export interface PodLeadVoteRow {
  id: UUID;
  podId: UUID;
  cycleId: UUID;
  voterUserId: UUID;
  candidateUserId: UUID;
  createdAt: string;
}

export async function castPodLeadVote(
  db: Queryable,
  input: { podId: UUID; cycleId: UUID; voterUserId: UUID; candidateUserId: UUID },
): Promise<PodLeadVoteRow> {
  const row = await queryOne<Record<string, any>>(
    db,
    `INSERT INTO pod_lead_vote (pod_id, cycle_id, voter_user_id, candidate_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pod_id, cycle_id, voter_user_id)
     DO UPDATE SET candidate_user_id = EXCLUDED.candidate_user_id, created_at = now()
     RETURNING *`,
    [input.podId, input.cycleId, input.voterUserId, input.candidateUserId],
  );
  return {
    id: row!.id,
    podId: row!.pod_id,
    cycleId: row!.cycle_id,
    voterUserId: row!.voter_user_id,
    candidateUserId: row!.candidate_user_id,
    createdAt: new Date(row!.created_at).toISOString(),
  };
}

export async function listPodLeadVotes(
  db: Queryable,
  podId: UUID,
  cycleId: UUID,
): Promise<PodLeadVoteRow[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM pod_lead_vote WHERE pod_id = $1 AND cycle_id = $2',
    [podId, cycleId],
  );
  return rows.map((row) => ({
    id: row.id as UUID,
    podId: row.pod_id as UUID,
    cycleId: row.cycle_id as UUID,
    voterUserId: row.voter_user_id as UUID,
    candidateUserId: row.candidate_user_id as UUID,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}
