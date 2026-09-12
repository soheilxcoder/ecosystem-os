/**
 * Minimal OpenID Connect client (authorization code flow).
 *
 * 13-TECHNICAL-ARCHITECTURE.md §1: "OAuth2/OIDC via an identity provider
 * (Auth0/Keycloak), with the app maintaining its own role-assignment tables".
 * So this module does exactly one job — prove *who* the user is. What they are
 * allowed to do is always answered by `role_assignment`.
 *
 * Identity is taken from the UserInfo endpoint (universally supported) rather
 * than by verifying the ID token signature, which keeps the implementation
 * small and avoids hand-rolling JWKS verification.
 */

import { z } from 'zod';

const DiscoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url().optional(),
});

const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
});

export const UserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  picture: z.string().url().optional(),
});

export type OidcUserInfo = z.infer<typeof UserInfoSchema>;
export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export class OidcError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'OidcError';
  }
}

export interface OidcClient {
  discover(): Promise<OidcDiscovery>;
  /** URL to send the browser to. `state` is echoed back on the callback. */
  authorizationUrl(params: { state: string; nonce?: string }): Promise<string>;
  exchangeCode(code: string): Promise<{ accessToken: string; userInfoEndpoint?: string }>;
  userInfo(accessToken: string): Promise<OidcUserInfo>;
}

/** Default is injectable so tests can point at a local fake IdP. */
export function createOidcClient(
  config: OidcConfig,
  dependencies: { fetch?: typeof fetch; now?: () => number } = {},
): OidcClient {
  const doFetch = dependencies.fetch ?? fetch;
  const discoveryTtlMs = 10 * 60 * 1000;
  let cached: { at: number; discovery: OidcDiscovery } | null = null;

  async function discover(): Promise<OidcDiscovery> {
    const now = dependencies.now?.() ?? Date.now();
    if (cached && now - cached.at < discoveryTtlMs) return cached.discovery;

    const url = `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    let response: Response;
    try {
      response = await doFetch(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      throw new OidcError(`OIDC discovery request failed for ${url}`, error);
    }
    if (!response.ok) {
      throw new OidcError(
        `OIDC discovery failed: ${response.status} ${response.statusText}`,
        await safeText(response),
      );
    }

    const parsed = DiscoverySchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new OidcError('OIDC discovery document is missing required fields', parsed.error.issues);
    }

    const discovery: OidcDiscovery = {
      issuer: parsed.data.issuer,
      authorizationEndpoint: parsed.data.authorization_endpoint,
      tokenEndpoint: parsed.data.token_endpoint,
      userinfoEndpoint: parsed.data.userinfo_endpoint,
    };
    cached = { at: now, discovery };
    return discovery;
  }

  return {
    discover,

    async authorizationUrl({ state, nonce }) {
      const discovery = await discover();
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes,
        state,
      });
      if (nonce) params.set('nonce', nonce);
      const separator = discovery.authorizationEndpoint.includes('?') ? '&' : '?';
      return `${discovery.authorizationEndpoint}${separator}${params.toString()}`;
    },

    async exchangeCode(code) {
      const discovery = await discover();
      let response: Response;
      try {
        response = await doFetch(discovery.tokenEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
            authorization: basicAuth(config.clientId, config.clientSecret),
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.redirectUri,
          }).toString(),
        });
      } catch (error) {
        throw new OidcError('OIDC token request failed', error);
      }

      if (!response.ok) {
        throw new OidcError(
          `OIDC token exchange failed: ${response.status} ${response.statusText}`,
          await safeText(response),
        );
      }

      const parsed = TokenSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new OidcError('OIDC token response is malformed', parsed.error.issues);
      }

      return { accessToken: parsed.data.access_token, userInfoEndpoint: discovery.userinfoEndpoint };
    },

    async userInfo(accessToken) {
      const discovery = await discover();
      const endpoint = discovery.userinfoEndpoint;
      if (!endpoint) {
        throw new OidcError('OIDC provider does not expose a userinfo endpoint');
      }
      const response = await doFetch(endpoint, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      });
      if (!response.ok) {
        throw new OidcError(
          `OIDC userinfo request failed: ${response.status} ${response.statusText}`,
        );
      }
      const parsed = UserInfoSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new OidcError('OIDC userinfo response is malformed', parsed.error.issues);
      }
      return parsed.data;
    },
  };
}

function basicAuth(user: string, password: string): string {
  const encoded = Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

async function safeText(response: Response): Promise<string | undefined> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return undefined;
  }
}
