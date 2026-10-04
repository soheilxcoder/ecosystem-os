/**
 * Smoke-test entry: renders the whole showcase tree to a string in Node for
 * BOTH languages, so a build error or a render-time exception in any screen
 * (English or فارسی) fails loudly.
 */
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { I18nProvider } from './i18n';
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
import type { Lang } from './i18n';

const HUB = PERSONAS.find((p) => p.isHubUser)!;
const DEPLOY = PERSONAS.find((p) => p.roleType === 'hub_deployment')!;

function inLang(lang: Lang, element: React.ReactElement): string {
  return renderToString(<I18nProvider initialLang={lang}>{element}</I18nProvider>);
}

export function render(): string {
  const parts: string[] = [];

  for (const lang of ['en', 'fa'] as Lang[]) {
    // Login gate + full shells.
    parts.push(inLang(lang, <App />));
    parts.push(inLang(lang, <App initialPersona={PERSONAS[0]!} />));
    parts.push(inLang(lang, <App initialPersona={HUB} />));

    // Every screen on its own.
    parts.push(inLang(lang, <DashboardScreen persona={PERSONAS[0]!} />));
    for (const pod of PODS) parts.push(inLang(lang, <PodScreen podId={pod.id} />));
    parts.push(inLang(lang, <AgreementsScreen />));
    parts.push(inLang(lang, <AgreementsScreen initialView="graph" />));
    parts.push(inLang(lang, <BudgetScreen />));
    parts.push(inLang(lang, <BreakdownScreen />));
    parts.push(inLang(lang, <CalendarScreen />));
    parts.push(inLang(lang, <CoachingScreen />));
    parts.push(inLang(lang, <ReviewScreen />));
    parts.push(inLang(lang, <ArchiveScreen />));
    parts.push(inLang(lang, <NotificationsScreen />));
    parts.push(inLang(lang, <HubScreen persona={HUB} />));
    parts.push(inLang(lang, <HubScreen persona={DEPLOY} />));
    parts.push(inLang(lang, <InvestorScreen />));
  }

  return parts.join('\n<!-- screen -->\n');
}
