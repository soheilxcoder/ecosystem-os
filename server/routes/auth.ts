/** Authentication endpoints. */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthError, type AuthService } from '../auth/service';
import { recordAudit } from '../../db/repositories/audit';
import type { Database } from '../../db/client';
import { todayISO } from '../../core/time';

const LoginBody = z.object({ email: z.string().email() });
const OidcCallbackBody = z.object({ code: z.string().min(1) });

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { authService: AuthService; db: Database },
): void {
  /** Which sign-in methods this environment offers (the login page reads this). */
  app.get('/api/auth/providers', async () => {
    const mode = deps.authService.mode;
    return {
      data: {
        mode,
        dev: mode === 'dev',
        oidc: mode === 'oidc' ? { issuer: process.env.OIDC_ISSUER ?? null } : null,
      },
    };
  });

  /**
   * Who you can sign in as, locally. Dev mode only: this is a directory of
   * real seeded personas (pod member, pod lead, coach, hub staff…) so every
   * permission path can be exercised without an identity provider.
   */
  app.get('/api/auth/demo-users', async (request, reply) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (deps.authService.mode !== 'dev' || isProduction) {
      return reply.code(403).send({
        error: 'dev_login_disabled',
        message: 'The demo user directory is only available in development',
      });
    }
    const { listUsersWithRoleSummary } = await import('../../db/repositories/users');
    const rows = await listUsersWithRoleSummary(deps.db, todayISO());
    return reply.send({
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        roleSummary: row.role_summary.replace(/_/g, ' '),
        podNames: row.pod_names ? row.pod_names.split(', ').filter(Boolean) : [],
      })),
    });
  });

  /** Local development sign-in. Disabled outside dev unless explicitly allowed. */
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'A valid email is required',
        issues: parsed.error.issues,
      });
    }

    const result = await deps.authService.loginWithEmail(parsed.data.email, {
      requestId: request.id,
      ip: request.ip,
    });

    // Also set the cookie so a browser hitting the API directly stays signed in.
    reply.setCookie('eco_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 3600,
    });

    return reply.send({
      data: {
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user,
      },
    });
  });

  /**
   * Step 1 of the OIDC flow. Returns the URL plus the `state` value so the web
   * app can hold `state` in its own cookie and verify it on the callback —
   * the CSRF defence for the whole flow.
   */
  app.get('/api/auth/oidc/start', async () => {
    const state = `st_${crypto.randomUUID()}`;
    const url = await deps.authService.authorizationUrl(state);
    return { data: { url, state } };
  });

  /** Step 1 (redirect variant) for callers that talk to the API directly. */
  app.get('/api/auth/oidc/authorize', async (request, reply) => {
    const state = `st_${crypto.randomUUID()}`;
    reply.setCookie('eco_oidc_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
    });
    const url = await deps.authService.authorizationUrl(state);
    return reply.redirect(url, 302);
  });

  /** Step 2: exchange the code and issue a platform session. */
  app.post('/api/auth/oidc/callback', async (request, reply) => {
    const parsed = OidcCallbackBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'A `code` is required',
        issues: parsed.error.issues,
      });
    }
    const result = await deps.authService.loginWithOidcCode(parsed.data.code, {
      requestId: request.id,
      ip: request.ip,
    });
    return reply.send({
      data: { token: result.token, expiresAt: result.expiresAt, user: result.user },
    });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const principal = await request.auth.principal();
    if (principal) {
      await recordAudit(deps.db, {
        actorUserId: principal.id,
        action: 'auth.logout',
        entityType: 'app_user',
        entityId: principal.id,
        metadata: {},
        requestId: request.id,
        ip: request.ip,
      });
    }
    reply.clearCookie('eco_token', { path: '/' });
    return reply.send({ data: { status: 'signed_out' } });
  });
}

/** Maps domain auth failures onto HTTP responses with a stable error code. */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
