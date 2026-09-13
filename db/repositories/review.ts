/**
 * Peer review + conflict-case data access (Module 08, workflows 1 and 2).
 *
 * Every mutation here is deliberately additive: a submitted review can never be
 * rewritten (the `peer_review_submission_final` trigger refuses it), and case
 * log entries are append-only. Corrections later arrive as new records that
 * reference the original.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  CaseAuthorRole,
  ConflictCase,
  ConflictCaseEvent,
  ConflictCaseStatus,
  PeerReview,
  Pod,
  UUID,
} from '../../core/types';
import {
  toConflictCase,
  toDateString,
  toConflictCaseEvent,
  toPeerReview,
  toPod,
  toUser,
} from './rows';

// ---------------------------------------------------------------------------
// Assignment & progress
// ---------------------------------------------------------------------------

export async function assignReview(
  db: Queryable,
  input: { cycleId: UUID; pitchId: UUID; reviewerUserId: UUID },
): Promise<PeerReview | null> {
  const row = await queryOne<any>(
    db,
    `INSERT INTO peer_review (cycle_id, pitch_id, reviewer_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (pitch_id, reviewer_user_id) DO NOTHING
     RETURNING *`,
    [input.cycleId, input.pitchId, input.reviewerUserId],
  );
  return row ? toPeerReview(row) : null;
}

export async function getReview(
  db: Queryable,
  pitchId: UUID,
  reviewerUserId: UUID,
): Promise<PeerReview | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM peer_review WHERE pitch_id = $1 AND reviewer_user_id = $2',
    [pitchId, reviewerUserId],
  );
  return row ? toPeerReview(row) : null;
}

/** Saves a draft or an update. Throws nothing — immutability is DB-enforced. */
export async function updateReview(
  db: Queryable,
  reviewId: UUID,
  patch: {
    score?: number | null;
    rubricAnswers?: Record<string, string | number>;
    comments?: string | null;
    submittedAt?: string | null;
  },
): Promise<PeerReview | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE peer_review
        SET score          = COALESCE($2, score),
            rubric_answers = COALESCE($3::jsonb, rubric_answers),
            comments       = COALESCE($4, comments),
            submitted_at   = COALESCE($5::timestamptz, submitted_at)
      WHERE id = $1
      RETURNING *`,
    [
      reviewId,
      patch.score ?? null,
      patch.rubricAnswers ? JSON.stringify(patch.rubricAnswers) : null,
      patch.comments ?? null,
      patch.submittedAt ?? null,
    ],
  );
  return row ? toPeerReview(row) : null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface QueueItem {
  review: PeerReview;
  pitchId: UUID;
  podId: UUID;
  podName: string;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  /** What the pod said it would do — the thing being reviewed. */
  pitchSummary: string | null;
  pitchPlan: string | null;
  submittedAt: string | null;
  peerAverage: number | null;
}

const QUEUE_SELECT = `
  SELECT r.*,
         p.pod_id             AS pitch_pod_id,
         p.cycle_id           AS pitch_cycle_id,
         p.previous_summary   AS pitch_previous_summary,
         p.next_plan          AS pitch_next_plan,
         p.submitted_at       AS pitch_submitted_at,
         pod.name             AS pod_name,
         c.cycle_number       AS cycle_number,
         c.start_date         AS cycle_start,
         c.end_date           AS cycle_end,
         (SELECT round(avg(r2.score), 2) FROM peer_review r2
           WHERE r2.pitch_id = p.id AND r2.submitted_at IS NOT NULL) AS peer_average
    FROM peer_review r
    JOIN pitch p ON p.id = r.pitch_id
    JOIN pod pod ON pod.id = p.pod_id
    JOIN sprint_cycle c ON c.id = r.cycle_id
