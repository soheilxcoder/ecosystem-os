'use client';

/**
 * Sign-in screen.
 *
 * Copy follows 12-DESIGN-SYSTEM.md §3: it states what to do, never apologises,
 * and names the exact outcome. In dev mode it lists the seeded personas so every
 * role in the permission model can be exercised without an identity provider.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInWithEmail, startOidcAction, type AuthActionState } from '../actions/auth';

export interface LoginFormProps {
  mode: 'dev' | 'oidc';
  demoUsers: Array<{
    id: string;
    email: string;
    fullName: string;
    roleSummary: string;
    podNames: string[];
  }>;
}

export function LoginForm({ mode, demoUsers }: LoginFormProps) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(signInWithEmail, {});
  const [email, setEmail] = useState('');

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-2xl text-ink-950">Sign in to Ecosystem OS</h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === 'dev'
          ? 'Local development sign-in. Pick a seeded persona or enter an email.'
          : 'You will be redirected to your organisation’s identity provider.'}
      </p>

      {mode === 'oidc' ? (
        <form action={startOidcAction} className="mt-6">
          <SubmitButton label="Continue with single sign-on" />
        </form>
      ) : (
        <>
          <form action={formAction} className="mt-6">
            <label htmlFor="email" className="block text-sm text-ink-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-line-300 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-slate-300"
              placeholder="you@example.org"
            />
            {state.error ? (
              <p role="alert" className="mt-2 text-sm text-status-alert">
                {state.error}
              </p>
            ) : null}
            <div className="mt-4">
              <SubmitButton label="Sign in" />
            </div>
          </form>

          {demoUsers.length > 0 ? (
            <div className="mt-8 border-t border-line-200 pt-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Seeded personas</p>
              <ul className="mt-2 space-y-1">
                {demoUsers.map((user) => (
                  <li key={user.id}>
                    <form action={formAction}>
                      <input type="hidden" name="email" value={user.email} />
                      <button
                        type="submit"
                        className="flex w-full items-start justify-between gap-3 rounded border border-line-200 bg-white px-3 py-2 text-left hover:border-signal-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink-950">
                            {user.fullName}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {user.roleSummary}
                            {user.podNames.length > 0 ? ` · ${user.podNames.join(', ')}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-signal-600">Sign in</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-signal-600 px-3 py-2 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-60"
    >
      {pending ? 'Working…' : label}
    </button>
  );
}
