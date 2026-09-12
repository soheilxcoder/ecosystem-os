/**
 * Session tokens.
 *
 * The platform never stores passwords: identity lives in the OIDC provider
 * (13-TECHNICAL-ARCHITECTURE.md §1) and the app issues its own short-lived,
 * signed session token afterwards. Roles are deliberately *not* embedded in the
 * token — they are re-read from `role_assignment` on every request, because a
 * role can expire or be revoked mid-session and the platform's entire promise is
 * that an expired seat stops working immediately.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { Principal } from '../../core/types';

export interface SessionClaims {
  /** User id (JWT `sub`). */
  sub: string;
  email: string;
  name: string;
  org: string;
}

const ISSUER = 'ecosystem-os';
const AUDIENCE = 'ecosystem-os-api';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface CreateSessionOptions {
  ttlSeconds: number;
  /** Injectable clock (tests) — epoch seconds. */
  now?: number;
}

export async function createSessionToken(
  claims: SessionClaims,
  secret: string,
  options: CreateSessionOptions,
): Promise<string> {
  const issuedAt = options.now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ email: claims.email, name: claims.name, org: claims.org })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + options.ttlSeconds)
    .sign(key(secret));
}

/** Returns null for any invalid token (expired, tampered, wrong secret/issuer). */
export async function verifySessionToken(
  token: string,
  secret: string,
  options: { now?: number } = {},
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: options.now ? new Date(options.now * 1000) : undefined,
    });

    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string') return null;

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      org: payload.org,
    };
  } catch {
    return null;
  }
}

export function principalFromClaims(claims: SessionClaims): Principal {
  return {
    id: claims.sub,
    orgId: claims.org,
    email: claims.email,
    fullName: claims.name,
  };
}
