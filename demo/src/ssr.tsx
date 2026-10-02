/**
 * Smoke-test entry: renders the whole showcase tree to a string in Node, so a
 * build error or a render-time exception in any screen fails loudly. We render
 * the login shell (one persona per role family) AND every screen component
 * directly, so every module's render path is exercised.
 */
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { PERSONAS, PODS } from './data';
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

const HUB = PERSONAS.find((p) => p.isHubUser)!;

export function render(): string {
  const parts: string[] = [];

  // The sign-in gate (no persona chosen yet).
  parts.push(renderToString(<App />));

  // The login gate, then the full shell for a pod seat and a hub seat.
  parts.push(renderToString(<App />));
  for (const persona of [PERSONAS[0]!, HUB]) {
    parts.push(renderToString(<App initialPersona={persona} />));
  }

  // Every screen on its own.
  parts.push(renderToString(<DashboardScreen persona={PERSONAS[0]!} />));
  for (const pod of PODS) parts.push(renderToString(<PodScreen podId={pod.id} />));
  parts.push(renderToString(<AgreementsScreen />));
  parts.push(renderToString(<BudgetScreen />));
  parts.push(renderToString(<BreakdownScreen />));
  parts.push(renderToString(<CalendarScreen />));
  parts.push(renderToString(<CoachingScreen />));
  parts.push(renderToString(<ReviewScreen />));
  parts.push(renderToString(<ArchiveScreen />));
  parts.push(renderToString(<NotificationsScreen />));
  parts.push(renderToString(<HubScreen persona={HUB} />));
  parts.push(renderToString(<InvestorScreen />));

  return parts.join('\n<!-- screen -->\n');
}
