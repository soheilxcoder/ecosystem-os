/**
 * Module 08 schema guarantees, asserted at the SQL layer.
 *
 * The two tracks' most important promises are enforced by the database rather
 * than trusted in application code: a final decision can never be edited, a
 * cast vote can never be changed, and a pod can never be on both tracks at
 * once. Mocks cannot prove any of that, so these tests run against real
 * PostgreSQL (PGlite).
 */

import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { createTestDatabase, expectDbError, truncateAll } from '../helpers/test-db';
import type { Database } from '../../db/client';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { createCycle } from '../../db/repositories/calendar';
import { insertOne, queryOne } from '../../db/client';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import type { Org, User } from '../../core/types';

let db: Database;
let org: Org;
let user: User;
let otherUser: User;
let trialPodId: string;
let activePodId: string;
let cycleId: string;
let pitchId: string;

async function makeCycle(startDate = '2026-01-01', endDate = '2026-04-01') {
  return (
    await createCycle(db, {
      orgId: org.id,
      holdingId: null,
      cycleNumber: 1,
      startDate,
      endDate,
      phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
    })
  ).id;
}

async function makePitch(podId: string, cycle: string, submittedBy: string) {
  return (
    await insertOne<{ id: string }>(
      db,
      `INSERT INTO pitch (pod_id, cycle_id, status, next_plan, submitted_at, submitted_by)
       VALUES ($1, $2, 'submitted', 'Ship the pilot', now(), $3) RETURNING id`,
      [podId, cycle, submittedBy],
    )
  ).id;
}

beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  await truncateAll(db);
  org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  const holding = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });
  user = await createUser(db, { orgId: org.id, email: 'lena@example.org', fullName: 'Lena Lead' });
  otherUser = await createUser(db, { orgId: org.id, email: 'omar@example.org', fullName: 'Omar Ops' });

  trialPodId = (
    await createPod(db, { holdingId: holding.id, name: 'Pod Ember', status: 'trial' })
  ).id;
  activePodId = (
    await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active' })
  ).id;
  await addPodMember(db, { podId: trialPodId, userId: user.id, joinedAt: '2026-01-01' });
  await addPodMember(db, { podId: activePodId, userId: otherUser.id, joinedAt: '2026-01-01' });

  cycleId = await makeCycle();
  pitchId = await makePitch(activePodId, cycleId, otherUser.id);
});

// ---------------------------------------------------------------------------
// Peer review
// ---------------------------------------------------------------------------

