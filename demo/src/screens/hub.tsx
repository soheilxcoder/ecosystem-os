/**
 * Hub Console — four hubs, one surface. Fully bilingual.
 */
import { StatusChip } from '../../../components/ui/StatusChip';
import { IconArrowRight } from '../../../components/ui/icons';
import type { Persona } from '../data';
import { useI18n } from '../i18n';

export function HubScreen({ persona }: { persona: Persona }) {
  const { t, num } = useI18n();
  const restricted = !persona.isHubUser;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('hub.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('hub.sub')}</p>
      </header>

      {restricted && (
        <div className="mb-6 rounded border border-status-watch/40 bg-status-watch/10 px-4 py-3 text-sm text-ink-700">
          {t('hub.restricted', { role: t(persona.roleKey) })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.arch')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.archDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label={t('hub.rules', { n: num(42) })} />
            <StatusChip tone="watch" label={t('hub.pending', { n: num(1) })} />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.deploy')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.deployDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="active" label={t('hub.trial')} />
            <StatusChip tone="neutral" label={t('hub.pilots')} />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.coaching')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.coachingDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="good" label={t('hub.coverage')} />
            <StatusChip tone="watch" label={t('hub.rotateSoon')} />
          </div>
        </section>

        <section className="rounded border border-line-200 bg-surface-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.strategic')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.strategicDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label={t('hub.draftReport')} />
            <StatusChip tone="good" label={t('hub.published')} />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded border border-line-200 bg-surface-white p-4">
        <h2 className="text-sm font-medium text-ink-950">{t('hub.notAdmin')}</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('hub.notAdminText')}</p>
      </section>
    </div>
  );
}
