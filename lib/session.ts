/**
 * Web session handling.
 *
 * The browser holds a single httpOnly cookie issued by this app; the API's
 * token lives inside it and is attached to server-side calls only. Roles are
 * never cached in the cookie — they are re-read on every request so an expired
 * or revoked seat stops working immediately.
 */

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { resolveSessionSecret } from '../core/constants';

export const SESSION_COOKIE = 'eco_session';

export interface WebSession {
  sub: string;
  email: string;
  name: string;
  org: string;
}

/**
 * The same resolved secret the API signs with (`core/constants`), so a freshly
 * cloned checkout works without a `.env` file in development and still refuses
 * to start in production without a real one.
 */
function secret(): Uint8Array {
  return new TextEncoder().encode(resolveSessionSecret());
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSession(): Promise<WebSession | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: 'ecosystem-os',
      audience: 'ecosystem-os-api',
      algorithms: ['HS256'],
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

/** Only for server actions — Next forbids setting cookies during render. */
export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
