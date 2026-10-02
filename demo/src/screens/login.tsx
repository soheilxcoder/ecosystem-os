/**
 * Sign-in screen — mirrors the real `/login`: name the platform, then a seat.
 * In the showcase, choosing a persona is the sign-in. The language switch
 * lives here too: one click flips the whole showcase to فارسی (RTL).
 */
import { PERSONAS, type Persona } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

export function LoginScreen({ onSignIn }: { onSignIn: (persona: Persona) => void }) {
  const { t, lang, setLang } = useI18n();
  const names = useNames();

  return (
    <div className="demo-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="rounded-full border border-line-300 bg-white px-4 py-1.5 text-sm font-medium text-ink-700 shadow-sm hover:border-signal-600 hover:text-signal-600"
              aria-label={t('shell.language')}
            >
              {t('login.faButton')}
            </button>
          </div>

          <div className="brand-mark mx-auto mb-4 h-14 w-14 text-2xl font-bold">E</div>
          <h1 className="font-display text-3xl text-ink-950">Ecosystem OS</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            {t('login.tagline', { org: t('org.x') })}
          </p>
        </div>

        <div className="nav-card rounded-xl bg-surface-white p-6 shadow-[0_24px_60px_-30px_rgba(18,22,28,0.35)]">
          <h2 className="text-sm font-medium text-ink-950">{t('login.signIn')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('login.pickSeat')}</p>

          <label className="mt-4 block text-xs text-slate-500" htmlFor="email">
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.org"
            className="mt-1 w-full rounded-md border border-line-300 bg-white px-3 py-2 text-sm text-ink-950 shadow-sm outline-none transition focus:border-signal-600 focus:ring-2 focus:ring-signal-600/20 placeholder:text-slate-300"
          />

          <ul className="mt-5 space-y-1.5">
            {PERSONAS.map((persona) => (
              <li key={persona.id}>
                <button
                  type="button"
                  onClick={() => onSignIn(persona)}
                  className="persona-row group flex w-full items-center gap-3 rounded-lg border border-line-200 bg-white px-3 py-2.5 text-start hover:border-signal-600/60 hover:bg-signal-50/50"
                >
                  <span
                    aria-hidden
                    className="brand-mark h-8 w-8 shrink-0 rounded-full text-xs"
                  >
                    {persona.fullName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-950">
                      {names.personName(persona.fullName)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {t(persona.roleKey)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-signal-600 opacity-70 transition group-hover:opacity-100">
                    {t('login.enter')}
                  </span>
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
