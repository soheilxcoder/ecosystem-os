/**
 * Role assignment data access.
 *
 * All reads used by the authorization layer go through `listRolesForUser`, which
 * returns *every* assignment (active, expired and revoked); the decision about
 * what is active today is made by `core/permissions`, never in SQL, so the rule
 * lives in exactly one testable place.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type { RoleAssignment, RoleType, ScopeType, UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import { toRoleAssignment } from './rows';

export async function listRolesForUser(db: Queryable, userId: UUID): Promise<RoleAssignment[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM role_assignment
      WHERE user_id = $1
      ORDER BY role_type, start_date`,
    [userId],
  );
  return rows.map(toRoleAssignment);
}

export async function listActiveRolesForUser(
  db: Queryable,
  userId: UUID,
  onDate: ISODate,
): Promise<RoleAssignment[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM role_assignment
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND start_date <= $2::date
        AND (end_date IS NULL OR end_date >= $2::date)
      ORDER BY role_type, start_date`,
    [userId, onDate],
  );
  return rows.map(toRoleAssignment);
}

export async function listRolesByScope(
  db: Queryable,
  scopeType: ScopeType,
  scopeId: UUID,
): Promise<RoleAssignment[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM role_assignment
      WHERE scope_type = $1 AND scope_id = $2
      ORDER BY role_type, user_id`,
    [scopeType, scopeId],
  );
  return rows.map(toRoleAssignment);
}

export interface AssignRoleInput {
  userId: UUID;
  roleType: RoleType;
  scopeType: ScopeType;
  scopeId: UUID | null;
  startDate: ISODate;
  endDate?: ISODate | null;
  createdBy?: UUID | null;
}

export async function assignRole(db: Queryable, input: AssignRoleInput): Promise<RoleAssignment> {
  return toRoleAssignment(
    await insertOne(
      db,
      `INSERT INTO role_assignment
         (user_id, role_type, scope_type, scope_id, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
       RETURNING *`,
      [
        input.userId,
        input.roleType,
        input.scopeType,
        input.scopeId,
        input.startDate,
        input.endDate ?? null,
        input.createdBy ?? null,
      ],
    ),
  );
}

/**
 * End a role early. The row is never edited in place: `revoked_at` is stamped so
 * the historical fact that the seat was held (and when it ended) survives.
 */
export async function revokeRole(
  db: Queryable,
  roleAssignmentId: UUID,
  revokedBy: UUID | null,
): Promise<RoleAssignment | null> {
  const row = await queryOne(
    db,
    `UPDATE role_assignment
        SET revoked_at = now()
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING *`,
    [roleAssignmentId],
  );
  return row ? toRoleAssignment(row) : null;
}

/** Roles held by a user in a given pod (any pod-scoped role type). */
export async function listPodRolesForUser(
  db: Queryable,
  userId: UUID,
  podId: UUID,
): Promise<RoleAssignment[]> {
  const rows = await queryMany(
    db,
    `SELECT * FROM role_assignment
      WHERE user_id = $1 AND scope_type = 'pod' AND scope_id = $2
      ORDER BY start_date`,
    [userId, podId],
  );
  return rows.map(toRoleAssignment);
}
