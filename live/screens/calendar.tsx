/** Calendar — the real cycle, phases and history. */
import { useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader, Stat } from '../ui';
import { phaseFa } from './dashboard';

interface CycleRow {
  id: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: string;
}

interface CalendarCurrent {
  day: number;
  cycleNumber: number;
  progress: number;
  daysRemainingInPhase: number;
  daysRemainingInCycle: number;
  phaseEndDate: string;
  cycleEndDate: string;
  cycleStartDate: string;
  phase: { key: string; name: string; summary: string; startDay: number; endDay: number };
  milestones: Array<{ type: string; label: string; day: number; date: string }>;
}

const MILESTONE_FA: Record<string, string> = {
  'Pod Lead rotation window opens': 'باز شدن پنجرهٔ چرخش سرپرست پاد',
  'Pitch window opens': 'باز شدن پنجرهٔ پیچ',
  'Pitch submission deadline': 'مهلت ثبت پیچ',
  'Peer review deadline': 'مهلت داوری همتایان',
  'Results announced, budget allocated': 'اعلام نتایج و تخصیص بودجه',
};

export function CalendarScreen() {
  const api = useApi();
  const { t, num, date, lang } = useI18n();
  const [current, setCurrent] = useState<CalendarCurrent | null>(null);
  const [history, setHistory] = useState<CycleRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<CalendarCurrent>('/api/calendar/current'),
      api.get<CycleRow[]>('/api/calendar/history'),
    ])
      .then(([cur, hist]) => {
        if (!cancelled) {
          setCurrent(cur);
          setHistory(hist);
        }
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} />;
  if (!current || !history) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('nav.calendar')} sub={t('live.rolledNote')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t('live.cycle')}
          value={num(current.cycleNumber)}
          sub={`${t('live.day')} ${num(current.day)} / ${num(90)}`}
        />
        <Stat
          label={lang === 'fa' ? 'فاز فعلی' : 'Current phase'}
          value={lang === 'fa' ? phaseFa(current.phase.key) : current.phase.name}
          sub={t('live.daysLeft', { n: num(current.daysRemainingInPhase) })}
        />
        <Stat
          label={lang === 'fa' ? 'پایان چرخه' : 'Cycle end'}
          value={date(current.cycleEndDate)}
          sub={t('live.daysLeft', { n: num(current.daysRemainingInCycle) })}
        />
        <Stat
          label={lang === 'fa' ? 'شروع چرخه' : 'Cycle start'}
          value={date(current.cycleStartDate)}
        />
      </div>

      {/* phase progress */}
      <section className="mt-6 panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-ink-950">
            {lang === 'fa' ? phaseFa(current.phase.key) : current.phase.name}
          </h2>
          <StatusChip tone="active" label={`${t('live.day')} ${num(current.phase.startDay)}–${num(current.phase.endDay)}`} />
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{current.phase.summary}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-signal-600"
            style={{ width: `${Math.round(current.progress * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-slate-400">
          <span>{t('live.day')} {num(1)}</span>
          <span>{t('live.day')} {num(90)}</span>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {current.milestones.map((m) => (
            <li
              key={m.type}
              className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                m.day <= current.day ? 'bg-status-good/10 text-ink-900' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <span>{lang === 'fa' ? MILESTONE_FA[m.label] ?? m.label : m.label}</span>
              <span className="tabular shrink-0">
                {t('live.day')} {num(m.day)} · {date(m.date)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* cycle history */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink-950">{t('live.cyclesHistory')}</h2>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 text-start font-medium">{t('live.cycle')}</th>
                <th className="px-4 py-2.5 text-start font-medium max-sm:hidden">
                  {lang === 'fa' ? 'شروع' : 'Start'}
                </th>
                <th className="px-4 py-2.5 text-start font-medium max-sm:hidden">
                  {lang === 'fa' ? 'پایان' : 'End'}
                </th>
                <th className="px-4 py-2.5 text-start font-medium">{t('live.status')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((cycle) => (
                <tr key={cycle.id} className="border-b border-line-200 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink-950">{num(cycle.cycleNumber)}</td>
                  <td className="tabular px-4 py-3 text-slate-500 max-sm:hidden">{date(cycle.startDate)}</td>
                  <td className="tabular px-4 py-3 text-slate-500 max-sm:hidden">{date(cycle.endDate)}</td>
                  <td className="px-4 py-3">
                    <StatusChip
                      tone={cycle.status === 'active' ? 'active' : 'neutral'}
                      label={cycle.status === 'active' ? t('live.active') : t('live.completed')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
