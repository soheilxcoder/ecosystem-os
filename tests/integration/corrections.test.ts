/**
 * Phase 8 — the Correction Record workflow (13-TECHNICAL-ARCHITECTURE.md §7),
 * verified against a simulated real-world error:
 *
 *   "The accounting sync had a bug and Pod Atlas's revenue figure for the
 *    current cycle was wrong."
 *
 * Locked records are immutable; the correction never overwrites the original
 * row. It stores a frozen original beside the corrected value, needs TWO
 * distinct Architecture Hub members (propose → approve), and becomes part of
 * the same audit/archive/notification fabric everything else uses.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { createCycle } from '../../db/repositories/calendar';
import { recordFinancialSync } from '../../db/repositories/budget';
import { buildServer } from '../../server/index';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';

const CYCLE_START = '2026-07-01';
const TODAY = addDays(CYCLE_START, 20);

let db: Database;
let app: FastifyInstance;
let orgId: string;
let cycleId: string;
let atlas: string;
let syncId: string;

let ariToken: string; // architect #1 (proposes)
let avivaToken: string; // architect #2 (approves)
let lenaToken: string; // pod member — no correction rights

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function login(target: FastifyInstance, email: string): Promise<string> {
  const response = await target.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

beforeAll(async () => {
  db = await createTestDatabase();

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  orgId = org.id;
  const holding = await createHolding(db, { orgId, name: 'Holding Pars', code: 'PRS' });
  atlas = (await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active' })).id;

  const mkUser = async (name: string, email: string): Promise<string> =>
    (await createUser(db, { orgId, email, fullName: name })).id;

  const ariId = await mkUser('Ari Architect', 'ari@example.org');
  const avivaId = await mkUser('Aviva Architect', 'aviva@example.org');
  const lenaId = await mkUser('Lena Lead', 'lena@example.org');

  await assignRole(db, { userId: ariId, roleType: 'hub_architecture', scopeType: 'org', scopeId: null, startDate: CYCLE_START });
  await assignRole(db, { userId: avivaId, roleType: 'hub_architecture', scopeType: 'org', scopeId: null, startDate: CYCLE_START });
  await assignRole(db, { userId: lenaId, roleType: 'pod_member', scopeType: 'pod', scopeId: atlas, startDate: CYCLE_START });

  const cycle = await createCycle(db, {
    orgId,
    holdingId: null,
    cycleNumber: 1,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });
  cycleId = cycle.id;

  // The buggy sync: revenue was recorded as 5,000 but the real figure is 8,400.
  const sync = await recordFinancialSync(db, {
    podId: atlas,
    cycleId,
    sourceSystem: 'Main Accounting',
    periodStart: CYCLE_START,
    periodEnd: TODAY,
    status: 'ok',
    revenue: 5000,
    costs: 2000,
    profit: 3000,
  });
  syncId = sync!.id;

  app = await buildServer({ db, env: { TODAY }, logger: false });
  ariToken = await login(app, 'ari@example.org');
  avivaToken = await login(app, 'aviva@example.org');
  lenaToken = await login(app, 'lena@example.org');
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('correction workflow — simulated accounting-sync bug', () => {
  let correctionId: string;

  it('only an Architecture Hub member may propose', async () => {
    const denied = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(lenaToken),
      payload: {
        entityType: 'financial_sync',
        entityId: syncId,
        fieldCorrected: 'revenue',
        correctedValue: 8400,
        reason: 'Sync bug — the connector dropped the thousands digit.',
      },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('freezes the original value from the database, not the request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(ariToken),
      payload: {
        entityType: 'financial_sync',
        entityId: syncId,
        fieldCorrected: 'revenue',
        correctedValue: 8400,
        reason: 'Sync bug — the connector dropped the thousands digit.',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const record = response.json<{ data: { id: string; status: string; originalValue: unknown; correctedValue: unknown } }>().data;
    correctionId = record.id;
    expect(record.status).toBe('pending');
    expect(Number(record.originalValue)).toBe(5000); // frozen from the row
    expect(Number(record.correctedValue)).toBe(8400);
  });

  it('refuses a field outside the allowlist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(ariToken),
      payload: {
        entityType: 'financial_sync',
        entityId: syncId,
        fieldCorrected: 'source_system',
        correctedValue: 'evil',
        reason: 'Trying to correct a field that is not on the allowlist.',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('enforces the two-person rule: the proposer cannot approve', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${correctionId}/approve`,
      headers: bearer(ariToken),
    });
    expect(response.statusCode).toBe(409);
  });

  it('a second architect approves; the original row is never touched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${correctionId}/approve`,
      headers: bearer(avivaToken),
    });
    expect(response.statusCode, response.body).toBe(200);
    const record = response.json<{ data: { status: string; approvedBy: string | null; decidedAt: string | null } }>().data;
    expect(record.status).toBe('approved');
    expect(record.approvedBy).toBeTruthy();
    expect(record.decidedAt).toBeTruthy();

    // Immutability: the sync row still carries the original (wrong) figure.
    const rows = (await db.query<{ revenue: number }>('SELECT revenue FROM financial_sync_record WHERE id = $1', [syncId])).rows;
    expect(Number(rows[0]!.revenue)).toBe(5000);

    // Transparency: the correction is indexed in the Archive…
    const archive = (
      await db.query<{ entity_type: string; title: string }>("SELECT entity_type, title FROM archive_index_entry WHERE entity_type = 'correction'")
    ).rows;
    expect(archive.length).toBeGreaterThan(0);
    expect(archive[0]!.title).toContain('revenue');

    // …audited…
    const audit = (
      await db.query<{ action: string }>("SELECT action FROM audit_log WHERE entity_type = 'correction_record' ORDER BY created_at")
    ).rows.map((r) => r.action);
    expect(audit).toContain('correction.proposed');
    expect(audit).toContain('correction.approved');

    // …and the whole org was told.
    const notified = (
      await db.query<{ n: number }>("SELECT COUNT(DISTINCT recipient_user_id)::int AS n FROM notification WHERE trigger_type = 'correction_approved'")
    ).rows;
    expect(notified[0]!.n).toBe(3);
  });

  it('an already-decided correction cannot be decided again', async () => {
    const again = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${correctionId}/approve`,
      headers: bearer(avivaToken),
    });
    expect(again.statusCode).toBe(409);
  });

  it('the corrected and original values are listed side by side', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/hub/corrections?entityType=financial_sync&entityId=${syncId}`,
      headers: bearer(lenaToken), // corrections are public inside the org
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ data: Array<{ originalValue: unknown; correctedValue: unknown; status: string; proposedByName: string | null; approvedByName: string | null }> }>().data;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('approved');
    expect(Number(rows[0]!.originalValue)).toBe(5000);
    expect(Number(rows[0]!.correctedValue)).toBe(8400);
    expect(rows[0]!.proposedByName).toBe('Ari Architect');
    expect(rows[0]!.approvedByName).toBe('Aviva Architect');
  });
});

describe('correction workflow — rejection', () => {
  it('a second architect may reject; rejection is final too', async () => {
    const proposed = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(avivaToken),
      payload: {
        entityType: 'financial_sync',
        entityId: syncId,
        fieldCorrected: 'costs',
        correctedValue: 9999,
        reason: 'Deliberately dubious change to exercise the reject path.',
      },
    });
    expect(proposed.statusCode).toBe(201);
    const id = proposed.json<{ data: { id: string } }>().data.id;

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${id}/reject`,
      headers: bearer(ariToken),
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<{ data: { status: string } }>().data.status).toBe('rejected');

    const tooLate = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${id}/approve`,
      headers: bearer(ariToken),
    });
    expect(tooLate.statusCode).toBe(409);
  });

  it('correcting a missing record is a clean 404', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(ariToken),
      payload: {
        entityType: 'financial_sync',
        entityId: '00000000-0000-4000-8000-000000000000',
        fieldCorrected: 'revenue',
        correctedValue: 1,
        reason: 'The target row does not exist in this scenario.',
      },
    });
    expect(response.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Regression: string-valued fields round-trip exactly
// ---------------------------------------------------------------------------
// The jsonb snapshots are stored once and read back by many callers. A bare
// string ("full_entry") must survive the round trip as a string — an earlier
// driver quirk (PGlite auto-parsing jsonb) turned it into null, which the
// explicit ::text reads in db/repositories/hub.ts now prevent.

describe('string-valued corrections round-trip', () => {
  it('freezes and returns a text field unchanged through propose + approve', async () => {
    // A database trigger only allows trials on pods in trial status; this suite
    // is disposable, so flip Atlas rather than building a second pod.
    await db.query("UPDATE pod SET status = 'trial' WHERE id = $1", [atlas]);
    const trial = await db.query<{ id: string }>(
      `INSERT INTO entry_trial
         (org_id, pod_id, start_date, decision_due_date,
          pod_rep_recommendation, deployment_hub_recommendation, final_result, decided_at)
       VALUES ($1, $2, $3, $4, 'discontinue', 'discontinue', 'discontinued', now())
       RETURNING id`,
      [orgId, atlas, CYCLE_START, addDays(CYCLE_START, 89)],
    );
    const trialId = trial.rows[0]!.id;

    const proposed = await app.inject({
      method: 'POST',
      url: '/api/hub/corrections',
      headers: bearer(ariToken),
      payload: {
        entityType: 'entry_trial',
        entityId: trialId,
        fieldCorrected: 'final_result',
        correctedValue: 'full_entry',
        reason: 'The trial outcome was recorded against the wrong pod.',
      },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const record = proposed.json<{
      data: { id: string; originalValue: unknown; correctedValue: unknown };
    }>().data;
    expect(record.originalValue).toBe('discontinued');
    expect(record.correctedValue).toBe('full_entry');

    const approved = await app.inject({
      method: 'POST',
      url: `/api/hub/corrections/${record.id}/approve`,
      headers: bearer(avivaToken),
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/hub/corrections?entityId=${trialId}`,
      headers: bearer(lenaToken),
    });
    expect(listed.statusCode).toBe(200);
    const rows = listed.json<{
      data: Array<{ originalValue: unknown; correctedValue: unknown; podId: string | null }>;
    }>().data;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.originalValue).toBe('discontinued');
    expect(rows[0]!.correctedValue).toBe('full_entry');
    // The listing resolves the owning pod, so screens can pair them.
    expect(rows[0]!.podId).toBe(atlas);

    // The trial row itself is untouched — corrections never overwrite.
    const row = await db.query<{ final_result: string }>(
      'SELECT final_result FROM entry_trial WHERE id = $1',
      [trialId],
    );
    expect(row.rows[0]!.final_result).toBe('discontinued');
  });
});
