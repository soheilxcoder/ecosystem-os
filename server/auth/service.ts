/**
 * Authentication service.
 *
 * Two providers, one contract:
 *   - `dev`  — pick a seeded user by email. Exists so the platform is usable
 *              locally and in tests without an identity provider; it refuses to
 *              run in production unless explicitly overridden.
 *   - `oidc` — the real thing (Auth0/Keycloak/…), authorization-code flow.
 *
 * Neither path auto-provisions users: a person who can authenticate with the
 * IdP but has no record in this platform has no roles here, and a user with no
 * roles can do nothing. Onboarding is the Deployment Hub's job (Module 09).
 */

import type { Database } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { Principal, User } from '../../core/types';
import type { Env } from '../config';
import { recordAudit } from '../../db/repositories/audit';
import { findUserByAuthSubject, findUserByEmail, linkAuthSubject } from '../../db/repositories/users';
import { createSessionToken, principalFromClaims, verifySessionToken } from './session';
import { createOidcClient, type OidcClient, type OidcUserInfo } from './oidc';

export type AuthErrorCode =
  | 'dev_login_disabled'
  | 'oidc_not_configured'
  | 'oidc_failed'
  | 'user_not_found'
  | 'user_inactive'
  | 'invalid_credentials';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly statusCode = 401,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: User;
  principal: Principal;
}

export interface AuthServiceOptions {
  db: Database;
  bus: EventBus;
  env: Env;
  /** Injectable for tests: a fake IdP or a pre-built client. */
  oidcClient?: OidcClient;
  clock?: () => Date;
}

export class AuthService {
  private readonly db: Database;
  private readonly bus: EventBus;
  private readonly env: Env;
  private readonly clock: () => Date;
  private oidcClient: OidcClient | undefined;

  constructor(options: AuthServiceOptions) {
    this.db = options.db;
    this.bus = options.bus;
    this.env = options.env;
    this.clock = options.clock ?? (() => new Date());
    this.oidcClient = options.oidcClient;
  }

  get mode(): 'dev' | 'oidc' {
    return this.env.AUTH_MODE;
  }

  private getOidcClient(): OidcClient {
    if (this.oidcClient) return this.oidcClient;
    if (!this.env.OIDC_ISSUER || !this.env.OIDC_CLIENT_ID || !this.env.OIDC_CLIENT_SECRET) {
      throw new AuthError(
        'oidc_not_configured',
        'OIDC is not configured: OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required',
        500,
      );
    }
    this.oidcClient = createOidcClient({
      issuer: this.env.OIDC_ISSUER,
      clientId: this.env.OIDC_CLIENT_ID,
      clientSecret: this.env.OIDC_CLIENT_SECRET,
      redirectUri: this.env.OIDC_REDIRECT_URI,
      scopes: this.env.OIDC_SCOPES,
    });
    return this.oidcClient;
  }

  /** URL to redirect the browser to, to start the OIDC flow. */
  async authorizationUrl(state: string): Promise<string> {
    return this.getOidcClient().authorizationUrl({ state });
  }

  /** Complete the OIDC flow: exchange the code, resolve the local user, sign in. */
  async loginWithOidcCode(code: string, context: RequestContext = {}): Promise<LoginResult> {
    let userInfo: OidcUserInfo;
    try {
      const { accessToken } = await this.getOidcClient().exchangeCode(code);
      userInfo = await this.getOidcClient().userInfo(accessToken);
    } catch (error) {
      throw new AuthError('oidc_failed', 'Could not complete the identity provider sign-in', 401, error);
    }

    let user = await findUserByAuthSubject(this.db, userInfo.sub);
    if (!user && userInfo.email) {
      // First federated login for a pre-onboarded user: link the subject.
      const byEmail = await findUserByEmail(this.db, userInfo.email);
      if (byEmail && !byEmail.authSubject) {
        user = await linkAuthSubject(this.db, byEmail.id, userInfo.sub);
      }
    }
    if (!user) {
      throw new AuthError(
        'user_not_found',
        'Your identity provider account is not onboarded in this platform yet — contact the Deployment Hub',
        403,
      );
    }

    return this.issueSession(user, { ...context, method: 'oidc' });
  }

  /** Local development sign-in by email. Disabled in production by default. */
  async loginWithEmail(email: string, context: RequestContext = {}): Promise<LoginResult> {
    const production = this.env.NODE_ENV === 'production';
    if (this.env.AUTH_MODE !== 'dev') {
      throw new AuthError(
        'dev_login_disabled',
        'Email sign-in is not enabled; set AUTH_MODE=dev for local development',
        403,
      );
    }
    if (production && !this.env.ALLOW_DEV_LOGIN_IN_PRODUCTION) {
      throw new AuthError(
        'dev_login_disabled',
        'Email sign-in is disabled in production',
        403,
      );
    }

    const user = await findUserByEmail(this.db, email);
    if (!user) {
      throw new AuthError('user_not_found', 'No user with that email in this platform', 404);
    }
    if (user.status !== 'active') {
      throw new AuthError('user_inactive', `This account is ${user.status}`, 403);
    }

    return this.issueSession(user, { ...context, method: 'dev' });
  }

  /** Verify a session token and confirm the user still exists and is active. */
  async resolvePrincipal(token: string): Promise<Principal | null> {
    const claims = await verifySessionToken(token, this.env.SESSION_SECRET!);
    if (!claims) return null;

    const { findUserById } = await import('../../db/repositories/users');
    const user = await findUserById(this.db, claims.sub);
    if (!user || user.status !== 'active') return null;

    return principalFromClaims({
      sub: user.id,
      email: user.email,
      name: user.fullName,
      org: user.orgId,
    });
  }

  private async issueSession(
    user: User,
    context: RequestContext & { method: 'dev' | 'oidc' },
  ): Promise<LoginResult> {
    const now = this.clock();
    const ttlSeconds = this.env.SESSION_TTL_HOURS * 3600;
    const token = await createSessionToken(
      { sub: user.id, email: user.email, name: user.fullName, org: user.orgId },
      this.env.SESSION_SECRET!,
      { ttlSeconds, now: Math.floor(now.getTime() / 1000) },
    );

    // Every sign-in is an auditable, event-emitting fact from day one.
    await recordAudit(this.db, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'app_user',
      entityId: user.id,
      metadata: { method: context.method },
      requestId: context.requestId ?? null,
      ip: context.ip ?? null,
    });
    await this.bus.publish({
      type: 'auth.login',
      aggregateType: 'app_user',
      aggregateId: user.id,
      orgId: user.orgId,
      actorUserId: user.id,
      payload: { method: context.method },
    });

    const principal = principalFromClaims({
      sub: user.id,
      email: user.email,
      name: user.fullName,
      org: user.orgId,
    });

    return {
      token,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      user,
      principal,
    };
  }
}

export interface RequestContext {
  requestId?: string;
  ip?: string;
}
