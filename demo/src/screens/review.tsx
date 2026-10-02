/**
 * Peer review & governance — three separate processes. Fully bilingual.
 */
import Link from '../shims/link';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PODS } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

const QUEUE = [
  { id: 'r1', podId: 'pod-dune', titleKey: 'review.queue.dune', stageKey: 'review.stageDraft', due: '2026-09-24' },
  { id: 'r2', podId: 'pod-ember', titleKey: 'review.queue.ember', stageKey: 'review.stageSubmitted', due: '2026-09-24' },
] as const;

export function ReviewScreen() {
  const { t, num, date } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('review.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('review.sub')}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="panel panel-hover panel-accent p-4">
          <h2 className="text-sm font-medium text-ink-950">{t('review.peerH2')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('review.peerAssigned', { n: num(2) })}</p>
          <p role="status" className="mt-2 text-sm text-status-watch">{t('review.windowClosed')}</p>
        </section>

        <section className="panel panel-hover panel-accent p-4">
          <h2 className="text-sm font-medium text-ink-950">{t('review.conflictH2')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('review.conflictAssigned', { n: num(1) })}</p>
          <ul className="mt-3 space-y-2">
            <li className="flex items-center justify-between gap-2 border border-line-200 px-2 py-1.5">
              <span className="min-w-0 truncate text-xs text-ink-950">
                AC-004 · {names.podName('pod-atlas')}
              </span>
              <StatusChip tone="alert" label={t('review.caseStage')} />
            </li>
            <li className="text-xs text-slate-500">{t('review.case.summary')}</li>
          </ul>
        </section>

        <section className="panel panel-hover panel-accent p-4">
          <h2 className="text-sm font-medium text-ink-950">{t('review.govH2')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('review.govText')}</p>
          <p className="mt-2 text-xs text-slate-500">{t('review.cinderTrial')}</p>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">{t('review.queue')}</h2>
        <ul className="panel divide-y divide-line-200 overflow-hidden">
          {QUEUE.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">
                  {names.podName(item.podId)} — {t(item.titleKey)}
                </span>
                <span className="block text-xs text-slate-500">
                  {t('review.due', { stage: t(item.stageKey), date: date(item.due) })}
                </span>
              </span>
              <span className="shrink-0 text-xs text-signal-600 underline">{t('review.openReview')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">{t('review.tracks')}</h2>
        <ul className="panel divide-y divide-line-200 overflow-hidden">
          {PODS.map((pod) => (
            <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{names.podName(pod.id)}</span>
                <span className="block text-xs text-slate-500">
                  {names.holdingByName(pod.holdingName)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusChip
                  tone={pod.status === 'active' ? 'good' : 'active'}
                  label={pod.status === 'active' ? t('pod.activePod') : t('pod.entryTrial')}
                />
                <Link href={`/pod/${pod.id}`} className="text-xs text-signal-600 underline">
                  {t('review.podLink')}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