describe('peer review rows', () => {
  async function assignReviewer(reviewerId = user.id) {
    return (
      await insertOne<{ id: string }>(
        db,
        `INSERT INTO peer_review (cycle_id, pitch_id, reviewer_user_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [cycleId, pitchId, reviewerId],
      )
    ).id;
  }

  it('records an assignment with no score yet', async () => {
    const id = await assignReviewer();
    const row = await queryOne<any>(db, 'SELECT * FROM peer_review WHERE id = $1', [id]);
    expect(row?.score).toBeNull();
    expect(row?.submitted_at).toBeNull();
  });

  it('refuses a second assignment of the same reviewer to the same pitch', async () => {
    await assignReviewer();
    await expectDbError(() => assignReviewer(), '23505');
  });

  it('refuses a score outside 0–100', async () => {
    const id = await assignReviewer();
    await expectDbError(
      () => db.query('UPDATE peer_review SET score = $2 WHERE id = $1', [id, 140]),
      '23514',
    );
  });

  it('refuses to mark a review submitted without both a score and comments', async () => {
    const id = await assignReviewer();
    await expectDbError(
      () =>
        db.query('UPDATE peer_review SET submitted_at = now(), score = 80 WHERE id = $1', [id]),
      '23514',
    );
  });

  it('accepts a submission with a score and a justification', async () => {
    const id = await assignReviewer();
    await db.query('UPDATE peer_review SET score = 80, comments = $2, submitted_at = now() WHERE id = $1', [
      id,
      'Delivered the pilot on time and evidenced the results well.',
    ]);
    const row = await queryOne<any>(db, 'SELECT * FROM peer_review WHERE id = $1', [id]);
    expect(Number(row?.score)).toBe(80);
    expect(row?.submitted_at).toBeTruthy();
  });

  it('a submitted review can never be edited again', async () => {
    const id = await assignReviewer();
    await db.query('UPDATE peer_review SET score = 80, comments = $2, submitted_at = now() WHERE id = $1', [
      id,
      'Solid quarter with evidence.',
    ]);
    await expectDbError(
      () => db.query('UPDATE peer_review SET score = 10 WHERE id = $1', [id]),
      'immutable',
    );
    // Not even by re-submitting with the same value.
    await expectDbError(
      () => db.query('UPDATE peer_review SET submitted_at = now() WHERE id = $1', [id]),
      'immutable',
    );
  });
});

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

describe('conflict cases', () => {
  it('refuses a case between a pod and itself', async () => {
    await expectDbError(
      () =>
        insertOne(db, `INSERT INTO conflict_case (org_id, pod_a_id, pod_b_id, resolver_user_id, subject)
                       VALUES ($1, $2, $2, $3, 'Self dispute') RETURNING id`, [org.id, trialPodId, user.id]),
      '23514',
    );
  });

  it('keeps the status and the closing timestamp consistent', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO conflict_case (org_id, pod_a_id, pod_b_id, resolver_user_id, subject)
       VALUES ($1, $2, $3, $4, 'Shared QA queue') RETURNING id`,
      [org.id, trialPodId, activePodId, user.id],
    );
    await expectDbError(
      () =>
        db.query('UPDATE conflict_case SET status = $2 WHERE id = $1', [row.id, 'resolved']),
      '23514',
    );
  });

  it('an open case has no closing timestamp', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO conflict_case (org_id, pod_a_id, pod_b_id, resolver_user_id, subject)
       VALUES ($1, $2, $3, $4, 'Shared QA queue') RETURNING id`,
      [org.id, trialPodId, activePodId, user.id],
    );
    const stored = await queryOne<any>(db, 'SELECT * FROM conflict_case WHERE id = $1', [row.id]);
    expect(stored?.status).toBe('open');
    expect(stored?.closed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Track 1 — entry trial
// ---------------------------------------------------------------------------

describe('entry trial', () => {
  it('only exists for a pod in trial status', async () => {
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
           VALUES ($1, $2, '2026-01-01', '2026-04-01') RETURNING id`,
          [org.id, activePodId],
        ),
      'only a pod in trial status',
    );
  });

  it('allows only one trial per pod', async () => {
    await db.query(
      `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
       VALUES ($1, $2, '2026-01-01', '2026-04-01')`,
      [org.id, trialPodId],
    );
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
           VALUES ($1, $2, '2026-02-01', '2026-05-02') RETURNING id`,
          [org.id, trialPodId],
        ),
      '23505',
    );
  });

  it('refuses a decision date before the start date', async () => {
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
           VALUES ($1, $2, '2026-04-01', '2026-01-01') RETURNING id`,
          [org.id, trialPodId],
        ),
      '23514',
    );
  });

  it('refuses a result before both sides have recommended', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
       VALUES ($1, $2, '2026-01-01', '2026-04-01') RETURNING id`,
      [org.id, trialPodId],
    );
    await expectDbError(
      () => db.query(`UPDATE entry_trial SET final_result = 'discontinued' WHERE id = $1`, [row.id]),
      '23514',
    );
  });

  it('the final decision is immutable — a correction is a new record, not an edit', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date,
                                pod_rep_recommendation, deployment_hub_recommendation,
                                final_result, decided_at)
       VALUES ($1, $2, '2026-01-01', '2026-04-01', 'join', 'join', 'full_entry', now())
       RETURNING id`,
      [org.id, trialPodId],
    );
    await expectDbError(
      () => db.query(`UPDATE entry_trial SET final_result = 'discontinued' WHERE id = $1`, [row.id]),
      'immutable',
    );
  });
});

