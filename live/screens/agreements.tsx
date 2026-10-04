/** Agreements — the real CLOU list and per-seat inbox. */
import { useEffect, useState } from 'react';
import { useApi, useSession } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';
import { podFa } from './dashboard';

interface Agreement {
  id: string;
  name: string;
  serviceDescription: string;
  status: string;
  displayStatus: string;
  podAName: string;
  podBName: string;
  cadence: string;
  frequency: string | null;
  pricingTerms: { amount: string | null; model: string | null };
  awaitingPodId: string | null;
}

const STATUS_TONE: Record<string, 'good' | 'watch' | 'alert' | 'neutral' | 'active'> = {
  active: 'good',
  in_force: 'good',
  proposed: 'watch',
  countered: 'watch',
  declined: 'alert',
  expired: 'neutral',
  draft: 'neutral',
};

const STATUS_FA: Record<string, string> = {
  active: 'فعال',
  in_force: 'لازم‌الاجرا',
  proposed: 'پیشنهادشده',
  countered: 'پیشنهاد متقابل',
  declined: 'ردشده',
  expired: 'منقضی',
  draft: 'پیش‌نویس',
};

export function AgreementsScreen() {
  const api = useApi();
  const { me } = useSession();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Agreement[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Agreement[]>('/api/agreements')
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} />;
  if (!rows) return <Loading />;

  const myPodId = me?.pods[0]?.id ?? null;

  return (
    <div>
      <ScreenHeader title={t('nav.agreements')} sub={t('live.dataFresh')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((agreement) => (
          <section key={agreement.id} className="panel panel-hover p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-medium text-ink-950">{agreement.name}</h2>
              <StatusChip
                tone={STATUS_TONE[agreement.displayStatus] ?? 'neutral'}
                label={lang === 'fa' ? STATUS_FA[agreement.displayStatus] ?? agreement.displayStatus : agreement.displayStatus}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {lang === 'fa' ? podFa(agreement.podAName) : agreement.podAName} ⇄{' '}
              {lang === 'fa' ? podFa(agreement.podBName) : agreement.podBName}
              {' · '}
              {agreement.cadence}
              {agreement.frequency ? ` (${agreement.frequency})` : ''}
              {agreement.pricingTerms.amount ? ` · ${agreement.pricingTerms.amount}` : ''}
            </p>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
              {agreement.serviceDescription}
            </p>
            {agreement.awaitingPodId && agreement.awaitingPodId === myPodId && (
              <p className="mt-2 text-xs font-medium text-status-watch">{t('live.assigned')}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
