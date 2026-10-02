/**
 * Static showcase shell — the real Sidebar, BottomTabBar and design tokens
 * from the production app, driven by a hash router and sample data.
 */
import { useState, type ReactNode } from 'react';
import { usePathname } from './shims/navigation';
import { Sidebar } from '../../components/layout/Sidebar';
import { BottomTabBar } from '../../components/layout/BottomTabBar';
import { HOLDINGS, ORG_NAME, PERSONAS, type Persona } from './data';
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

  if (!persona) {
    return <LoginScreen personas={PERSONAS} onSignIn={setPersona} />;
  }

  const screen = route(pathname, persona);

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar
        userName={persona.fullName}
        userEmail={persona.email}
        orgName={ORG_NAME}
        holdings={HOLDINGS}
        activeHoldingId={HOLDINGS[0]!.id}
        isHubUser={persona.isHubUser}
        notificationCount={persona.notificationCount}
        urgentCount={persona.urgentCount}
        signOutAction={() => setPersona(null)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="note"
          className="border-b border-status-watch/40 bg-status-watch/10 px-6 py-1.5 text-xs text-ink-700"
        >
          Static showcase with sample data — the live platform runs on Node.js with a real database.
        </div>

        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line-200 bg-white px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-950">Ecosystem OS</p>
            <p className="tabular text-xs text-slate-500">Cycle 3 · Day 62 of 90 · Execution phase</p>
          </div>
          <span className="hidden text-sm text-slate-500 md:block">{persona.roleLabel}</span>
        </header>

        <main className="flex-1 px-6 py-6 pb-24 md:pb-8">{screen}</main>
      </div>

      <BottomTabBar isHubUser={persona.isHubUser} notificationCount={persona.notificationCount} />
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
