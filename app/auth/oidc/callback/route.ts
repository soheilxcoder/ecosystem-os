/**
 * OIDC callback (web side).
 *
 * The identity provider redirects here with `?code&state`. We verify `state`
 * against the cookie set when the flow started, exchange the code through the
 * API (server-side, so the client secret never leaves this process), then drop
 * the platform session cookie ourselves.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiRequest } from '../../../../lib/api';
import { setSessionCookie } from '../../../../lib/session';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('eco_oidc_state')?.value;

  const loginUrl = new URL('/login', request.url);

  if (!code || !state || !expectedState || state !== expectedState) {
    loginUrl.searchParams.set('error', 'oidc_state_mismatch');
    return NextResponse.redirect(loginUrl);
  }

  try {
    const result = await apiRequest<{ token: string; expiresAt: string }>(
      '/api/auth/oidc/callback',
      { method: 'POST', body: { code } },
    );
    const maxAge = Math.max(
      60,
      Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000),
    );
    await setSessionCookie(result.token, maxAge);
  } catch {
    loginUrl.searchParams.set('error', 'oidc_failed');
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('eco_oidc_state');
    return response;
  }

  const store = await cookies();
  store.delete('eco_oidc_state');

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
