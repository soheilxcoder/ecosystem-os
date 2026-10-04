/** Dashboard — real cycle state, real pods, real budget pool. */
import { useEffect, useState } from 'react';
import { useApi, useSession } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import Link from '../../demo/src/shims/link';
import { ErrorPanel, Loading, ScreenHeader, Stat } from '../ui';

interface CalendarCurrent {
  day: number;
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  phaseEndDate: string;
  progress: number;
  daysRemainingInPhase: number;
  daysRemainingInCycle: number;
  phase: { key: string; name: string; summary: string };
  milestones: Array<{ type: string; label: string; day: number; date: string }>;
}

interface PodRow {
  id: string;
  name: string;
  status: string;
  categoryTag: string | null;
  holdingName: string;
  memberCount: number;
  trialEndDate: string | null;
}

interface BudgetCycle {
  totalPool: number;
  distributablePool: number;
  reservedForSurvival: number;
  status: string;
}

const MILESTONE_FA: Record<string, string> = {
  'Pod Lead rotation window opens': 'باز شدن پنجرهٔ چرخش سرپرست پاد',
  'Pitch window opens': 'باز شدن پنجرهٔ پیچ',
  'Pitch submission deadline': 'مهلت ثبت پیچ',
  'Peer review deadline': 'مهلت داوری همتایان',
  'Results announced, budget allocated': 'اعلام نتایج و تخصیص بودجه',
};

export function DashboardScreen() {
  const api = useApi();
  const { me } = useSession();
  const { t, num, date, lang } = useI18n();
  const [calendar, setCalendar] = useState<CalendarCurrent | null>(null);
  const [pods, setPods] = useState<PodRow[] | null>(null);
  const [budget, setBudget] = useState<BudgetCycle | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cal, podList, bud] = await Promise.all([
          api.get<CalendarCurrent>('/api/calendar/current'),
          api.get<PodRow[]>('/api/pods'),
          api
            .get<{ budgetCycle: BudgetCycle }>('/api/budget/cycle/current')
            .then((r) => r.budgetCycle),
        ]);
        if (!cancelled) {
          setCalendar(cal);
          setPods(podList);
          setBudget(bud);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} />;
  if (!calendar || !pods || !budget || !me) return <Loading />;

  return (
    <div>
      <ScreenHeader
        title={t('nav.dashboard')}
        sub={t('live.dataFresh')}
      >
        <span className="live-badge">{t('live.badge')}</span>
      </ScreenHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* cycle card */}
        <section className="panel panel-hero p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-ink-950">
              {t('live.cycle')} {num(calendar.cycleNumber)} — {t('live.day')} {num(calendar.day)}
            </h2>
            <StatusChip tone="active" label={lang === 'fa' ? phaseFa(calendar.phase.key) : calendar.phase.name} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-signal-600"
              style={{ width: `${Math.round(calendar.progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>{t('live.daysLeft', { n: num(calendar.daysRemainingInCycle) })}</span>
            <span>{t('live.phaseEnds', { date: date(calendar.phaseEndDate) })}</span>
            <span>{t('live.cycleEnds', { date: date(calendar.cycleEndDate) })}</span>
          </div>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('live.milestones')}
          </h3>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {calendar.milestones.map((m) => (
              <li
                key={m.type}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs ${
                  m.day <= calendar.day ? 'bg-status-good/10 text-ink-900' : 'bg-slate-50 text-slate-500'
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

        {/* stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Stat
            label={t('live.pool')}
            value={num(budget.totalPool / 1_000_000) + 'M'}
            sub={budget.status === 'locked' ? t('live.locked') : t('live.provisional')}
          />
          <Stat
            label={t('live.podsTitle')}
            value={num(pods.length)}
            sub={`${num(pods.filter((p) => p.status === 'trial').length)} ${t('status.trial')}`}
          />
          <Stat
            label={t('live.today')}
            value={date(me.today)}
            sub={me.user?.fullName ?? ''}
          />
        </div>
      </div>

      {/* pods grid */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink-950">{t('live.podsTitle')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pods.map((pod) => (
            <Link key={pod.id} href={`/pod/${pod.id}`} className="panel panel-hover block p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base text-ink-950">
                  {lang === 'fa' ? podFa(pod.name) : pod.name}
                </h3>
                <StatusChip
                  tone={pod.status === 'active' ? 'good' : 'watch'}
                  label={t(pod.status === 'active' ? 'status.active' : 'status.trial')}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {lang === 'fa' ? holdingFa(pod.holdingName) : pod.holdingName}
                {pod.categoryTag ? ` · ${pod.categoryTag}` : ''}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {t('live.members', { n: num(pod.memberCount) })}
                {pod.trialEndDate ? ` · ${t('deploy.due', { date: date(pod.trialEndDate) })}` : ''}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function phaseFa(key: string): string {
  const map: Record<string, string> = {
    kickoff: 'راه‌اندازی',
    execution: 'اجرا و چک‌این هفتگی',
    pitch: 'پیچ‌ها',
    review: 'داوری همتایان',
    results: 'نتایج و تخصیص بودجه',
  };
  return map[key] ?? key;
}

export function podFa(name: string): string {
  const map: Record<string, string> = {
    'Pod Atlas': 'پاد اطلس',
    'Pod Basalt': 'پاد بازالت',
    'Pod Cinder': 'پاد سیندر',
    'Pod Dune': 'پاد دون',
    'Pod Ember': 'پاد امبر',
  };
  return map[name] ?? name;
}

export function holdingFa(name: string): string {
  if (name === 'Holding Pars') return 'هلدینگ پارس';
  if (name === 'Holding Dena') return 'هلدینگ دنا';
  return name;
}
