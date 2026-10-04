/** Investor — Strategic-Hub reports; real 403 unless the seat allows it. */
import { useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';

interface Report {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  publishedAt?: string | null;
  dateFrom?: string;
  dateTo?: string;
}

export function InvestorScreen() {
  const api = useApi();
  const { t, date, lang } = useI18n();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Report[]>('/api/hub/strategic/reports')
      .then((rows) => !cancelled && setReports(rows))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} hint={t('live.needStrategic')} />;
  if (!reports) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('live.reports')} sub={t('live.dataFresh')} />
      {reports.length === 0 ? (
        <p className="text-sm text-slate-400">{t('live.inboxEmpty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <section key={report.id} className="panel panel-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-medium text-ink-950">
                  {report.title ?? report.name ?? t('live.reports')}
                </h2>
                <StatusChip
                  tone={report.status === 'published' ? 'good' : 'neutral'}
                  label={report.status ?? '—'}
                />
              </div>
              {(report.dateFrom || report.dateTo) && (
                <p className="tabular mt-1.5 text-xs text-slate-500">
                  {report.dateFrom ? date(report.dateFrom) : ''}
                  {report.dateFrom && report.dateTo ? ' — ' : ''}
                  {report.dateTo ? date(report.dateTo) : ''}
                </p>
              )}
              {report.publishedAt && (
                <p className="mt-1 text-xs text-slate-400">
                  {lang === 'fa' ? 'منتشرشده:' : 'Published:'} {date(report.publishedAt)}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
