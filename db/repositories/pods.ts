/** Pod + membership data access (Module 03). */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { Pod, PodMembership, PodStatus, UUID, User } from '../../core/types';
import type { ISODate } from '../../core/time';
import { toPod, toPodMembership, toUser } from './rows';

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
