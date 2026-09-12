/**
 * `/api/me` — everything the application shell needs to render.
 *
 * The sidebar, the org switcher and every rotation badge read from this one
 * payload. Roles are returned with their countdown already computed so a badge
 * can never be rendered without one (README: "Rotation, not permanence").
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import type { RoleAssignment } from '../../core/types';
import type { ISODate } from '../../core/time';
import { computeRotation, rotationLabel } from '../../core/rotation';
import { getActiveRoleAssignments, hasHubRole } from '../../core/permissions';
import { findUserById, listHoldings } from '../../db/repositories/users';
import { listRolesForUser } from '../../db/repositories/roles';
import { listPodsForUser } from '../../db/repositories/pods';
import { guard } from '../middleware/auth';

export interface SerializedRole {
  id: string;
  roleType: RoleAssignment['roleType'];
  scopeType: RoleAssignment['scopeType'];
  scopeId: string | null;
  startDate: string;
  endDate: string | null;
  rotation: {
    state: ReturnType<typeof computeRotation>['state'];
    daysRemaining: number | null;
    progress: number | null;
    label: string;
  };
}

export function serializeRole(role: RoleAssignment, today: ISODate): SerializedRole {
  const rotation = computeRotation(role.startDate, role.endDate, today);
  return {
    id: role.id,
    roleType: role.roleType,
    scopeType: role.scopeType,
    scopeId: role.scopeId,
    startDate: role.startDate,
    endDate: role.endDate,
    rotation: {
      state: rotation.state,
      daysRemaining: rotation.daysRemaining,
      progress: rotation.progress,
      label: rotationLabel(rotation),
    },
  };
}

export function registerMeRoutes(
  app: FastifyInstance,
  deps: { db: Database; today: () => ISODate },
): void {
  app.get('/api/me', async (request, reply) => {
    const principal = await request.auth.principal();
    if (!principal) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'A valid session is required',
      });
    }

    const allowed = await guard(request, reply, 'notification.read_own', { orgId: principal.orgId });
    if (!allowed) return reply;

    const today = deps.today();
    const [user, holdings, allRoles, pods] = await Promise.all([
      findUserById(deps.db, principal.id),
      listHoldings(deps.db, principal.orgId),
      listRolesForUser(deps.db, principal.id),
      listPodsForUser(deps.db, principal.id),
    ]);

    const activeRoles = getActiveRoleAssignments(allRoles, today);

    return reply.send({
      data: {
        user: user
          ? {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              avatarUrl: user.avatarUrl,
              status: user.status,
            }
          : null,
        org: { id: principal.orgId },
        holdings,
        pods,
        roles: activeRoles.map((role) => serializeRole(role, today)),
        isHubUser: hasHubRole(activeRoles),
        today,
      },
    });
  });

  /** Rotation history for a seat (the "View Rotation History" affordance). */
  app.get('/api/me/roles', async (request, reply) => {
    const principal = await request.auth.principal();
    if (!principal) {
      return reply.code(401).send({ error: 'unauthorized', message: 'A valid session is required' });
    }
    const roles = await listRolesForUser(deps.db, principal.id);
    const today = deps.today();
    return reply.send({
      data: {
        active: getActiveRoleAssignments(roles, today).map((role) => serializeRole(role, today)),
        history: roles
          .filter((role) => !getActiveRoleAssignments([role], today).length)
          .map((role) => serializeRole(role, today)),
      },
    });
  });
}
