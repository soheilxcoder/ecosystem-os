/**
 * Login page — outside the application shell, so it renders even when the API
 * is down (with an honest message rather than a broken layout).
 */

import { LoginForm } from './LoginForm';
import { apiRequestOrNull } from '../../lib/api';
import type { DemoUser } from '../../lib/types';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const providers = await apiRequestOrNull<{ mode: 'dev' | 'oidc'; dev: boolean }>(
    '/api/auth/providers',
  );
  const demoUsers =
    providers?.mode === 'dev'
      ? ((await apiRequestOrNull<DemoUser[]>('/api/auth/demo-users')) ?? [])
      : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-100 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded bg-signal-600 text-sm font-semibold text-white"
            aria-hidden
          >
            E
          </span>
          <span className="font-display text-lg text-ink-950">Ecosystem OS</span>
        </div>

        {providers === null ? (
          <div className="nav-card rounded p-4">
            <h1 className="text-base text-ink-950">The platform API is not reachable</h1>
            <p className="mt-2 text-sm text-slate-500">
              Start it with <code className="text-ink-700">npm run dev:api</code>, then reload this
              page. Sign-in is handled by the API so that identity and roles stay in one place.
            </p>
          </div>
        ) : (
          <LoginForm mode={providers.mode} demoUsers={demoUsers} />
        )}
      </div>
    </main>
  );
}
