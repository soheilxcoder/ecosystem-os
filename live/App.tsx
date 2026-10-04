/**
 * Live edition shell: boot gate → login gate → routed screens.
 * Every screen renders data straight from the in-browser API.
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { I18nProvider, useI18n } from '../demo/src/i18n';
import { getHashPath, subscribeHash } from '../demo/src/router';
import { SidebarI18n, BottomTabBarI18n } from '../demo/src/components/layout';
import { resetDatabase } from './engine';
import { EngineProvider, SessionProvider, useApi, useEngine, useSession } from './store';
import { LoginScreen } from './screens/login';
import { DashboardScreen } from './screens/dashboard';
import { PodsScreen, PodDetailScreen } from './screens/pods';
import { BudgetScreen } from './screens/budget';
import { CalendarScreen } from './screens/calendar';
import { HubScreen } from './screens/hub';
import { AgreementsScreen } from './screens/agreements';
import { ReviewScreen } from './screens/review';
import { CoachingScreen } from './screens/coaching';
import { NotificationsScreen } from './screens/notifications';
import { InvestorScreen } from './screens/investor';
import { ArchiveScreen } from './screens/archive';

export function App() {
  return (
    <EngineProvider>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </EngineProvider>
  );
}

// ------------------------------------------------------------- boot gate --

const BOOT_STAGES = ['database', 'migrations', 'seed', 'api', 'ready'] as const;

function BootScreen() {
  const { stage, error } = useEngine();
  const { t } = useI18n();
  const stageKeys: Record<string, 'live.stageDatabase' | 'live.stageMigrations' | 'live.stageSeed' | 'live.stageApi'> = {
    database: 'live.stageDatabase',
    migrations: 'live.stageMigrations',
    seed: 'live.stageSeed',
    api: 'live.stageApi',
  };
  const currentIndex = BOOT_STAGES.indexOf(stage as (typeof BOOT_STAGES)[number]);

  return (
    <div className="demo-bg min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="panel p-6">
          <div className="brand-mark mb-4">E</div>
          <h1 className="font-display text-xl text-ink-950">{t('live.bootTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('live.bootSub')}</p>
          <div className="mt-5">
            {BOOT_STAGES.slice(0, 4).map((step, i) => {
              const state = error ? (i <= currentIndex ? 'active' : '') : i < currentIndex ? 'done' : i === currentIndex ? 'active' : '';
              return (
                <div key={step} className={`boot-step ${state}`}>
                  {i < currentIndex && !error ? (
                    <span aria-hidden>✓</span>
                  ) : i === currentIndex && !error ? (
                    <span className="boot-spinner" aria-hidden />
                  ) : (
                    <span className="inline-block w-3.5" aria-hidden />
                  )}
                  {t(stageKeys[step]!)}
                </div>
              );
            })}
          </div>
          {error && (
            <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink-900">
              {t('live.bootError')}: <span className="font-mono text-xs">{error}</span>
            </div>
          )}
          <p className="mt-5 text-xs text-slate-400">{t('live.firstLoad')}</p>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen() {
  const { error } = useEngine();
  const { t } = useI18n();
  return (
    <div className="demo-bg flex min-h-screen items-center justify-center px-6">
      <div className="panel max-w-md p-6">
        <h1 className="font-display text-xl text-ink-950">{t('live.bootError')}</h1>
        <p className="mt-2 break-words font-mono text-xs text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => void resetDatabase()}
          className="mt-4 rounded-md bg-signal-600 px-4 py-2 text-sm font-medium text-white hover:bg-signal-700"
        >
          {t('live.resetDb')}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ gate --

function Gate() {
  const { engine, error } = useEngine();
  const { me, restoring } = useSession();

  if (error) return <ErrorScreen />;
  if (!engine) return <BootScreen />;
  if (restoring || !me) return <LoginScreen />;
  return <Shell />;
}

// ----------------------------------------------------------------- shell --

function Shell() {
  const { me, logout } = useSession();
  const api = useApi();
  const { t, lang } = useI18n();
  const [pathname, setPathname] = useState(() => getHashPath());
  const [counts, setCounts] = useState<{ unread: number; urgent: number }>({ unread: 0, urgent: 0 });

  useEffect(() => subscribeHash(() => setPathname(getHashPath())), []);

  useEffect(() => {
    api
      .get<{ unread: number; urgent: number }>('/api/notifications/counts')
      .then(setCounts)
      .catch(() => undefined);
  }, [api, pathname]);

  if (!me) return null;

  const screen = route(pathname);

  return (
    <div className="demo-bg min-h-screen text-ink-950">
      <div className="flex min-h-screen">
        <SidebarI18n
          userName={me.user?.fullName ?? ''}
          userEmail={me.user?.email ?? ''}
          orgName={t('org.x')}
          holdings={me.holdings}
          activeHoldingId={me.holdings[0]?.id ?? null}
          isHubUser={me.isHubUser}
          notificationCount={counts.unread}
          urgentCount={counts.urgent}
          signOutAction={() => void logout()}
          holdingLabel={(holding) => (lang === 'fa' ? holdingLabelFa(holding.name) : holding.name)}
        />
        <div className="min-w-0 flex-1 pb-20 md:pb-8">
          <header className="mx-auto max-w-6xl px-4 pt-4">
            <span className="live-badge">{t('live.badge')}</span>
          </header>
          <main key={pathname} className="screen-enter mx-auto max-w-6xl px-4 py-5">
            {screen}
          </main>
        </div>
      </div>
      <BottomTabBarI18n isHubUser={me.isHubUser} notificationCount={counts.unread} />
    </div>
  );
}

function holdingLabelFa(name: string): string {
  if (name === 'Holding Pars') return 'هلدینگ پارس';
  if (name === 'Holding Dena') return 'هلدینگ دنا';
  return name;
}

function route(pathname: string): ReactNode {
  if (pathname.startsWith('/pod/')) {
    return <PodDetailScreen podId={pathname.split('/')[2] ?? ''} />;
  }
  if (pathname.startsWith('/pod')) return <PodsScreen />;
  if (pathname.startsWith('/agreements')) return <AgreementsScreen />;
  if (pathname.startsWith('/budget')) return <BudgetScreen />;
  if (pathname.startsWith('/calendar')) return <CalendarScreen />;
  if (pathname.startsWith('/coaching')) return <CoachingScreen />;
  if (pathname.startsWith('/review')) return <ReviewScreen />;
  if (pathname.startsWith('/archive')) return <ArchiveScreen />;
  if (pathname.startsWith('/notifications')) return <NotificationsScreen />;
  if (pathname.startsWith('/hub')) return <HubScreen />;
  if (pathname.startsWith('/investor')) return <InvestorScreen />;
  return <DashboardScreen />;
}

// Re-exported so main.tsx keeps a single import tree.
export { I18nProvider };
