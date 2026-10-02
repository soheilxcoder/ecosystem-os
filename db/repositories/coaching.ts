/**
 * Coaching data access (Module 07).
 *
 * One rule dominates this file, and it is the reason the session reads come in
 * pairs rather than as one function with a flag:
 *
 * **`private_notes` has no pod-facing read path.**
 *
 * 07 §business logic requires that a coach's private notes are "never exposed
 * via any API to non-coach/non-Coaching-Hub roles, including Company X's other
 * hubs", and that this is "enforced at the query layer (row-level access
 * control), not just hidden in the UI". A boolean parameter like
 * `includePrivateNotes` would put that decision at every call site, and one
 * wrong `true` leaks. Instead:
 *
 *   - `listPodVisibleSessions` / `getPodVisibleSession` select from the
 *     `coaching_session_pod_visible` view. The view's column list does not
 *     contain `private_notes`, so the value never reaches the application
 *     process at all — not even to be dropped later.
 *   - `listCoachSessions` / `getCoachSession` select from `coaching_session`
 *     and return the full `CoachingSession` type.
 *
 * The two return types are unrelated enough that the compiler catches a mix-up:
 * `CoachingSession` has `privateNotes`, `PodVisibleSession` does not, so a
 * handler typed against the pod-visible shape cannot forward the private one
 * without an explicit cast that a reviewer will see.
 *
 * Everything else here is ordinary: assignments, profiles, session requests and
 * stored health signals.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  CoachAssignment,
  CoachCapacity,
  CoachProfile,
  CoachingSession,
  CoachingSessionRequest,
  CoachingSessionType,
  PodHealthSignal,
  PodVisibleSession,
  SessionRequestStatus,
  SessionRequestUrgency,
  UUID,
} from '../../core/types';
import type { HealthScoreParts, HealthSignal } from '../../core/health';
import {
  toCoachAssignment,
  toCoachProfile,
  toCoachingSession,
  toCoachingSessionRequest,
  toPodHealthSignal,
  toPodVisibleSession,
} from './rows';

// ---------------------------------------------------------------------------
// Coach profiles
// ---------------------------------------------------------------------------

export async function getCoachProfile(
  db: Queryable,
  coachUserId: UUID,
): Promise<CoachProfile | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM coach_profile WHERE coach_user_id = $1',
    [coachUserId],
  );
  return row ? toCoachProfile(row) : null;
}

export async function listCoachProfiles(db: Queryable, orgId: UUID): Promise<CoachProfile[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM coach_profile WHERE org_id = $1 ORDER BY created_at',
    [orgId],
  );
  return rows.map(toCoachProfile);
}

/**
 * Creates the profile row if absent and records what the coach just stated
 * about their own capacity.
 *
 * Capacity is self-reported, never inferred (07 §roster), so it is written only
 * from a value the coach supplied — `null` here means "no update", not
 * "reset to comfortable".
 */
export async function upsertCoachProfile(
  db: Queryable,
  input: {
    orgId: UUID;
    coachUserId: UUID;
    schedulingUrl?: string | null;
    capacity?: CoachCapacity | null;
  },
): Promise<CoachProfile> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO coach_profile (org_id, coach_user_id, scheduling_url, capacity, capacity_stated_at)
     VALUES ($1, $2, $3,
             COALESCE($4, 'comfortable'),
             CASE WHEN $4 IS NULL THEN NULL ELSE now() END)
     ON CONFLICT (coach_user_id) DO UPDATE
        SET scheduling_url = COALESCE($3, coach_profile.scheduling_url),
            capacity = COALESCE($4, coach_profile.capacity),
            capacity_stated_at = CASE
              WHEN $4 IS NULL THEN coach_profile.capacity_stated_at
              ELSE now()
            END,
            updated_at = now()
     RETURNING *`,
    [
      input.orgId,
      input.coachUserId,
      input.schedulingUrl ?? null,
      input.capacity ?? null,
    ],
  );
  return toCoachProfile(row);
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function getAssignment(
  db: Queryable,
  assignmentId: UUID,
): Promise<CoachAssignment | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM coach_assignment WHERE id = $1',
    [assignmentId],
  );
  return row ? toCoachAssignment(row) : null;
}

/** The coach a pod currently has. At most one row, by the partial unique index. */
export async function getActiveAssignmentForPod(
  db: Queryable,
  podId: UUID,
): Promise<CoachAssignment | null> {
  const row = await queryOne<any>(
    db,
    `SELECT * FROM coach_assignment
      WHERE pod_id = $1 AND status = 'active'`,
    [podId],
  );
  return row ? toCoachAssignment(row) : null;
}

/** Every pod a coach currently covers — the console's card grid membership. */
export async function listActiveAssignmentsForCoach(
  db: Queryable,
  coachUserId: UUID,
): Promise<CoachAssignment[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coach_assignment
      WHERE coach_user_id = $1 AND status = 'active'
      ORDER BY start_cycle_id DESC`,
    [coachUserId],
  );
  return rows.map(toCoachAssignment);
}

