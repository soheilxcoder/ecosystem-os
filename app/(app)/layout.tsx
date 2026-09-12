/**
 * Authenticated area.
 *
 * Every page under this layout is wrapped in the application shell. The session
 * is verified here as well as in `middleware.ts` — the middleware is only a
 * redirect shortcut, never the security boundary.
 */

import { redirect } from 'next/navigation';
import { AppShell } from '../../components/layout/AppShell';
import { apiRequestOrNull } from '../../lib/api';
import { getSession, getSessionToken } from '../../lib/session';
import type { ApiMe } from '../../lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  return (
    <AppShell me={me} apiUnavailable={me === null}>
      {children}
    </AppShell>
  );
}
