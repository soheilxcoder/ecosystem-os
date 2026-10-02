/**
 * Coaching — three audiences, one module. Fully bilingual.
 */
import { IconArrowRight } from '../../../components/ui/icons';
import { PODS } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

const ENTRIES: { titleKey: StringKey; descKey: StringKey; ctaKey: StringKey }[] = [
  { titleKey: 'coaching.myCoach', descKey: 'coaching.myCoachDesc', ctaKey: 'coaching.myCoachCta' },
  { titleKey: 'coaching.console', descKey: 'coaching.consoleDesc', ctaKey: 'coaching.consoleCta' },
  { titleKey: 'coaching.roster', descKey: 'coaching.rosterDesc', ctaKey: 'coaching.rosterCta' },
];

export function CoachingScreen() {
  const { t } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('coaching.h1')}</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">{t('coaching.sub')}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <div
            key={entry.titleKey}
            className="group flex flex-col rounded border border-line-200 bg-surface-white p-4 transition-colors hover:border-signal-600"
          >
            <h2 className="font-display text-base text-ink-950">{t(entry.titleKey)}</h2>
            <p className="mt-2 flex-1 text-xs text-slate-500">{t(entry.descKey)}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-600">
              {t(entry.ctaKey)}
              <IconArrowRight size={16} className="rtl:-scale-x-100" />
            </span>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">{t('coaching.coachedPods')}</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {PODS.map((pod) => (
            <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{names.podName(pod.id)}</span>
                <span className="block text-xs text-slate-500">
                  {names.holdingByName(pod.holdingName)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                    pod.signal.level === 'green'
                      ? 'bg-status-good/10 text-status-good'
                      : pod.signal.level === 'amber'
                        ? 'bg-status-watch/10 text-status-watch'
                        : 'bg-status-alert/10 text-status-alert'
                  }`}
                >
                  {pod.signal.level}
                </span>
                <span className="text-xs text-slate-500">
                  {t('coaching.coach', { name: pod.coachName })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
