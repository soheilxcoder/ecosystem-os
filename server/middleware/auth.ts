/**
 * Request-level authentication and authorization.
 *
 * Implements the middleware pattern from 13-TECHNICAL-ARCHITECTURE.md §4:
 *
 *   authorize(user, action, resource):
 *     activeRoles = getActiveRoleAssignments(user, today())
 *     requiredRoles = PERMISSION_MATRIX[action]
 *     return any(activeRoles match requiredRoles AND scope matches resource.scope)
 *
 * The expensive part (loading role assignments) is lazy and cached per request,
 * so public routes stay cheap while a handler that needs three permission
 * checks still hits the database once.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../../db/client';
import type { Principal, RoleAssignment, UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import { todayISO } from '../../core/time';
import { authorize, type Action, type AuthzResult, type ResourceRef } from '../../core/permissions';
import { listRolesForUser } from '../../db/repositories/roles';
import { getPod } from '../../db/repositories/pods';
import type { AuthService } from '../auth/service';
import { forbidden, unauthorized } from '../errors';

export interface RequestAuth {
  /** The authenticated principal, or null for anonymous requests. */
  principal(): Promise<Principal | null>;
  /** Throws 401 when there is no valid session. */
  requirePrincipal(): Promise<Principal>;
  /** All role assignments of the principal (active and historical), cached. */
  roles(): Promise<RoleAssignment[]>;
  /** Authorization decision for one action; never throws. */
  can(action: Action, resource?: ResourceRef, onDate?: ISODate): Promise<AuthzResult>;
  /** Authorization decision that throws (and audits) when denied. */
  authorizeOrFail(action: Action, resource?: ResourceRef): Promise<AuthzResult>;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth;
  }
}

export interface AuthMiddlewareDeps {
  db: Database;
  authService: AuthService;
  /** Injected clock so tests can pin "today". */
  today?: () => ISODate;
  onDenied?: (info: {
    request: FastifyRequest;
    action: Action;
    result: AuthzResult;
  }) => void | Promise<void>;
}

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, '').trim() || null;
  }
  // Cookie fallback for direct browser calls to the API (same-origin only).
  const cookieName = 'eco_token';
  const cookie = request.cookies?.[cookieName];
  return cookie ? decodeURIComponent(cookie) : null;
}

export function registerAuthMiddleware(app: FastifyInstance, deps: AuthMiddlewareDeps): void {
  const { db, authService } = deps;
  const today = deps.today ?? (() => todayISO());

  // `null` is replaced on every request by the onRequest hook below.
  app.decorateRequest('auth', null as unknown as RequestAuth);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    let principal: Principal | null | undefined;
    let roles: RoleAssignment[] | null = null;

    const getPrincipal = async (): Promise<Principal | null> => {
      if (principal === undefined) {
        const token = extractBearerToken(request);
        principal = token ? await authService.resolvePrincipal(token) : null;
      }
      return principal;
    };

    const getRoles = async (): Promise<RoleAssignment[]> => {
      const current = await getPrincipal();
      if (!current) return [];
      if (roles === null) {
        roles = await listRolesForUser(db, current.id);
      }
      return roles;
    };

    const auth: RequestAuth = {
      principal: getPrincipal,

      async requirePrincipal() {
        const current = await getPrincipal();
        if (!current) {
          throw unauthorized();
        }
        return current;
      },

      roles: getRoles,

      async can(action, resource = {}, onDate) {
        const current = await getPrincipal();
        if (!current) {
          return { allowed: false, action, reason: 'no_active_role', matchedRoles: [] };
        }
        return authorize(current, await getRoles(), action, resource, { onDate: onDate ?? today() });
      },

      async authorizeOrFail(action, resource = {}) {
        const result = await auth.can(action, resource);
        if (!result.allowed) {
          await deps.onDenied?.({ request, action, result });
          throw forbidden(`Not allowed to perform "${action}" (${result.reason})`, result.reason);
        }
        return result;
      },
    };

    request.auth = auth;
  });
}

/**
 * Resolve a pod-scoped resource into the fields the permission layer needs.
 * A handler must never hand-build this: the holding and org ids are what stop a
 * holding executive (or a hub role from another org) from reaching across.
 */
export async function resolvePodResource(
  db: Database,
  podId: UUID,
): Promise<ResourceRef & { podId: UUID }> {
  const pod = await getPod(db, podId);
  if (!pod) return { podId };
  return { podId, holdingId: pod.holdingId, orgId: pod.orgId };
}

/** Convenience guard for route handlers: 401/403 with a consistent body. */
export async function guard(
  request: FastifyRequest,
  reply: FastifyReply,
  action: Action,
  resource: ResourceRef = {},
): Promise<AuthzResult | null> {
  const result = await request.auth.can(action, resource);
  if (!result.allowed) {
    const status = result.reason === 'no_active_role' ? 401 : 403;
    await reply.code(status).send({
      error: status === 401 ? 'unauthorized' : 'forbidden',
      message:
        status === 401
          ? 'A valid session is required'
          : `Not allowed to perform "${action}" (${result.reason})`,
      action,
      reason: result.reason,
    });
    return null;
  }
  return result;
}
