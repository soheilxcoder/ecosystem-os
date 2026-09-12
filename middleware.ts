import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { resolveSessionSecret } from './core/constants';
import { SESSION_COOKIE } from './lib/session';

/**
 * Route guard.
 *
 * A cheap signature check at the edge so unauthenticated visitors are redirected
 * before any page renders. It is deliberately *not* the authorisation boundary:
 * roles are still re-read from the database on every API request, because a role
 * can expire or be revoked mid-session.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(resolveSessionSecret()), {
        issuer: 'ecosystem-os',
        audience: 'ecosystem-os-api',
        algorithms: ['HS256'],
      });
      return NextResponse.next();
    } catch {
      // Fall through: an invalid/expired cookie is treated as signed out.
    }
  }

  const { pathname, search } = request.nextUrl;
  // Public routes: the login screen itself and the OIDC callback (which arrives
  // from the identity provider, before any session exists).
  const isPublic = pathname === '/login' || pathname.startsWith('/auth/oidc');
  if (isPublic) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('from', `${pathname}${search}`);
  }
  const response = NextResponse.redirect(loginUrl);
  // Clear an invalid cookie so the user is not stuck in a redirect loop.
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