`;

export async function listReviewerQueue(
  db: Queryable,
  reviewerUserId: UUID,
): Promise<QueueItem[]> {
  const rows = await queryMany<any>(
    db,
    `${QUEUE_SELECT} WHERE r.reviewer_user_id = $1
      ORDER BY r.submitted_at NULLS FIRST, c.cycle_number DESC, pod.name`,
    [reviewerUserId],
  );
  return rows.map(toQueueItem);
}

export async function listReviewsForPitch(db: Queryable, pitchId: UUID): Promise<PeerReview[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM peer_review WHERE pitch_id = $1 ORDER BY assigned_at',
    [pitchId],
  );
  return rows.map(toPeerReview);
}

/** Every review row for a reviewer in the current cycle (used by the "mine" view). */
export async function listReviewsForCycle(
  db: Queryable,
  cycleId: UUID,
): Promise<PeerReview[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM peer_review WHERE cycle_id = $1 ORDER BY assigned_at',
    [cycleId],
  );
  return rows.map(toPeerReview);
}

function toQueueItem(row: any): QueueItem {
  return {
    review: toPeerReview(row),
    pitchId: row.pitch_id,
    podId: row.pitch_pod_id,
    podName: row.pod_name,
    cycleNumber: Number(row.cycle_number),
    cycleStart: toDateString(row.cycle_start),
    cycleEnd: toDateString(row.cycle_end),
    pitchSummary: row.pitch_previous_summary ?? null,
    pitchPlan: row.pitch_next_plan ?? null,
    submittedAt: row.pitch_submitted_at
      ? (row.pitch_submitted_at.toISOString?.() ?? row.pitch_submitted_at)
      : null,
    peerAverage: row.peer_average === null || row.peer_average === undefined
      ? null
      : Number(row.peer_average),
  };
}

// ---------------------------------------------------------------------------
// Reviewer pool & exclusions (Module 08: impartial assignment)
// ---------------------------------------------------------------------------

/**
 * Everyone holding the Peer Validator seat today.
 *
 * The seat may be granted for a pod (a standing validator) or for the whole
 * organisation, so both scope shapes count — what matters is that it is active
 * today, because a validator whose seat ended is no longer in the pool.
 */
export async function listPeerValidatorUserIds(
  db: Queryable,
  orgId: UUID,
  today: string,
): Promise<UUID[]> {
  const rows = await queryMany<{ user_id: UUID }>(
    db,
    `SELECT r.user_id
       FROM role_assignment r
       JOIN app_user u ON u.id = r.user_id
      WHERE u.org_id = $1
        AND r.role_type = 'peer_validator'
        AND r.revoked_at IS NULL
        AND r.start_date <= $2::date
        AND (r.end_date IS NULL OR r.end_date >= $2::date)`,
    [orgId, today],
  );
  return rows.map((row) => row.user_id);
}

/**
 * Members of the pod itself plus its coach — always excluded from reviewing it.
 *
 * The coach is found through the live `coach` role rather than through
 * membership: a coach is assigned to a pod they are not a member of.
 */
export async function listInsiderUserIds(
  db: Queryable,
  podId: UUID,
  today: string,
): Promise<UUID[]> {
  const rows = await queryMany<{ user_id: UUID }>(
    db,
    `SELECT m.user_id
       FROM pod_membership m
      WHERE m.pod_id = $1 AND m.left_at IS NULL
     UNION
     SELECT r.user_id
       FROM role_assignment r
      WHERE r.role_type = 'coach' AND r.scope_type = 'pod' AND r.scope_id = $1
        AND r.revoked_at IS NULL AND r.start_date <= $2::date
        AND (r.end_date IS NULL OR r.end_date >= $2::date)`,
    [podId, today],
  );
  return rows.map((row) => row.user_id);
}

/**
 * Members of pods with an active CLOU against the target pod: an open,
 * accepted or renewed agreement is a conflict of interest.
 */
export async function listTradingPartnerUserIds(db: Queryable, podId: UUID): Promise<UUID[]> {
  const rows = await queryMany<{ user_id: UUID }>(
    db,
    `SELECT DISTINCT m.user_id
       FROM cloud_agreement a
       JOIN pod_membership m ON m.pod_id = CASE
              WHEN a.pod_a_id = $1 THEN a.pod_b_id
              ELSE a.pod_a_id
            END
      WHERE (a.pod_a_id = $1 OR a.pod_b_id = $1)
        AND a.status IN ('proposed', 'countered', 'active', 'renegotiating')
        AND m.left_at IS NULL`,
    [podId],
  );
  return rows.map((row) => row.user_id);
}

export async function getPitchPodId(db: Queryable, pitchId: UUID): Promise<UUID | null> {
  const row = await queryOne<{ pod_id: UUID }>(db, 'SELECT pod_id FROM pitch WHERE id = $1', [
    pitchId,
  ]);
  return row?.pod_id ?? null;
}

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

export interface CaseWithPods extends ConflictCase {
  podAName: string;
  podBName: string;
  resolverName: string | null;
  eventCount: number;
  lastActivityAt: string | null;
}

const CASE_SELECT = `
  SELECT c.*,
         a.name AS pod_a_name,
         b.name AS pod_b_name,
         u.full_name AS resolver_name,
         (SELECT count(*) FROM conflict_case_event e WHERE e.case_id = c.id)::int AS event_count,
         (SELECT max(e.created_at) FROM conflict_case_event e WHERE e.case_id = c.id) AS last_activity_at
    FROM conflict_case c
    JOIN pod a ON a.id = c.pod_a_id
    JOIN pod b ON b.id = c.pod_b_id
    LEFT JOIN app_user u ON u.id = c.resolver_user_id
