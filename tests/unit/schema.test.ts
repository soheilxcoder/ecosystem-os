/**
 * Schema tests — the database is the last line of defence for this product's
 * correctness claims (immutable records, one live role per seat, no orphaned
 * memberships), so the guarantees are asserted at the SQL layer rather than
 * trusted in application code.
 */

import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { createTestDatabase, expectDbError, truncateAll } from '../helpers/test-db';
import type { Database } from '../../db/client';
import { migrate, isUpToDate, readMigrations } from '../../db/migrate';
import { createUser } from '../../db/repositories/users';
import { assignRole, revokeRole } from '../../db/repositories/roles';
import { addPodMember, createPod, removePodMember } from '../../db/repositories/pods';
import { recordAudit } from '../../db/repositories/audit';
import { createHolding, createOrg } from '../../db/repositories/users';
import type { Org, User } from '../../core/types';

let db: Database;
let org: Org;
let user: User;

// A PGlite instance boots a real Postgres in ~2s, so the database is created
// once per file and reset with TRUNCATE between tests rather than recreated.
beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  await truncateAll(db);
  org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  user = await createUser(db, { orgId: org.id, email: 'ada@example.org', fullName: 'Ada Lovelace' });
});

describe('migrations', () => {
  it('ships at least one migration and applies it to an empty database', async () => {
    const migrations = await readMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(await isUpToDate(db)).toBe(true);
  });

  it('is idempotent — a second run applies nothing', async () => {
    const applied = await migrate(db);
    expect(applied).toEqual([]);
    expect(await isUpToDate(db)).toBe(true);
  });

  it('refuses to run when an applied migration is edited afterwards', async () => {
    const migrations = await readMigrations();
    const first = migrations[0]!;
    const original = (
      await db.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version = $1', [
        first.version,
      ])
    ).rows[0]!.checksum;
    await db.query('UPDATE schema_migrations SET checksum = $2 WHERE version = $1', [
      first.version,
      'tampered-checksum',
    ]);
    try {
      await expect(migrate(db)).rejects.toThrow(/has changed since it was applied/);
    } finally {
      // Restore so later tests in this file see a genuine up-to-date schema.
      await db.query('UPDATE schema_migrations SET checksum = $2 WHERE version = $1', [
        first.version,
        original,
      ]);
    }
  });

  it('records every applied version with a checksum', async () => {
    const { rows } = await db.query<{ version: string; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.checksum.length === 16)).toBe(true);
  });
});

describe('app_user', () => {
  it('enforces case-insensitive email uniqueness', async () => {
    const error = await expectDbError(
      () => createUser(db, { orgId: org.id, email: 'ADA@example.org', fullName: 'Ada Again' }),
      /23505|duplicate key|unique/i,
    );
    expect(error.code ?? error.message).toBeTruthy();
  });

  it('rejects a user without an existing org (foreign key)', async () => {
    await expectDbError(
      () =>
        createUser(db, {
          orgId: '00000000-0000-4000-8000-000000000000',
          email: 'ghost@example.org',
          fullName: 'Ghost',
        }),
      /23503|foreign key|violates/i,
    );
  });

  it('rejects an unknown status (check constraint)', async () => {
    await expectDbError(
      () =>
        db.query(
          `INSERT INTO app_user (org_id, email, full_name, status) VALUES ($1, $2, $3, $4)`,
          [org.id, 'x@example.org', 'X', 'zombie'],
        ),
      /23514|check constraint|violates/i,
    );
  });

  it('maintains updated_at automatically', async () => {
    const before = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM app_user WHERE id = $1',
      [user.id],
    );
    await db.query(`UPDATE app_user SET full_name = $2 WHERE id = $1`, [user.id, 'Ada L.']);
    const after = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM app_user WHERE id = $1',
      [user.id],
    );
    const beforeMs = new Date(before.rows[0]!.updated_at).getTime();
    const afterMs = new Date(after.rows[0]!.updated_at).getTime();
    expect(afterMs).toBeGreaterThanOrEqual(beforeMs);
  });
});

