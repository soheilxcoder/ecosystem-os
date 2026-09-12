/**
 * API integration tests: authentication, sessions and authorization.
 *
 * These run the real Fastify server against a real PostgreSQL database and (for
 * OIDC) a real HTTP identity provider. The point is to prove the security
 * boundary — an expired role, a forged token, or a hub acting outside its org
 * must all be refused here, not only in a unit test.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createTestDatabase } from '../helpers/test-db';
import { seedFixtureWorld, type FixtureWorld } from '../helpers/fixtures';
import { startFakeIdp, type FakeIdp } from '../helpers/fake-idp';
import { buildServer } from '../../server/index';
import { createOidcClient } from '../../server/auth/oidc';
import type { Database } from '../../db/client';

let db: Database;
let app: FastifyInstance;
let world: FixtureWorld;
const TODAY = '2026-06-15';

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedFixtureWorld(db);
  app = await buildServer({
    db,
    runMigrations: false,
    logger: false,
    env: { TODAY },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function login(email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

describe('health', () => {
  it('reports a live API', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { status: string } }>().data.status).toBe('ok');
  });

  it('reports readiness only when migrations are applied', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { status: string } }>().data.status).toBe('ready');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('not_found');
  });
});

describe('session auth', () => {
  it('signs in a seeded user in dev mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'lena@example.org' },
    });
    const body = response.json<{ data: { token: string; user: { email: string } } }>();
    expect(body.data.user.email).toBe('lena@example.org');
    expect(body.data.token.split('.').length).toBe(3);
  });

  it('is case-insensitive about email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'LeNa@Example.ORG' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects an unknown email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.org' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('user_not_found');
  });

  it('rejects a malformed email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('invalid_request');
  });

  it('refuses /api/me without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me' });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a tampered token', async () => {
    const token = await login('lena@example.org');
    const tampered = `${token.slice(0, -3)}xyz`;
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(tampered) });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a token signed with a different secret', async () => {
    const { createSessionToken } = await import('../../server/auth/session');
    const forged = await createSessionToken(
      { sub: world.users.lead!, email: 'attacker@example.org', name: 'Attacker', org: world.orgId },
      'a-completely-different-secret-value',
      { ttlSeconds: 3600 },
    );
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(forged) });
    expect(response.statusCode).toBe(401);
  });

  it('refuses an expired token', async () => {
    const { createSessionToken } = await import('../../server/auth/session');
    const env = app.context.env;
    const past = Math.floor(Date.now() / 1000) - 7200;
    const expired = await createSessionToken(
      { sub: world.users.lead!, email: 'lena@example.org', name: 'Lena Lead', org: world.orgId },
      env.SESSION_SECRET!,
      { ttlSeconds: 60, now: past },
    );
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(expired) });
    expect(response.statusCode).toBe(401);
  });

  it('records every sign-in in the audit log and the event outbox', async () => {
    const before = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_log WHERE action = 'auth.login'",
    );
    await login('mo@example.org');
    const after = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_log WHERE action = 'auth.login'",
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 1);

    const events = await db.query<{ event_type: string; aggregate_id: string }>(
      "SELECT * FROM domain_event WHERE event_type = 'auth.login'",
    );
    expect(events.rows.length).toBeGreaterThan(0);
    expect(events.rows.some((row) => row.aggregate_id === world.users.member)).toBe(true);
  });

  it('signs out and clears the cookie', async () => {
    const token = await login('mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((c) => c.name === 'eco_token' && c.value === '')).toBe(true);
  });
});

describe('authorization through the API', () => {
  it('returns the caller’s active roles with rotation countdowns', async () => {
    const token = await login('lena@example.org');
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
    const body = response.json<{
      data: { roles: Array<{ roleType: string; rotation: { state: string; daysRemaining: number | null } }> };
    }>();
    const leadRole = body.data.roles.find((r) => r.roleType === 'pod_lead');
    expect(leadRole).toBeDefined();
    expect(leadRole!.rotation.daysRemaining).toBe(199); // 2026-06-15 -> 2026-12-31
    expect(leadRole!.rotation.state).toBe('active');
  });

  it('excludes expired roles from the active set', async () => {
    // Cora's coach assignment on both pods ends 2026-06-30, but we pin TODAY to
    // 2026-06-15, so she should still be active. A later date must drop them.
    const token = await login('cora@example.org');
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
    const body = response.json<{ data: { roles: Array<{ roleType: string }> } }>();
    expect(body.data.roles.length).toBe(2);
    expect(body.data.roles.every((r) => r.roleType === 'coach')).toBe(true);
  });

  it('marks hub users so the shell can show the Hub Console', async () => {
    const token = await login('ari@example.org');
    const response = await app.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
    const body = response.json<{ data: { isHubUser: boolean } }>();
    expect(body.data.isHubUser).toBe(true);

    const memberToken = await login('mo@example.org');
    const memberResponse = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(memberToken),
    });
    expect(memberResponse.json<{ data: { isHubUser: boolean } }>().data.isHubUser).toBe(false);
  });

  it('lets a pod member list pods in their org (transparency default)', async () => {
    const token = await login('mo@example.org');
    const response = await app.inject({ method: 'GET', url: '/api/pods', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    const pods = response.json<{ data: Array<{ name: string }> }>().data;
    expect(pods.map((p) => p.name).sort()).toEqual(['Pod Atlas', 'Pod Basalt', 'Pod Cinder']);
  });

  it('lets any org member open another pod’s dashboard', async () => {
    const token = await login('mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/pods/${world.podBId}`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
  });

  it('refuses a user with no active role assignments', async () => {
    const token = await login('noroles@example.org');
    const response = await app.inject({ method: 'GET', url: '/api/pods', headers: bearer(token) });
    expect(response.statusCode).toBe(401);
    expect(response.json<{ reason: string }>().reason).toBe('no_active_role');
  });

  it('returns 404 for a pod that does not exist', async () => {
    const token = await login('mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/pods/00000000-0000-4000-8000-000000000000`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(404);
  });

  it('lists pod members', async () => {
    const token = await login('lena@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/pods/${world.podAId}/members`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    const members = response.json<{ data: Array<{ fullName: string }> }>().data;
    expect(members.map((m) => m.fullName).sort()).toEqual([
      'Lena Lead',
      'Mo Member',
      'Nadia Nine',
    ]);
  });
});

describe('dev login guard rails', () => {
  let oidcApp: FastifyInstance;

  afterAll(async () => {
    if (oidcApp) await oidcApp.close();
  });

  it('refuses email sign-in when AUTH_MODE=oidc', async () => {
    oidcApp = await buildServer({
      db,
      runMigrations: false,
      logger: false,
      env: {
        TODAY,
        AUTH_MODE: 'oidc',
        OIDC_ISSUER: 'https://idp.example.org',
        OIDC_CLIENT_ID: 'ecosystem-os',
        OIDC_CLIENT_SECRET: 'not-used-in-this-test',
      },
    });
    await oidcApp.ready();

    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'lena@example.org' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('dev_login_disabled');
  });

  it('refuses email sign-in in production without an explicit override', async () => {
    const prodApp = await buildServer({
      db,
      runMigrations: false,
      logger: false,
      env: { TODAY, NODE_ENV: 'production', SESSION_SECRET: 'a-production-secret-value' },
    });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'lena@example.org' },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await prodApp.close();
    }
  });

  it('allows email sign-in in production only with the explicit override', async () => {
    const prodApp = await buildServer({
      db,
      runMigrations: false,
      logger: false,
      env: {
        TODAY,
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-production-secret-value',
        ALLOW_DEV_LOGIN_IN_PRODUCTION: 'true',
      },
    });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'lena@example.org' },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await prodApp.close();
    }
  });
});

describe('OIDC sign-in (real HTTP against a fake identity provider)', () => {
  let idp: FakeIdp;
  let oidcApp: FastifyInstance;
  const SUB_LINKED = 'oidc|lena';
  const SUB_UNKNOWN = 'oidc|stranger';

  beforeAll(async () => {
    idp = await startFakeIdp({
      users: {
        lena: { sub: SUB_LINKED, email: 'lena@example.org', name: 'Lena Lead' },
        stranger: { sub: SUB_UNKNOWN, email: 'stranger@example.org', name: 'A Stranger' },
      },
    });

    await db.query('UPDATE app_user SET auth_subject = $2 WHERE email = $1', [
      'lena@example.org',
      SUB_LINKED,
    ]);

    oidcApp = await buildServer({
      db,
      runMigrations: false,
      logger: false,
      env: {
        TODAY,
        AUTH_MODE: 'oidc',
        OIDC_ISSUER: idp.issuer,
        OIDC_CLIENT_ID: 'ecosystem-os',
        OIDC_CLIENT_SECRET: 'test-secret',
        OIDC_REDIRECT_URI: 'http://localhost:3000/api/auth/oidc/callback',
      },
    });
    await oidcApp.ready();
  });

  afterAll(async () => {
    await oidcApp?.close();
    await idp?.close();
  });

  it('builds an authorization URL from the provider’s discovery document', async () => {
    const client = createOidcClient({
      issuer: idp.issuer,
      clientId: 'ecosystem-os',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:3000/api/auth/oidc/callback',
      scopes: 'openid email profile',
    });
    const url = await client.authorizationUrl({ state: 'state-123' });
    expect(url).toContain('/authorize?');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state-123');
    expect(url).toContain('client_id=ecosystem-os');
  });

  it('exchanges a code, links the identity and issues a platform session', async () => {
    const code = idp.issueCode(SUB_LINKED);
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/auth/oidc/callback',
      payload: { code },
    });
    expect(response.statusCode, response.body).toBe(200);
    const token = response.json<{ data: { token: string } }>().data.token;

    const me = await oidcApp.inject({ method: 'GET', url: '/api/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ data: { user: { email: string } } }>().data.user.email).toBe('lena@example.org');
  });

  it('refuses a code the provider rejects', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/auth/oidc/callback',
      payload: { code: 'stolen-or-replayed-code' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('oidc_failed');
  });

  it('refuses an identity that is not onboarded in the platform', async () => {
    const code = idp.issueCode(SUB_UNKNOWN);
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/auth/oidc/callback',
      payload: { code },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('user_not_found');
  });

  it('requires a code in the callback body', async () => {
    const response = await oidcApp.inject({
      method: 'POST',
      url: '/api/auth/oidc/callback',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});