export async function listActiveAssignments(
  db: Queryable,
  orgId: UUID,
): Promise<CoachAssignment[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coach_assignment
      WHERE org_id = $1 AND status = 'active'
      ORDER BY coach_user_id, pod_id`,
    [orgId],
  );
  return rows.map(toCoachAssignment);
}

/**
 * A pod's assignment history, newest first.
 *
 * The console's reassignment countdown and `/coaching/my-coach`'s "coaching
 * since" both read this, and the accountability question "who coached this pod
 * when it went red?" is only answerable because ended rows are kept rather than
 * overwritten.
 */
export async function listAssignmentsForPod(
  db: Queryable,
  podId: UUID,
): Promise<CoachAssignment[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coach_assignment
      WHERE pod_id = $1
      ORDER BY start_cycle_id DESC, created_at DESC`,
    [podId],
  );
  return rows.map(toCoachAssignment);
}

export interface CreateAssignmentInput {
  orgId: UUID;
  coachUserId: UUID;
  podId: UUID;
  startCycleId: UUID;
  reasonForChange?: string | null;
  createdBy?: UUID | null;
}

export async function createAssignment(
  db: Queryable,
  input: CreateAssignmentInput,
): Promise<CoachAssignment> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO coach_assignment
       (org_id, coach_user_id, pod_id, start_cycle_id, reason_for_change, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.orgId,
      input.coachUserId,
      input.podId,
      input.startCycleId,
      input.reasonForChange ?? null,
      input.createdBy ?? null,
    ],
  );
  return toCoachAssignment(row);
}

/**
 * Closes an assignment.
 *
 * Ending is one half of a reassignment; the caller opens the replacement in the
 * same transaction. `reasonForChange` is required by the table's CHECK, because
 * an unexplained move cannot be audited later.
 */
export async function endAssignment(
  db: Queryable,
  assignmentId: UUID,
  input: { endCycleId: UUID; reasonForChange: string },
): Promise<CoachAssignment | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE coach_assignment
        SET status = 'ended',
            end_cycle_id = $2,
            reason_for_change = $3,
            updated_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
    [assignmentId, input.endCycleId, input.reasonForChange],
  );
  return row ? toCoachAssignment(row) : null;
}

// ---------------------------------------------------------------------------
// Sessions — the two read paths
// ---------------------------------------------------------------------------

/**
 * Session history as the pod sees it.
 *
 * Reads the `coaching_session_pod_visible` view. `private_notes` is not in that
 * view's column list, so it is not fetched, not deserialized and not present in
 * the returned object — see the file header for why that matters more than
 * filtering the field out afterwards.
 */
export async function listPodVisibleSessions(
  db: Queryable,
  podId: UUID,
  limit = 50,
): Promise<PodVisibleSession[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coaching_session_pod_visible
      WHERE pod_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2`,
    [podId, limit],
  );
  return rows.map(toPodVisibleSession);
}

/** One pod-visible session, for the pod's own history drill-down. */
export async function getPodVisibleSession(
  db: Queryable,
  sessionId: UUID,
  podId: UUID,
): Promise<PodVisibleSession | null> {
  const row = await queryOne<any>(
    db,
    `SELECT * FROM coaching_session_pod_visible
      WHERE id = $1 AND pod_id = $2`,
    [sessionId, podId],
  );
  return row ? toPodVisibleSession(row) : null;
}

/**
 * The assigned coach's sessions, private notes included.
 *
 * Scoped by `coach_user_id` as well as `pod_id`: a coach sees notes for the
 * pods they cover, and the service layer checks the assignment before calling.
 */
export async function listCoachSessions(
  db: Queryable,
  coachUserId: UUID,
  podId: UUID,
  limit = 50,
): Promise<CoachingSession[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coaching_session
      WHERE coach_user_id = $1 AND pod_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3`,
    [coachUserId, podId, limit],
  );
  return rows.map(toCoachingSession);
}

