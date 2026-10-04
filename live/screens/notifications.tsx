/** Notifications — real counts + mark-all-read against the live store. */
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';

interface Counts {
  unread: number;
  urgent: number;
}

export function NotificationsScreen() {
  const api = useApi();
  const { t, num, lang } = useI18n();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    api
      .get<Counts>('/api/notifications/counts')
      .then((data) => !cancelled && setCounts(data))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => load(), [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.post('/api/notifications/read-all', {});
      load();
    } finally {
      setMarking(false);
    }
  };

  if (error) return <ErrorPanel error={error} />;
  if (!counts) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('nav.notifications')} sub={t('live.dataFresh')}>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={marking || counts.unread === 0}
          className="rounded-md border border-line-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 shadow-sm hover:border-signal-600/60 disabled:opacity-50"
        >
          {marking ? '…' : lang === 'fa' ? 'خواندن همه' : 'Mark all read'}
        </button>
      </ScreenHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-medium text-ink-950">{t('live.unread', { n: num(counts.unread) })}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {counts.unread === 0 ? t('live.inboxEmpty') : t('live.dataFresh')}
          </p>
        </section>
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-950">
              {lang === 'fa' ? 'فوری' : 'Urgent'}
            </h2>
            <StatusChip tone={counts.urgent > 0 ? 'alert' : 'neutral'} label={num(counts.urgent)} />
          </div>
        </section>
      </div>
    </div>
  );
}
