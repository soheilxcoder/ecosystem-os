/**
 * Sign-in screen — mirrors the real `/login`: name the platform, then a seat.
 * In the showcase, choosing a persona is the sign-in.
 */
import { ORG_NAME, type Persona } from '../data';

export function LoginScreen({
  personas,
  onSignIn,
}: {
  personas: Persona[];
  onSignIn: (persona: Persona) => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl text-ink-950">Ecosystem OS</h1>
          <p className="mt-2 text-sm text-slate-500">
            The operating platform of {ORG_NAME} — pods govern themselves; hubs coordinate.
          </p>
        </div>

        <div className="nav-card rounded bg-surface-white p-6">
          <h2 className="text-sm font-medium text-ink-950">Sign in</h2>
          <p className="mt-1 text-xs text-slate-500">
            Static showcase — pick a seat to explore the platform the way that role sees it.
          </p>

          <label className="mt-4 block text-xs text-slate-500" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.org"
            className="mt-1 w-full rounded border border-line-300 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-slate-300"
          />

          <ul className="mt-5 divide-y divide-line-200 border border-line-200">
            {personas.map((persona) => (
              <li key={persona.id}>
                <button
                  type="button"
                  onClick={() => onSignIn(persona)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-paper-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{persona.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">{persona.roleLabel}</span>
                  </span>
                  <span className="shrink-0 text-xs text-signal-600">Enter →</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-2xs text-slate-500">
            In the live product, sessions are issued by the platform API and every seat is a
            time-boxed role assignment — never a permanent property of a profile.
          </p>
        </div>
      </div>
    </div>
  );
}