/** The full session row. Callers must have established the right to see it. */
export async function getCoachSession(
  db: Queryable,
  sessionId: UUID,
): Promise<CoachingSession | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM coaching_session WHERE id = $1',
    [sessionId],
  );
  return row ? toCoachingSession(row) : null;
}

/** Every session for a pod regardless of coach, notes included — Coaching Hub only. */
export async function listAllSessionsForPod(
  db: Queryable,
  podId: UUID,
  limit = 100,
): Promise<CoachingSession[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coaching_session
      WHERE pod_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2`,
    [podId, limit],
  );
  return rows.map(toCoachingSession);
}

export interface CreateSessionInput {
  orgId: UUID;
  coachUserId: UUID;
  podId: UUID;
  occurredAt: string;
  sessionType: CoachingSessionType;
  privateNotes: string;
  /**
   * `null` means "saved privately". A non-null value means the coach pressed
   * `[Save & Share Summary with Pod]`; the two are never conflated, which is
   * the whole point of 07's two-button rule.
   */
  podVisibleSummary?: string | null;
  requestId?: UUID | null;
}

export async function createSession(
  db: Queryable,
  input: CreateSessionInput,
): Promise<CoachingSession> {
  // `shared_with_pod` is derived in JS rather than as `$7 IS NOT NULL` in SQL:
  // when the summary is null the driver sends an untyped parameter, and
  // Postgres cannot infer a type for it inside `IS NOT NULL` (SQLSTATE 42P08).
  const summary = input.podVisibleSummary ?? null;
  const row = await insertOne<any>(
    db,
    `INSERT INTO coaching_session
       (org_id, coach_user_id, pod_id, occurred_at, session_type,
        private_notes, pod_visible_summary, shared_with_pod, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.orgId,
      input.coachUserId,
      input.podId,
      input.occurredAt,
      input.sessionType,
      input.privateNotes,
      summary,
      summary !== null,
      input.requestId ?? null,
    ],
  );
  return toCoachingSession(row);
}

/**
 * Edits a session's notes and its sharing decision.
 *
 * `podVisibleSummary` is passed through as given: `null` un-shares, a string
 * shares. The table's CHECK keeps `shared_with_pod` in step with it, so a row
 * can never claim to have shared something that is not there.
 */
export async function updateSession(
  db: Queryable,
  sessionId: UUID,
  input: {
    occurredAt?: string;
    sessionType?: CoachingSessionType;
    privateNotes?: string;
    podVisibleSummary?: string | null;
  },
): Promise<CoachingSession | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE coaching_session
        SET occurred_at = COALESCE($2, occurred_at),
            session_type = COALESCE($3, session_type),
            private_notes = COALESCE($4, private_notes),
            pod_visible_summary = CASE
              WHEN $5 IS NOT NULL THEN $5
              WHEN $6 THEN NULL
              ELSE pod_visible_summary
            END,
            shared_with_pod = CASE
              WHEN $5 IS NOT NULL THEN true
              WHEN $6 THEN false
              ELSE shared_with_pod
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      sessionId,
      input.occurredAt ?? null,
      input.sessionType ?? null,
      input.privateNotes ?? null,
      input.podVisibleSummary ?? null,
      // Distinguishes "caller explicitly passed null" from "caller omitted the
      // field", which the single COALESCE above cannot express on its own.
      input.podVisibleSummary === null,
    ],
  );
  return row ? toCoachingSession(row) : null;
}

// ---------------------------------------------------------------------------
// Session requests
// ---------------------------------------------------------------------------

export async function createSessionRequest(
  db: Queryable,
  input: {
    orgId: UUID;
    podId: UUID;
    coachUserId: UUID;
    requestedBy: UUID;
    topic: string;
    urgency?: SessionRequestUrgency;
    preferredTimes?: string | null;
  },
): Promise<CoachingSessionRequest> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO coaching_session_request
       (org_id, pod_id, coach_user_id, requested_by, topic, urgency, preferred_times)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'normal'), $7)
     RETURNING *`,
    [
      input.orgId,
      input.podId,
      input.coachUserId,
      input.requestedBy,
      input.topic,
      input.urgency ?? null,
      input.preferredTimes ?? null,
    ],
  );
  return toCoachingSessionRequest(row);
}

export async function listSessionRequestsForPod(
  db: Queryable,
  podId: UUID,
  limit = 30,
): Promise<CoachingSessionRequest[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coaching_session_request
      WHERE pod_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [podId, limit],
  );
  return rows.map(toCoachingSessionRequest);
}

export async function listOpenRequestsForCoach(
  db: Queryable,
  coachUserId: UUID,
  limit = 50,
): Promise<CoachingSessionRequest[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM coaching_session_request
      WHERE coach_user_id = $1 AND status = 'open'
      ORDER BY
        CASE urgency WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        created_at
      LIMIT $2`,
    [coachUserId, limit],
  );
  return rows.map(toCoachingSessionRequest);
}

