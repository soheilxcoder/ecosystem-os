/**
 * Investor view — the Strategic Hub's published report. Fully bilingual.
 */
import Link from '../shims/link';
import { StatusChip } from '../../../components/ui/StatusChip';
import { DataCardI18n } from '../components/primitives';
import { HOLDINGS, PODS, TOTAL_POOL } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

export function InvestorScreen() {
  const { t, num, money } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('investor.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('investor.sub')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DataCardI18n
          label={t('investor.pool')}
          value={money(TOTAL_POOL)}
          tone="active"
          hint={t('investor.poolHint')}
        />
        <DataCardI18n
          label={t('investor.podsPars')}
          value={num(PODS.filter((p) => p.holdingName === 'Holding Pars').length)}
          tone="neutral"
          hint={t('investor.podsParsHint')}
        />
        <DataCardI18n
          label={t('investor.avgScore')}
          value={num(70.9, 1)}
          tone="good"
          hint={t('investor.avgScoreHint')}
        />
        <DataCardI18n
          label={t('investor.daysLeft')}
          value={num(28)}
          tone="neutral"
          hint={t('investor.daysLeftHint')}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">{t('investor.holdings')}</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {HOLDINGS.map((holding) => {
            const pods = PODS.filter((p) =>
              holding.id === 'holding-pars' ? p.holdingName === 'Holding Pars' : p.holdingName === 'Holding Dena',
            );
            return (
              <li key={holding.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">
                    {names.holdingById(holding.id)} ({holding.code})
                  </span>
                  <span className="block text-xs text-slate-500">
                    {t('investor.holdingMeta', {
                      n: num(pods.length),
                      amount: money(pods.reduce((sum, pod) => sum + pod.finalBudget, 0)),
                    })}
                  </span>
                </span>
                <StatusChip tone="good" label={t('investor.current')} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">{t('investor.reports')}</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          <li className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink-950">{t('investor.q3')}</span>
              <span className="block text-xs text-slate-500">{t('investor.q3Meta')}</span>
            </span>
            <StatusChip tone="good" label={t('investor.published')} />
          </li>
          <li className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink-950">{t('investor.q4')}</span>
              <span className="block text-xs text-slate-500">{t('investor.q4Meta')}</span>
            </span>
            <StatusChip tone="watch" label={t('investor.draft')} />
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          {t('investor.footer1')}{' '}
          <Link href="/budget" className="text-signal-600 underline">
            {t('budget.h1')}
          </Link>
          {t('investor.footer2')}
        </p>
      </section>
    </div>
  );
}
