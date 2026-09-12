/** User + org + holding data access. */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { Holding, Org, User, UserStatus, UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import { toHolding, toOrg, toUser } from './rows';

export async function getOrg(db: Queryable, orgId: UUID): Promise<Org | null> {
  const row = await queryOne(db, 'SELECT * FROM org WHERE id = $1', [orgId]);
  return row ? toOrg(row) : null;
}

export async function getOrgBySlug(db: Queryable, slug: string): Promise<Org | null> {
  const row = await queryOne(db, 'SELECT * FROM org WHERE slug = $1', [slug]);
  return row ? toOrg(row) : null;
}

export async function listHoldings(db: Queryable, orgId: UUID): Promise<Holding[]> {
  const rows = await queryMany(db, 'SELECT * FROM holding WHERE org_id = $1 ORDER BY name', [orgId]);
  return rows.map(toHolding);
}

export async function createOrg(
  db: Queryable,
  input: { name: string; slug: string },
): Promise<Org> {
  return toOrg(
    await insertOne(db, 'INSERT INTO org (name, slug) VALUES ($1, $2) RETURNING *', [
      input.name,
      input.slug,
    ]),
  );
}

export async function createHolding(
  db: Queryable,
  input: { orgId: UUID; name: string; code?: string | null },
): Promise<Holding> {
  return toHolding(
    await insertOne(
      db,
      'INSERT INTO holding (org_id, name, code) VALUES ($1, $2, $3) RETURNING *',
      [input.orgId, input.name, input.code ?? null],
    ),
  );
}

export async function findUserById(db: Queryable, id: UUID): Promise<User | null> {
  const row = await queryOne(db, 'SELECT * FROM app_user WHERE id = $1', [id]);
  return row ? toUser(row) : null;
}

export async function findUserByEmail(db: Queryable, email: string): Promise<User | null> {
  const row = await queryOne(db, 'SELECT * FROM app_user WHERE lower(email) = lower($1)', [email]);
  return row ? toUser(row) : null;
}

export async function findUserByAuthSubject(db: Queryable, subject: string): Promise<User | null> {
  const row = await queryOne(db, 'SELECT * FROM app_user WHERE auth_subject = $1', [subject]);
  return row ? toUser(row) : null;
}

export async function listUsersByOrg(db: Queryable, orgId: UUID): Promise<User[]> {
  const rows = await queryMany(
    db,
    'SELECT * FROM app_user WHERE org_id = $1 ORDER BY full_name',
    [orgId],
  );
  return rows.map(toUser);
}

export interface CreateUserInput {
  orgId: UUID;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  authSubject?: string | null;
  status?: UserStatus;
}

export async function createUser(db: Queryable, input: CreateUserInput): Promise<User> {
  return toUser(
    await insertOne(
      db,
      `INSERT INTO app_user (org_id, email, full_name, avatar_url, auth_subject, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.orgId,
        input.email,
        input.fullName,
        input.avatarUrl ?? null,
        input.authSubject ?? null,
        input.status ?? 'active',
      ],
    ),
  );
}

export interface DemoUserRow {
  id: UUID;
  email: string;
  full_name: string;
  role_summary: string;
  pod_names: string | null;
}

/**
 * Users with a one-line summary of what they can do — powers the local sign-in
 * screen so every persona can be tried without an identity provider.
 */
export async function listUsersWithRoleSummary(
  db: Queryable,
  onDate: ISODate,
): Promise<DemoUserRow[]> {
  return queryMany<DemoUserRow>(
    db,
    `SELECT u.id,
            u.email,
            u.full_name,
            COALESCE(
              (SELECT string_agg(DISTINCT r.role_type, ', ')
                 FROM role_assignment r
                WHERE r.user_id = u.id
                  AND r.revoked_at IS NULL
                  AND r.start_date <= $1::date
                  AND (r.end_date IS NULL OR r.end_date >= $1::date)),
              'no active role') AS role_summary,
            (SELECT string_agg(DISTINCT p.name, ', ')
               FROM pod_membership m
               JOIN pod p ON p.id = m.pod_id
              WHERE m.user_id = u.id AND m.left_at IS NULL) AS pod_names
       FROM app_user u
      WHERE u.status = 'active'
      ORDER BY u.full_name`,
    [onDate],
  );
}

/** Link an existing local user to an OIDC subject (first federated login). */
export async function linkAuthSubject(
  db: Queryable,
  userId: UUID,
  subject: string,
): Promise<User> {
  const row = await queryOne(
    db,
    'UPDATE app_user SET auth_subject = $2 WHERE id = $1 RETURNING *',
    [userId, subject],
  );
  if (!row) throw new Error(`User ${userId} not found`);
  return toUser(row);
}