`;

function toCaseWithPods(row: any): CaseWithPods {
  return {
    ...toConflictCase(row),
    podAName: row.pod_a_name,
    podBName: row.pod_b_name,
    resolverName: row.resolver_name ?? null,
    eventCount: Number(row.event_count ?? 0),
    lastActivityAt: row.last_activity_at
      ? (row.last_activity_at.toISOString?.() ?? row.last_activity_at)
      : null,
  };
}

export async function createConflictCase(
  db: Queryable,
  input: {
    orgId: UUID;
    podAId: UUID;
    podBId: UUID;
    resolverUserId: UUID;
    subject: string;
  },
): Promise<CaseWithPods> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO conflict_case (org_id, pod_a_id, pod_b_id, resolver_user_id, subject)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.orgId, input.podAId, input.podBId, input.resolverUserId, input.subject],
  );
  const created = await getConflictCase(db, row.id);
  if (!created) throw new Error('conflict case disappeared immediately after insert');
  return created;
}

export async function getConflictCase(
  db: Queryable,
  caseId: UUID,
): Promise<CaseWithPods | null> {
  const row = await queryOne<any>(db, `${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  return row ? toCaseWithPods(row) : null;
}

export async function listConflictCases(
  db: Queryable,
  filter: { orgId?: UUID; resolverUserId?: UUID; userId?: UUID },
): Promise<CaseWithPods[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.orgId) {
    params.push(filter.orgId);
    conditions.push(`c.org_id = $${params.length}`);
  }
  if (filter.resolverUserId) {
    params.push(filter.resolverUserId);
    conditions.push(`c.resolver_user_id = $${params.length}`);
  }
  if (filter.userId) {
    params.push(filter.userId);
    conditions.push(
      `EXISTS (SELECT 1 FROM pod_membership m
                WHERE m.user_id = $${params.length} AND m.left_at IS NULL
                  AND (m.pod_id = c.pod_a_id OR m.pod_id = c.pod_b_id))`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryMany<any>(
    db,
    `${CASE_SELECT} ${where} ORDER BY c.opened_at DESC`,
    params,
  );
  return rows.map(toCaseWithPods);
}

/** Append-only: a case log entry is never edited or removed. */
export async function addConflictCaseEvent(
  db: Queryable,
  input: {
    caseId: UUID;
    authorUserId: UUID | null;
    authorRole: CaseAuthorRole;
    body: string;
  },
): Promise<ConflictCaseEvent> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO conflict_case_event (case_id, author_user_id, author_role, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.caseId, input.authorUserId, input.authorRole, input.body],
  );
  return toConflictCaseEvent(row);
}

export async function listConflictCaseEvents(
  db: Queryable,
  caseId: UUID,
): Promise<ConflictCaseEvent[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM conflict_case_event WHERE case_id = $1 ORDER BY created_at, id',
    [caseId],
  );
  return rows.map(toConflictCaseEvent);
}