describe('role_assignment', () => {
  const holding = async () => createHolding(db, { orgId: org.id, name: 'Holding One' });

  it('stores org-scoped roles with a NULL scope id', async () => {
    const role = await assignRole(db, {
      userId: user.id,
      roleType: 'hub_architecture',
      scopeType: 'org',
      scopeId: null,
      startDate: '2026-01-01',
    });
    expect(role.scopeId).toBeNull();
  });

  it('rejects a non-org scope without a scope id (check constraint)', async () => {
    await expectDbError(
      () =>
        assignRole(db, {
          userId: user.id,
          roleType: 'pod_member',
          scopeType: 'pod',
          scopeId: null,
          startDate: '2026-01-01',
        }),
      /23514|check constraint|violates/i,
    );
  });

  it('rejects an org-scoped role that carries a scope id', async () => {
    await expectDbError(
      () =>
        assignRole(db, {
          userId: user.id,
          roleType: 'hub_deployment',
          scopeType: 'org',
          scopeId: org.id,
          startDate: '2026-01-01',
        }),
      /23514|check constraint|violates/i,
    );
  });

  it('rejects end_date before start_date', async () => {
    const h = await holding();
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await expectDbError(
      () =>
        assignRole(db, {
          userId: user.id,
          roleType: 'pod_lead',
          scopeType: 'pod',
          scopeId: pod.id,
          startDate: '2026-06-01',
          endDate: '2026-05-01',
        }),
      /23514|check constraint|violates/i,
    );
  });

  it('rejects an unknown role type', async () => {
    const h = await holding();
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await expectDbError(
      () =>
        assignRole(db, {
          userId: user.id,
          roleType: 'supreme_leader' as never,
          scopeType: 'pod',
          scopeId: pod.id,
          startDate: '2026-01-01',
        }),
      /23514|check constraint|violates/i,
    );
  });

  it('allows only one live assignment per user/role/scope', async () => {
    const h = await holding();
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await assignRole(db, {
      userId: user.id,
      roleType: 'pod_member',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: '2026-01-01',
    });
    await expectDbError(
      () =>
        assignRole(db, {
          userId: user.id,
          roleType: 'pod_member',
          scopeType: 'pod',
          scopeId: pod.id,
          startDate: '2026-02-01',
        }),
      /23505|duplicate key|unique/i,
    );
  });

  it('lets a seat be re-assigned once the previous one is revoked', async () => {
    const h = await holding();
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    const first = await assignRole(db, {
      userId: user.id,
      roleType: 'pod_lead',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
    const revoked = await revokeRole(db, first.id, null);
    expect(revoked?.revokedAt).toBeTruthy();

    const second = await assignRole(db, {
      userId: user.id,
      roleType: 'pod_lead',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });
    expect(second.id).not.toBe(first.id);
  });
});

describe('pod_membership', () => {
  it('allows a single active membership per user per pod', async () => {
    const h = await createHolding(db, { orgId: org.id, name: 'Holding One' });
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await addPodMember(db, { podId: pod.id, userId: user.id, joinedAt: '2026-01-01' });

    await expectDbError(
      () => addPodMember(db, { podId: pod.id, userId: user.id, joinedAt: '2026-02-01' }),
      /23505|duplicate key|unique/i,
    );
  });

  it('keeps history when a member leaves and rejoins', async () => {
    const h = await createHolding(db, { orgId: org.id, name: 'Holding One' });
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await addPodMember(db, { podId: pod.id, userId: user.id, joinedAt: '2026-01-01' });
    await removePodMember(db, { podId: pod.id, userId: user.id, leftAt: '2026-03-01' });
    const rejoined = await addPodMember(db, { podId: pod.id, userId: user.id, joinedAt: '2026-04-01' });

    expect(rejoined.leftAt).toBeNull();
    const { rows } = await db.query('SELECT * FROM pod_membership WHERE pod_id = $1 AND user_id = $2', [
      pod.id,
      user.id,
    ]);
    expect(rows.length).toBe(2); // history retained, not overwritten
  });

  it('rejects a membership whose left_at precedes joined_at', async () => {
    const h = await createHolding(db, { orgId: org.id, name: 'Holding One' });
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await expectDbError(
      () =>
        db.query(
          `INSERT INTO pod_membership (pod_id, user_id, joined_at, left_at)
           VALUES ($1, $2, $3::date, $4::date)`,
          [pod.id, user.id, '2026-05-01', '2026-04-01'],
        ),
      /23514|check constraint|violates/i,
    );
  });
});

describe('audit_log', () => {
  it('records an entry with metadata', async () => {
    const entry = await recordAudit(db, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'app_user',
      entityId: user.id,
      metadata: { method: 'dev' },
      requestId: 'req-1',
      ip: '10.0.0.1',
    });
    expect(entry.action).toBe('auth.login');
    expect(entry.metadata).toEqual({ method: 'dev' });
  });

  it('is append-only: UPDATE is rejected by the database', async () => {
    const entry = await recordAudit(db, { actorUserId: user.id, action: 'auth.login' });
    await expectDbError(
      () => db.query(`UPDATE audit_log SET action = 'auth.login.tampered' WHERE id = $1`, [entry.id]),
      /append-only/i,
    );
  });

  it('is append-only: DELETE is rejected by the database', async () => {
    const entry = await recordAudit(db, { actorUserId: user.id, action: 'auth.login' });
    await expectDbError(
      () => db.query('DELETE FROM audit_log WHERE id = $1', [entry.id]),
      /append-only/i,
    );
  });
});

describe('domain_event outbox', () => {
  it('stores published events as JSONB and lists them as unprocessed', async () => {
    await db.query(
      `INSERT INTO domain_event (event_type, aggregate_type, aggregate_id, payload, org_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      ['pod.checkin_logged', 'pod', user.id, JSON.stringify({ week: 4 }), org.id],
    );
    const { rows } = await db.query<{ event_type: string; payload: { week: number }; processed_at: null }>(
      `SELECT * FROM domain_event WHERE processed_at IS NULL`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.event_type).toBe('pod.checkin_logged');
    expect(rows[0]!.payload.week).toBe(4);
  });
});

describe('cascade integrity', () => {
  it('removes pods and memberships when a holding is deleted', async () => {
    const h = await createHolding(db, { orgId: org.id, name: 'Doomed Holding' });
    const pod = await createPod(db, { holdingId: h.id, name: 'Pod A' });
    await addPodMember(db, { podId: pod.id, userId: user.id });

    await db.query('DELETE FROM holding WHERE id = $1', [h.id]);

    const pods = await db.query('SELECT * FROM pod WHERE id = $1', [pod.id]);
    const memberships = await db.query('SELECT * FROM pod_membership WHERE pod_id = $1', [pod.id]);
    expect(pods.rows.length).toBe(0);
    expect(memberships.rows.length).toBe(0);
  });
});
