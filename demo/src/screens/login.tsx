/**
 * Sign-in screen — mirrors the real `/login`: name the platform, then a seat.
 * In the showcase, choosing a persona is the sign-in. The language switch
 * lives here too: one click flips the whole showcase to فارسی (RTL).
 */
import { ORG_NAME, PERSONAS, type Persona } from '../data';
import { useI18n } from '../i18n';

export function LoginScreen({ onSignIn }: { onSignIn: (persona: Persona) => void }) {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="rounded border border-line-300 bg-white px-3 py-1 text-sm text-ink-700 shadow-sm transition-colors hover:border-signal-600 hover:text-signal-600"
              aria-label={t('shell.language')}
            >
              {t('login.faButton')}
            </button>
          </div>
          <h1 className="font-display text-3xl text-ink-950">Ecosystem OS</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('login.tagline', { org: t('org.x') })}
          </p>
        </div>

        <div className="nav-card rounded bg-surface-white p-6">
          <h2 className="text-sm font-medium text-ink-950">{t('login.signIn')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('login.pickSeat')}</p>

          <label className="mt-4 block text-xs text-slate-500" htmlFor="email">
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.org"
            className="mt-1 w-full rounded border border-line-300 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-slate-300"
          />

          <ul className="mt-5 divide-y divide-line-200 border border-line-200">
            {PERSONAS.map((persona) => (
              <li key={persona.id}>
                <button
                  type="button"
                  onClick={() => onSignIn(persona)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors hover:bg-paper-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{persona.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {t(persona.roleKey)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-signal-600">{t('login.enter')}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-2xs text-slate-500">{t('login.footer')}</p>
        </div>
      </div>
    </div>
  );
}
