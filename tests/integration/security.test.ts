/**
 * Phase 8 hardening — security suite (13-TECHNICAL-ARCHITECTURE §6, §9).
 *
 * The two row-level leak points the plan names — coach private notes and
 * investor aggregation minimums — are covered end-to-end in
 * `coaching-routes.test.ts` ("row-level access control on private notes") and
 * `hub.test.ts` ("investor reports — aggregation enforced"). This file covers
 * the remaining §6 guarantees that belong to no single module:
 *
 *   - write rate limiting on the public write surfaces (proposal creation,
 *     voting, review submission) — per user, sliding window
 *   - the audit log is append-only at the database level (a trigger rejects
 *     UPDATE and DELETE), so no code path can quietly rewrite history
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { createTestDatabase } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { createPod } from '../../db/repositories/pods';
import { buildServer } from '../../server/index';

const TODAY = '2026-09-20';

let db: Database;
let app: FastifyInstance;

let lenaToken: string; // plain member — the flood candidate
let ariToken: string; // second user — proves limits are per-user

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
  const holding = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });
  await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', status: 'active' });

  const lenaId = (await createUser(db, { orgId: org.id, email: 'lena@example.org', fullName: 'Lena' })).id;
  const ariId = (await createUser(db, { orgId: org.id, email: 'ari@example.org', fullName: 'Ari' })).id;

  // Tight buckets so the suite stays fast: the production limits (10/h, 20/h)
  // are asserted by the defaults in server/services/rate-limit.ts.
  app = await buildServer({
    db,
    env: { TODAY },
    logger: false,
    rateLimitOverrides: {
      'proposal.create': { max: 3, windowMs: 60 * 60 * 1000 },
      'pod.vote': { max: 2, windowMs: 60 * 60 * 1000 },
      'review.submit': { max: 2, windowMs: 60 * 60 * 1000 },
    },
  });

  lenaToken = await login(app, 'lena@example.org');
  ariToken = await login(app, 'ari@example.org');
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

// ---------------------------------------------------------------------------
// Write rate limiting — proposal creation, voting, review submission
// ---------------------------------------------------------------------------

describe('write rate limiting (13 §6)', () => {
  it('caps proposal creation per user: the fourth write in the window gets 429', async () => {
    // The limiter counts writes before any other work, so even requests that
    // will later be refused (403 here — Lena holds no pod-lead seat) consume
    // budget. That ordering is the point: a flood costs the database nothing.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agreements',
        headers: bearer(lenaToken),
        payload: { podAId: crypto.randomUUID(), podBId: crypto.randomUUID(), terms: {} },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it('keeps separate budgets per user — the second account still writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agreements',
      headers: bearer(ariToken),
      payload: { podAId: crypto.randomUUID(), podBId: crypto.randomUUID(), terms: {} },
    });
    expect(response.statusCode).not.toBe(429);
  });

  it('caps pod-lead voting per user', async () => {
    const podId = crypto.randomUUID(); // existence is irrelevant — the limiter fires first
    const first = await app.inject({
      method: 'POST',
      url: `/api/pods/${podId}/pod-lead-vote`,
      headers: bearer(ariToken),
      payload: { candidateUserId: crypto.randomUUID() },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/pods/${podId}/pod-lead-vote`,
      headers: bearer(ariToken),
      payload: { candidateUserId: crypto.randomUUID() },
    });
    const third = await app.inject({
      method: 'POST',
      url: `/api/pods/${podId}/pod-lead-vote`,
      headers: bearer(ariToken),
      payload: { candidateUserId: crypto.randomUUID() },
    });
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).not.toBe(429);
    expect(third.statusCode).toBe(429);
    expect(third.json<{ error: string }>().error).toBe('rate_limited');
  });

  it('caps review score submission per user', async () => {
    const pitchId = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/review/${pitchId}/score`,
        headers: bearer(lenaToken),
        payload: { score: 50, comments: 'x', submit: false },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 2).every((s) => s !== 429)).toBe(true);
    expect(statuses[2]).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Audit log — append-only at the database level
// ---------------------------------------------------------------------------

describe('audit log append-only', () => {
  it('rejects UPDATE and DELETE on audit_log via the database trigger', async () => {
    await expect(
      db.query('UPDATE audit_log SET action = $1 WHERE 1 = 1', ['tampered']),
    ).rejects.toThrow();

    await expect(db.query('DELETE FROM audit_log WHERE 1 = 1', [])).rejects.toThrow();
  });

  it('still accepts inserts — history keeps growing', async () => {
    const before = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM audit_log');
    await db.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id)
       VALUES (NULL, 'security.probe', 'audit_log', gen_random_uuid())`,
      [],
    );
    const after = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM audit_log');
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 1);
  });
});
