/**
 * Archive — the organisation's memory: module landing plus a sample decisions
 * index. Fully bilingual.
 */
import { IconArchive, IconSearch } from '../../../components/ui/icons';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ARCHIVE_ENTRIES } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

const ENTRIES: { titleKey: StringKey; descKey: StringKey; ctaKey: StringKey }[] = [
  { titleKey: 'archive.decisions', descKey: 'archive.decisionsDesc', ctaKey: 'archive.decisionsCta' },
  { titleKey: 'archive.lessons', descKey: 'archive.lessonsDesc', ctaKey: 'archive.lessonsCta' },
  { titleKey: 'archive.activity', descKey: 'archive.activityDesc', ctaKey: 'archive.activityCta' },
];

export function ArchiveScreen() {
  const { t, date } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-signal-600">
          <IconArchive size={24} />
          <p className="text-2xs font-medium uppercase tracking-wide">{t('archive.kicker')}</p>
        </div>
        <h1 className="mt-1 font-display text-2xl text-ink-950">{t('archive.h1')}</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">{t('archive.sub')}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {ENTRIES.map((entry) => (
          <div
            key={entry.titleKey}
            className="group flex flex-col panel panel-hover p-4 transition-colors hover:border-signal-600"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-ink-950">{t(entry.titleKey)}</h2>
              <IconSearch size={16} className="text-slate-500" />
            </div>
            <p className="mt-2 flex-1 text-xs text-slate-500">{t(entry.descKey)}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-600">
              {t(entry.ctaKey)}
            </span>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-700">{t('archive.index')}</h2>
          <div className="flex items-center gap-2 panel px-3 py-1.5 text-xs text-slate-500">
            <IconSearch size={16} />
            <span>{t('archive.filter')}</span>
          </div>
        </div>
        <ul className="mt-3 panel divide-y divide-line-200 overflow-hidden">
          {ARCHIVE_ENTRIES.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block text-sm text-ink-950">
                  {t(`archiveEntry.${entry.id}.title` as StringKey)}
                </span>
                <span className="block text-xs text-slate-500">
                  {t(`archiveEntry.${entry.id}.summary` as StringKey)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip
                  tone="neutral"
                  label={t(`archive.type.${entry.entityType}` as StringKey)}
                />
                <span className="tabular text-2xs text-slate-500">
                  {date(entry.occurredAt)} · {names.actor(entry.actor)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