export async function setCaseStatus(
  db: Queryable,
  caseId: UUID,
  status: ConflictCaseStatus,
  recommendationText?: string | null,
): Promise<CaseWithPods | null> {
  const updated = await queryOne<any>(
    db,
    `UPDATE conflict_case
        SET status = $2,
            closed_at = CASE WHEN $2 = 'open' THEN NULL ELSE COALESCE(closed_at, now()) END,
            recommendation_text = COALESCE($3, recommendation_text)
      WHERE id = $1
      RETURNING id`,
    [caseId, status, recommendationText ?? null],
  );
  return updated ? getConflictCase(db, caseId) : null;
}

export async function escalateCase(
  db: Queryable,
  caseId: UUID,
): Promise<CaseWithPods | null> {
  const updated = await queryOne<any>(
    db,
    `UPDATE conflict_case
        SET escalated_to_rule_review = true, status = 'escalated',
            closed_at = COALESCE(closed_at, now())
      WHERE id = $1
      RETURNING id`,
    [caseId],
  );
  return updated ? getConflictCase(db, caseId) : null;
}

// ---------------------------------------------------------------------------
// Pitches awaiting review in a cycle
// ---------------------------------------------------------------------------

export interface ReviewablePitch {
  pitchId: UUID;
  podId: UUID;
  podName: string;
  cycleId: UUID;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  pitchSummary: string | null;
  pitchPlan: string | null;
  submittedAt: string | null;
  reviewerUserIds: UUID[];
}

export async function listReviewablePitches(
  db: Queryable,
  cycleId: UUID,
): Promise<ReviewablePitch[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT p.id AS pitch_id, p.pod_id, pod.name AS pod_name, p.cycle_id,
            c.cycle_number, c.start_date AS cycle_start, c.end_date AS cycle_end,
            p.previous_summary, p.next_plan, p.submitted_at,
            COALESCE(
              (SELECT array_agg(r.reviewer_user_id ORDER BY r.assigned_at)
                 FROM peer_review r WHERE r.pitch_id = p.id),
              ARRAY[]::uuid[]) AS reviewer_user_ids
       FROM pitch p
       JOIN pod pod ON pod.id = p.pod_id
       JOIN sprint_cycle c ON c.id = p.cycle_id
      WHERE p.cycle_id = $1 AND p.status IN ('submitted', 'reviewed', 'scored')
      ORDER BY pod.name`,
    [cycleId],
  );

  return rows.map((row: any) => ({
    pitchId: row.pitch_id,
    podId: row.pod_id,
    podName: row.pod_name,
    cycleId: row.cycle_id,
    cycleNumber: Number(row.cycle_number),
    cycleStart: toDateString(row.cycle_start),
    cycleEnd: toDateString(row.cycle_end),
    pitchSummary: row.previous_summary ?? null,
    pitchPlan: row.next_plan ?? null,
    submittedAt: row.submitted_at
      ? (row.submitted_at.toISOString?.() ?? row.submitted_at)
      : null,
    reviewerUserIds: toUuidArray(row.reviewer_user_ids),
  }));
}

function toUuidArray(value: unknown): UUID[] {
  if (Array.isArray(value)) return value as UUID[];
  if (typeof value === 'string') {
    const trimmed = value.replace(/^{|}$/g, '').trim();
    return trimmed === '' ? [] : (trimmed.split(',') as UUID[]);
  }
  return [];
}

export async function getPitchPod(
  db: Queryable,
  pitchId: UUID,
): Promise<{ pod: Pod; cycleId: UUID } | null> {
  const row = await queryOne<any>(
    db,
    `SELECT pod.*, p.cycle_id AS cycle_id
       FROM pitch p JOIN pod pod ON pod.id = p.pod_id
      WHERE p.id = $1`,
    [pitchId],
  );
  if (!row) return null;
  return { pod: toPod(row), cycleId: row.cycle_id };
}

export async function getUser(db: Queryable, userId: UUID) {
  const row = await queryOne<any>(db, 'SELECT * FROM app_user WHERE id = $1', [userId]);
  return row ? toUser(row) : null;
}
