/**
 * Live login — the real seeded accounts from the embedded database, fetched
 * from /api/auth/demo-users. Choosing a seat performs a real /api/auth/login.
 */
import { useEffect, useState } from 'react';
import { useEngine, useSession } from '../store';
import { resetDatabase } from '../engine';
import { useI18n } from '../../demo/src/i18n';
import { LangToggle } from '../ui';

interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  roleSummary: string;
  podNames: string[];
}

function roleSummaryFa(summary: string): string {
  const map: Record<string, string> = {
    'pod lead': 'سرپرست پاد',
    'pod member': 'عضو پاد',
    coach: 'کوچ',
    'hub architecture': 'هاب معماری',
    'hub deployment': 'هاب استقرار',
    'hub coaching': 'هاب کوچینگ',
    'hub strategic': 'هاب تعاملات راهبردی',
    investor: 'سرمایه‌گذار',
    'holding executive': 'مدیر هلدینگ',
  };
  return summary
    .split(', ')
    .map((part) => map[part.toLowerCase()] ?? part)
    .join('، ');
}

const POD_FA: Record<string, string> = {
  'Pod Atlas': 'پاد اطلس',
  'Pod Basalt': 'پاد بازالت',
  'Pod Cinder': 'پاد سیندر',
  'Pod Dune': 'پاد دون',
  'Pod Ember': 'پاد امبر',
};

export function LoginScreen() {
  const { engine, error } = useEngine();
  const { login, me, restoring } = useSession();
  const { t, lang } = useI18n();
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      const res = await engine.request({ method: 'GET', url: '/api/auth/demo-users' });
      if (!cancelled && res.status === 200) {
        setUsers((res.json() as { data: DemoUser[] }).data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine]);

  // Signed in but /api/me still pending → brief splash instead of a flash.
  if (restoring && me === null) return null;

  const doLogin = async (email: string) => {
    setBusyEmail(email);
    setFailure(null);
    const result = await login(email);
    if (!result.ok) {
      setFailure(result.message ?? 'login failed');
      setBusyEmail(null);
    }
  };

  return (
    <div className="demo-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="brand-mark">E</div>
          <LangToggle />
        </div>

        <div className="panel p-6">
          <h1 className="font-display text-2xl text-ink-950">{t('live.loginTitle')}</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">{t('live.loginSub')}</p>
          <span className="live-badge mt-3">{t('live.badge')}</span>

          {error && (
            <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink-900">
              {t('live.bootError')}: {error}
            </div>
          )}

          {users === null && !error && (
            <div className="mt-6 flex items-center gap-3 text-sm text-slate-500">
              <span className="boot-spinner" aria-hidden />
              {t('live.loading')}
            </div>
          )}

          {users && (
            <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {users.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    disabled={busyEmail !== null}
                    onClick={() => void doLogin(user.email)}
                    className="persona-row group flex w-full items-start gap-3 rounded-lg border border-line-200 bg-white px-3 py-2.5 text-start hover:border-signal-600/60 hover:bg-signal-50/50 disabled:opacity-60"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal-600/10 text-sm font-semibold text-signal-700"
                    >
                      {user.fullName.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-950">
                        {user.fullName}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {lang === 'fa' ? roleSummaryFa(user.roleSummary) : user.roleSummary}
                      </span>
                      {user.podNames.length > 0 && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {user.podNames.map((p) => (lang === 'fa' ? POD_FA[p] ?? p : p)).join('، ')}
                        </span>
                      )}
                    </span>
                    <span className="ms-auto self-center text-xs text-slate-400 group-hover:text-signal-600">
                      {busyEmail === user.email ? '…' : t('live.signIn')} ←
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {failure && (
            <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink-900">
              {failure}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{t('live.resetDbHint')}</p>
          <button
            type="button"
            onClick={() => void resetDatabase()}
            className="shrink-0 rounded-md border border-line-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-status-critical/50 hover:text-status-critical"
          >
            {t('live.resetDb')}
          </button>
        </div>
      </div>
    </div>
  );
}