// ---------------------------------------------------------------------------
// Track 2 — accountability
// ---------------------------------------------------------------------------

describe('accountability cases', () => {
  it('refuses to open for a pod that is still in trial status', async () => {
    await expectDbError(
      () =>
        insertOne(db, `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`, [
          org.id,
          trialPodId,
        ]),
      '90-Day Entry Rule',
    );
  });

  it('allows only one open case per pod', async () => {
    await db.query(`INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2)`, [
      org.id,
      activePodId,
    ]);
    await expectDbError(
      () =>
        insertOne(db, `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`, [
          org.id,
          activePodId,
        ]),
      '23505',
    );
  });

  it('a closed case frees the pod for a new one', async () => {
    await db.query(
      `INSERT INTO accountability_case (org_id, pod_id, final_result, decided_at)
       VALUES ($1, $2, 'continue', now())`,
      [org.id, activePodId],
    );
    const second = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`,
      [org.id, activePodId],
    );
    expect(second.id).toBeTruthy();
  });

  it('a correction period always carries its dates', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`,
      [org.id, activePodId],
    );
    await expectDbError(
      () =>
        db.query(`UPDATE accountability_case SET current_stage = 'correction_period' WHERE id = $1`, [
          row.id,
        ]),
      '23514',
    );
  });

  it('the final decision is immutable', async () => {
    const row = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_case (org_id, pod_id, final_result, decided_at)
       VALUES ($1, $2, 'dissolve', now()) RETURNING id`,
      [org.id, activePodId],
    );
    await expectDbError(
      () => db.query(`UPDATE accountability_case SET final_result = 'continue' WHERE id = $1`, [row.id]),
      'immutable',
    );
  });
});

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('a pod is never on both tracks', () => {
  it('a pod in trial status is refused by the accountability track outright', async () => {
    await expectDbError(
      () =>
        insertOne(db, `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`, [
          org.id,
          trialPodId,
        ]),
      '90-Day Entry Rule',
    );
  });

  it('an open entry trial blocks an accountability case even after the pod graduates', async () => {
    await db.query(
      `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
       VALUES ($1, $2, '2026-01-01', '2026-04-01')`,
      [org.id, trialPodId],
    );
    // The pod is no longer in trial status, so the only thing standing between
    // it and the second track is the open trial itself.
    await db.query(`UPDATE pod SET status = 'active' WHERE id = $1`, [trialPodId]);

    await expectDbError(
      () =>
        insertOne(db, `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`, [
          org.id,
          trialPodId,
        ]),
      'open Entry Trial',
    );
  });

  it('an open accountability case blocks an entry trial', async () => {
    // The case was opened while the pod was an established unit; only then is
    // it legal to put the pod back into trial status — and the open case still
    // blocks the other track.
    await db.query(`INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2)`, [
      org.id,
      activePodId,
    ]);
    await db.query(`UPDATE pod SET status = 'trial' WHERE id = $1`, [activePodId]);
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date)
           VALUES ($1, $2, '2026-01-01', '2026-04-01') RETURNING id`,
          [org.id, activePodId],
        ),
      'open Accountability Case',
    );
  });

  it('a closed trial frees the pod for the accountability path', async () => {
    const trial = await insertOne<{ id: string }>(
      db,
      `INSERT INTO entry_trial (org_id, pod_id, start_date, decision_due_date,
                                pod_rep_recommendation, deployment_hub_recommendation,
                                final_result, decided_at)
       VALUES ($1, $2, '2026-01-01', '2026-04-01', 'join', 'join', 'full_entry', now())
       RETURNING id`,
      [org.id, trialPodId],
    );
    expect(trial.id).toBeTruthy();
    await db.query(`UPDATE pod SET status = 'active' WHERE id = $1`, [trialPodId]);
    const caseRow = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`,
      [org.id, trialPodId],
    );
    expect(caseRow.id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Panel vote
// ---------------------------------------------------------------------------

describe('the panel vote', () => {
  let caseId: string;

  beforeEach(async () => {
    caseId = (
      await insertOne<{ id: string }>(
        db,
        `INSERT INTO accountability_case (org_id, pod_id) VALUES ($1, $2) RETURNING id`,
        [org.id, activePodId],
      )
    ).id;
  });

  it('never seats the same person twice', async () => {
    await db.query(
      `INSERT INTO accountability_panel_member (case_id, user_id) VALUES ($1, $2)`,
      [caseId, user.id],
    );
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO accountability_panel_member (case_id, user_id) VALUES ($1, $2) RETURNING id`,
          [caseId, user.id],
        ),
      '23505',
    );
  });

  it('a cast vote cannot be changed', async () => {
    const member = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_panel_member (case_id, user_id) VALUES ($1, $2) RETURNING id`,
      [caseId, user.id],
    );
    await db.query(
      `UPDATE accountability_panel_member SET vote = 'dissolve', voted_at = now() WHERE id = $1`,
      [member.id],
    );
    await expectDbError(
      () => db.query(`UPDATE accountability_panel_member SET vote = 'continue' WHERE id = $1`, [member.id]),
      'immutable',
    );
  });

  it('a vote always carries the moment it was cast', async () => {
    const member = await insertOne<{ id: string }>(
      db,
      `INSERT INTO accountability_panel_member (case_id, user_id) VALUES ($1, $2) RETURNING id`,
      [caseId, user.id],
    );
    await expectDbError(
      () => db.query(`UPDATE accountability_panel_member SET vote = 'dissolve' WHERE id = $1`, [member.id]),
      '23514',
    );
  });
});

// ---------------------------------------------------------------------------
// Rule versioning
// ---------------------------------------------------------------------------

describe('rule changes', () => {
  it('refuses a change with no justification', async () => {
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO rule_change (org_id, rule_name, new_value, justification, effective_cycle_number)
           VALUES ($1, 'review.comment_min_length', '200', '   ', 4) RETURNING id`,
          [org.id],
        ),
      '23514',
    );
  });

  it('refuses a cycle number below 1', async () => {
    await expectDbError(
      () =>
        insertOne(
          db,
          `INSERT INTO rule_change (org_id, rule_name, new_value, justification, effective_cycle_number)
           VALUES ($1, 'review.comment_min_length', '200', 'Longer comments help pods improve.', 0)
           RETURNING id`,
          [org.id],
        ),
      '23514',
    );
  });

  it('records the old value, the new value and the effective cycle together', async () => {
    const row = await insertOne<any>(
      db,
      `INSERT INTO rule_change (org_id, rule_name, old_value, new_value, justification, effective_cycle_number)
       VALUES ($1, 'review.comment_min_length', '140', '200', 'Longer comments help pods improve.', 4)
       RETURNING *`,
      [org.id],
    );
    expect(row.rule_name).toBe('review.comment_min_length');
    expect(row.old_value).toBe(140);
    expect(row.effective_cycle_number).toBe(4);
    expect(row.approved_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Governance settings
// ---------------------------------------------------------------------------

describe('governance settings', () => {
  it('ship with a panel of at least three people by default', async () => {
    await db.query(`INSERT INTO org_governance_config (org_id) VALUES ($1)`, [org.id]);
    const row = await queryOne<any>(
      db,
      'SELECT * FROM org_governance_config WHERE org_id = $1',
      [org.id],
    );
    expect(Number(row?.accountability_panel_size)).toBeGreaterThanOrEqual(3);
    expect(Number(row?.accountability_correction_days)).toBe(30);
  });

  it('refuses a panel smaller than three — never a single decision-maker', async () => {
    await db.query(`INSERT INTO org_governance_config (org_id) VALUES ($1)`, [org.id]);
    await expectDbError(
      () =>
        db.query('UPDATE org_governance_config SET accountability_panel_size = 1 WHERE org_id = $1', [
          org.id,
        ]),
      '23514',
    );
  });
});
