/**
 * Static showcase shell — the production Sidebar, BottomTabBar and design
 * tokens driven by a hash router, sample data and a bilingual (EN/فارسی)
 * i18n layer with full RTL support.
 */
import { useState, type ReactNode } from 'react';
import { usePathname } from './shims/navigation';
import { SidebarI18n } from './components/layout';
import { BottomTabBarI18n } from './components/layout';
import { HOLDINGS, PERSONAS, type Persona } from './data';
import { useI18n } from './i18n';
import { useNames } from './i18n/names';
import { LoginScreen } from './screens/login';
import { DashboardScreen } from './screens/dashboard';
import { PodScreen } from './screens/pod';
import { AgreementsScreen } from './screens/agreements';
import { BudgetScreen } from './screens/budget';
import { BreakdownScreen } from './screens/breakdown';
import { CalendarScreen } from './screens/calendar';
import { CoachingScreen } from './screens/coaching';
import { ReviewScreen } from './screens/review';
import { ArchiveScreen } from './screens/archive';
import { NotificationsScreen } from './screens/notifications';
import { HubScreen } from './screens/hub';
import { InvestorScreen } from './screens/investor';

export function App({ initialPersona = null }: { initialPersona?: Persona | null } = {}) {
  const [persona, setPersona] = useState<Persona | null>(initialPersona);
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();
  const names = useNames();

  if (!persona) {
    return <LoginScreen onSignIn={setPersona} />;
  }

  const screen = route(pathname, persona);

  return (
    <div className="demo-bg flex min-h-screen">
      <SidebarI18n
        userName={names.personName(persona.fullName)}
        userEmail={persona.email}
        orgName={t('org.x')}
        holdings={HOLDINGS}
        activeHoldingId={HOLDINGS[0]!.id}
        isHubUser={persona.isHubUser}
        notificationCount={persona.notificationCount}
        urgentCount={persona.urgentCount}
        signOutAction={() => setPersona(null)}
        holdingLabel={(holding) =>
          holding.id === 'holding-pars' ? t('holding.holding-pars') : t('holding.holding-dena')
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="note"
          className="border-b border-status-watch/40 bg-status-watch/10 px-6 py-1.5 text-xs text-ink-700"
        >
          {t('shell.banner')}
        </div>

        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line-200 bg-white px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-950">Ecosystem OS</p>
            <p className="tabular text-xs text-slate-500">{t('shell.cycleStatus')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 md:block">{t(persona.roleKey)}</span>
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
              className="rounded border border-line-300 bg-white px-2.5 py-1 text-xs text-ink-700 transition-colors hover:border-signal-600 hover:text-signal-600"
            >
              {t('login.faButton')}
            </button>
          </div>
        </header>

        <main
          key={`${pathname}:${lang}`}
          className="screen-enter flex-1 px-6 py-6 pb-24 md:pb-8"
        >
          {screen}
        </main>
      </div>

      <BottomTabBarI18n isHubUser={persona.isHubUser} notificationCount={persona.notificationCount} />
    </div>
  );
}

function route(pathname: string, persona: Persona): ReactNode {
  if (pathname === '/dashboard') return <DashboardScreen persona={persona} />;
  if (pathname.startsWith('/pod/')) return <PodScreen podId={pathname.split('/')[2] ?? 'pod-atlas'} />;
  if (pathname === '/pod') return <PodScreen podId="pod-atlas" />;
  if (pathname.startsWith('/agreements')) return <AgreementsScreen />;
  if (pathname.startsWith('/budget/breakdown')) return <BreakdownScreen />;
  if (pathname.startsWith('/budget')) return <BudgetScreen />;
  if (pathname.startsWith('/calendar')) return <CalendarScreen />;
  if (pathname.startsWith('/coaching')) return <CoachingScreen />;
  if (pathname.startsWith('/review')) return <ReviewScreen />;
  if (pathname.startsWith('/archive')) return <ArchiveScreen />;
  if (pathname.startsWith('/notifications')) return <NotificationsScreen />;
  if (pathname.startsWith('/hub')) return <HubScreen persona={persona} />;
  if (pathname.startsWith('/investor')) return <InvestorScreen />;
  return <DashboardScreen persona={persona} />;
}
