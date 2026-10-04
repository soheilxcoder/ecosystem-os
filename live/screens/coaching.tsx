/** Coaching — roster is a Coaching-Hub surface; real 403 shown otherwise. */
import { useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';

interface RosterRow {
  coachId?: string;
  coachName?: string;
  fullName?: string;
  email?: string;
  podNames?: string[];
  pods?: Array<{ name: string }>;
}

export function CoachingScreen() {
  const api = useApi();
  const { t, num, lang } = useI18n();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<RosterRow[]>('/api/coaching/roster')
      .then((rows) => !cancelled && setRoster(rows))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} hint={t('live.needCoaching')} />;
  if (!roster) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('nav.coaching')} sub={t('live.dataFresh')} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roster.map((coach, i) => {
          const name = coach.coachName ?? coach.fullName ?? coach.email ?? `#${i}`;
          const pods = coach.podNames ?? coach.pods?.map((p) => p.name) ?? [];
          return (
            <section key={coach.coachId ?? i} className="panel panel-hover p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-ink-950">{name}</h2>
                <StatusChip tone="good" label={t('live.coachRoster')} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {pods.length > 0
                  ? pods.map((p) => (lang === 'fa' ? podFaLocal(p) : p)).join('، ')
                  : t('live.inboxEmpty')}
              </p>
            </section>
          );
        })}
      </div>
      {roster.length === 0 && <p className="text-sm text-slate-400">{t('live.inboxEmpty')}</p>}
    </div>
  );
}

function podFaLocal(name: string): string {
  const map: Record<string, string> = {
    'Pod Atlas': 'پاد اطلس',
    'Pod Basalt': 'پاد بازالت',
    'Pod Cinder': 'پاد سیندر',
    'Pod Dune': 'پاد دون',
    'Pod Ember': 'پاد امبر',
  };
  return map[name] ?? name;
}
