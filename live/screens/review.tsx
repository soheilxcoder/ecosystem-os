/** Review — governance tracks for everyone; queue/cases need the real seats. */
import { useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';
import { podFa } from './dashboard';

interface Track {
  podId: string;
  podName: string;
  status: string;
  track: string;
  stage: string | null;
  day: number | null;
  dueDate: string | null;
}

const TRACK_FA: Record<string, string> = {
  entry_trial: 'دورهٔ آزمایشی ورود',
  accountability: 'پاسخ‌گویی',
  none: '—',
};

const STAGE_FA: Record<string, string> = {
  correction_period: 'دورهٔ اصلاح',
  panel_review: 'بررسی پنل',
  dissolution_vote: 'رأی انحلال',
};

export function ReviewScreen() {
  const api = useApi();
  const { t, num, date, lang } = useI18n();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [tracksError, setTracksError] = useState<unknown>(null);
  const [queueError, setQueueError] = useState<unknown>(null);
  const [queue, setQueue] = useState<unknown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Track[]>('/api/review/tracks')
      .then((rows) => !cancelled && setTracks(rows))
      .catch((err) => !cancelled && setTracksError(err));
    api
      .get<unknown[]>('/api/review/queue')
      .then((rows) => !cancelled && setQueue(rows))
      .catch((err) => !cancelled && setQueueError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (tracksError) return <ErrorPanel error={tracksError} />;
  if (!tracks) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('nav.review')} sub={t('live.dataFresh')} />

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-start font-medium">{t('live.podsTitle')}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t('live.tracks')}</th>
              <th className="px-4 py-2.5 text-start font-medium max-sm:hidden">
                {lang === 'fa' ? 'مرحله' : 'Stage'}
              </th>
              <th className="px-4 py-2.5 text-start font-medium max-sm:hidden">
                {lang === 'fa' ? 'مهلت' : 'Due'}
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr key={track.podId} className="border-b border-line-200 last:border-0">
                <td className="px-4 py-3 font-medium text-ink-950">
                  {lang === 'fa' ? podFa(track.podName) : track.podName}
                </td>
                <td className="px-4 py-3">
                  <StatusChip
                    tone={track.track === 'none' ? 'neutral' : track.track === 'entry_trial' ? 'watch' : 'alert'}
                    label={lang === 'fa' ? TRACK_FA[track.track] ?? track.track : track.track.replace(/_/g, ' ')}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 max-sm:hidden">
                  {track.stage
                    ? (lang === 'fa' ? STAGE_FA[track.stage] ?? track.stage : track.stage.replace(/_/g, ' '))
                    : '—'}
                  {track.day !== null ? ` · ${t('live.day')} ${num(track.day)}` : ''}
                </td>
                <td className="tabular px-4 py-3 text-xs text-slate-500 max-sm:hidden">
                  {track.dueDate ? date(track.dueDate) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink-950">{t('live.reviews')}</h2>
        {queueError ? (
          <ErrorPanel error={queueError} />
        ) : queue === null ? (
          <Loading />
        ) : queue.length === 0 ? (
          <p className="text-sm text-slate-400">{t('live.inboxEmpty')}</p>
        ) : (
          <div className="panel p-4 text-sm text-slate-600">
            {num(queue.length)} {lang === 'fa' ? 'مورد در صف داوری' : 'item(s) in the review queue'}
          </div>
        )}
      </section>
    </div>
  );
}
