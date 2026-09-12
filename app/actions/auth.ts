'use server';

/**
 * Authentication server actions.
 *
 * The browser never sees the API token: the action exchanges credentials with
 * the API server-side and stores the token in an httpOnly cookie on this origin.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, apiRequest } from '../../lib/api';
import { clearSessionCookie, setSessionCookie } from '../../lib/session';

export interface AuthActionState {
  error?: string;
}

export async function signInWithEmail(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    return { error: 'Enter your email to continue.' };
  }

  let result: { token: string; expiresAt: string };
  try {
    result = await apiRequest<{ token: string; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: { email },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Could not reach the platform API.' };
  }

  const maxAge = Math.max(
    60,
    Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000),
  );
  await setSessionCookie(result.token, maxAge);

  // redirect() throws internally; it must not be caught by the try/catch above.
  redirect('/dashboard');
}

/**
 * Start the OIDC flow: take the provider URL and `state` from the API, hold
 * `state` in an httpOnly cookie on this origin, then send the browser to the
 * identity provider. Verifying `state` on the way back is what stops a
 * login-CSRF attack, and it only works if `state` is stored here rather than
 * being trusted from the query string.
 */
export async function startOidcAction(): Promise<void> {
  const { url, state } = await apiRequest<{ url: string; state: string }>('/api/auth/oidc/start');

  const store = await cookies();
  store.set('eco_oidc_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  redirect(url);
}

export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
