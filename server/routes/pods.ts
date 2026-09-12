/**
 * Pods & Teams (Module 03) — Phase 0 slice.
 *
 * Phase 0 ships only the read surface the shell needs; the pod overview,
 * check-ins, voting and pitch editor arrive in Phase 1. Permissions are already
 * enforced here so that Phase 1 cannot accidentally ship an unguarded route.
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/client';
import { getPod, listPodMembers, listPods } from '../../db/repositories/pods';
import { guard, resolvePodResource } from '../middleware/auth';

export function registerPodRoutes(app: FastifyInstance, deps: { db: Database }): void {
  app.get('/api/pods', async (request, reply) => {
    const principal = await request.auth.requirePrincipal();
    const allowed = await guard(request, reply, 'pod.view', { orgId: principal.orgId });
    if (!allowed) return reply;

    const pods = await listPods(deps.db, principal.orgId);
    return reply.send({ data: pods });
  });

  app.get<{ Params: { podId: string } }>('/api/pods/:podId', async (request, reply) => {
    await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view', resource);
    if (!allowed) return reply;

    const pod = await getPod(deps.db, request.params.podId);
    if (!pod) {
      return reply.code(404).send({ error: 'not_found', message: 'Pod not found' });
    }
    return reply.send({ data: pod });
  });

  app.get<{ Params: { podId: string } }>('/api/pods/:podId/members', async (request, reply) => {
    await request.auth.requirePrincipal();
    const resource = await resolvePodResource(deps.db, request.params.podId);
    const allowed = await guard(request, reply, 'pod.view_members', resource);
    if (!allowed) return reply;

    const members = await listPodMembers(deps.db, request.params.podId);
    return reply.send({ data: members });
  });
}