export async function setSessionRequestStatus(
  db: Queryable,
  requestId: UUID,
  status: SessionRequestStatus,
): Promise<CoachingSessionRequest | null> {
  const row = await queryOne<any>(
    db,
    `UPDATE coaching_session_request
        SET status = $2,
            responded_at = CASE WHEN $2 = 'open' THEN responded_at ELSE now() END
      WHERE id = $1
      RETURNING *`,
    [requestId, status],
  );
  return row ? toCoachingSessionRequest(row) : null;
}

// ---------------------------------------------------------------------------
// Health signals
// ---------------------------------------------------------------------------

/**
 * Writes (or rewrites) the signal for one pod in one cycle.
 *
 * Recomputation upserts rather than appends: a signal is the current answer for
 * that cycle, and a pile of near-duplicate rows would make "which colour was
 * this pod in cycle 3?" ambiguous. The inputs are snapshotted on the row, so
 * the audit trail lives in `contributing_factors` and `score_parts`, not in
 * row count.
 */
export async function upsertHealthSignal(
  db: Queryable,
  input: {
    orgId: UUID;
    podId: UUID;
    cycleId: UUID;
    signal: HealthSignal;
    formulaVersion?: string;
  },
): Promise<PodHealthSignal> {
  const row = await insertOne<any>(
    db,
    `INSERT INTO pod_health_signal
       (org_id, pod_id, cycle_id, signal_color, signal_score,
        score_parts, contributing_factors, provenance, formula_version, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, now())
     ON CONFLICT (pod_id, cycle_id) DO UPDATE
        SET signal_color = EXCLUDED.signal_color,
            signal_score = EXCLUDED.signal_score,
            score_parts = EXCLUDED.score_parts,
            contributing_factors = EXCLUDED.contributing_factors,
            provenance = EXCLUDED.provenance,
            formula_version = EXCLUDED.formula_version,
            computed_at = now()
     RETURNING *`,
    [
      input.orgId,
      input.podId,
      input.cycleId,
      input.signal.color,
      input.signal.rawScore,
      JSON.stringify(input.signal.parts satisfies HealthScoreParts),
      JSON.stringify(input.signal.factors),
      // NULL when the caller could not name its sources; the column is nullable
      // so a signal is never blocked on provenance it does not have.
      input.signal.provenance ? JSON.stringify(input.signal.provenance) : null,
      input.formulaVersion ?? 'health.v1',
    ],
  );
  return toPodHealthSignal(row);
}

export async function getHealthSignal(
  db: Queryable,
  podId: UUID,
  cycleId: UUID,
): Promise<PodHealthSignal | null> {
  const row = await queryOne<any>(
    db,
    'SELECT * FROM pod_health_signal WHERE pod_id = $1 AND cycle_id = $2',
    [podId, cycleId],
  );
  return row ? toPodHealthSignal(row) : null;
}

/**
 * A pod's signals, oldest first.
 *
 * Ordered ascending because the red-streak calculation counts back from the
 * most recent and the trend chart draws left to right; both want this order.
 */
export async function listHealthSignalsForPod(
  db: Queryable,
  podId: UUID,
  limit = 12,
): Promise<PodHealthSignal[]> {
  const rows = await queryMany<any>(
    db,
    `SELECT * FROM (
       SELECT * FROM pod_health_signal
         WHERE pod_id = $1
         ORDER BY computed_at DESC
         LIMIT $2
     ) recent
     ORDER BY computed_at ASC`,
    [podId, limit],
  );
  return rows.map(toPodHealthSignal);
}

/** Every pod's signal for one cycle — the coach console's grid in one query. */
export async function listHealthSignalsForCycle(
  db: Queryable,
  cycleId: UUID,
): Promise<PodHealthSignal[]> {
  const rows = await queryMany<any>(
    db,
    'SELECT * FROM pod_health_signal WHERE cycle_id = $1 ORDER BY pod_id',
    [cycleId],
  );
  return rows.map(toPodHealthSignal);
}
