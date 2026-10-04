/** Pods list + pod detail — real overviews from the API. */
import { useEffect, useState } from 'react';
import { useApi } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import Link from '../../demo/src/shims/link';
import { ErrorPanel, Loading, ScreenHeader, Stat } from '../ui';
import { holdingFa, phaseFa, podFa } from './dashboard';

interface PodRow {
  id: string;
  name: string;
  status: string;
  categoryTag: string | null;
  holdingName: string;
  memberCount: number;
  monthlyFixedCosts: number;
  trialEndDate: string | null;
}

export function PodsScreen() {
  const api = useApi();
  const { t, num, lang, date, money } = useI18n();
  const [pods, setPods] = useState<PodRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<PodRow[]>('/api/pods')
      .then((rows) => !cancelled && setPods(rows))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <ErrorPanel error={error} />;
  if (!pods) return <Loading />;

  return (
    <div>
      <ScreenHeader title={t('live.podsTitle')} sub={t('live.dataFresh')} />
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-200 text-start text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-start font-medium">{t('live.podsTitle')}</th>
              <th className="px-4 py-2.5 text-start font-medium max-sm:hidden">{t('live.holding')}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t('live.status')}</th>
              <th className="px-4 py-2.5 text-start font-medium max-md:hidden">
                {t('live.fixedCosts')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => (
              <tr key={pod.id} className="border-b border-line-200 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/pod/${pod.id}`} className="font-medium text-ink-950 hover:text-signal-700">
                    {lang === 'fa' ? podFa(pod.name) : pod.name}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {t('live.members', { n: num(pod.memberCount) })}
                    {pod.categoryTag ? ` · ${pod.categoryTag}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 max-sm:hidden">
                  {lang === 'fa' ? holdingFa(pod.holdingName) : pod.holdingName}
                </td>
                <td className="px-4 py-3">
                  <StatusChip
                    tone={pod.status === 'active' ? 'good' : 'watch'}
                    label={t(pod.status === 'active' ? 'status.active' : 'status.trial')}
                  />
                </td>
                <td className="tabular px-4 py-3 text-slate-500 max-md:hidden">
                  {money(pod.monthlyFixedCosts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {new Date().getFullYear() === 2026 ? '' : ''}
        {t('live.dataFresh')}
      </p>
    </div>
  );
}

// --------------------------------------------------------------- detail ---

interface Member {
  id: string;
  fullName: string;
  email: string;
  joinedAt: string;
  leftAt: string | null;
}

interface Checkin {
  id: string;
  weekStart: string | null;
  status?: string;
  atRiskFlag?: boolean;
  summary?: string | null;
}

interface Overview {
  pod: PodRow;
  members: Member[];
  phase: { day: number; phase: { key: string; name: string } } | null;
  checkins: Checkin[] | null;
  election?: unknown;
  plan?: unknown;
}

export function PodDetailScreen({ podId }: { podId: string }) {
  const api = useApi();
  const { t, num, date, lang, money } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setOverview(null);
    setError(null);
    api
      .get<Overview>(`/api/pods/${podId}/overview`)
      .then((data) => !cancelled && setOverview(data))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api, podId]);

  if (error) return <ErrorPanel error={error} />;
  if (!overview) return <Loading />;

  const { pod, members, phase } = overview;
  const checkins = Array.isArray(overview.checkins) ? overview.checkins : [];

  return (
    <div>
      <div className="mb-4">
        <Link href="/pod" className="text-xs text-signal-700 hover:underline">
          → {t('live.backToPods')}
        </Link>
      </div>
      <ScreenHeader
        title={lang === 'fa' ? podFa(pod.name) : pod.name}
        sub={
          (lang === 'fa' ? holdingFa(pod.holdingName) : pod.holdingName) +
          (pod.categoryTag ? ` · ${pod.categoryTag}` : '')
        }
      >
        <StatusChip
          tone={pod.status === 'active' ? 'good' : 'watch'}
          label={t(pod.status === 'active' ? 'status.active' : 'status.trial')}
        />
      </ScreenHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t('live.today')}
          value={phase ? `${t('live.day')} ${num(phase.day)}` : '—'}
          sub={phase ? (lang === 'fa' ? phaseFa(phase.phase.key) : phase.phase.name) : ''}
        />
        <Stat label={t('live.members')} value={num(members.length)} />
        <Stat label={t('live.fixedCosts')} value={money(pod.monthlyFixedCosts)} />
        <Stat
          label={t('status.trial')}
          value={pod.trialEndDate ? date(pod.trialEndDate) : '—'}
          sub={pod.trialEndDate ? t('deploy.due', { date: date(pod.trialEndDate) }) : t('live.active')}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="text-sm font-medium text-ink-950">{t('live.members')}</h2>
          <ul className="mt-2 divide-y divide-line-200">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-ink-950">{member.fullName}</p>
                  <p className="text-xs text-slate-400">{member.email}</p>
                </div>
                <span className="tabular text-xs text-slate-400">
                  {t('pod.since') === 'pod.since' ? '' : ''}
                  {date(member.joinedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-4">
          <h2 className="text-sm font-medium text-ink-950">{t('live.checkins')}</h2>
          {checkins.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">{t('live.inboxEmpty')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {checkins.slice(0, 6).map((checkin, i) => (
                <li key={checkin.id ?? i} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">
                    {checkin.weekStart ? date(checkin.weekStart) : `#${num(i + 1)}`}
                  </span>
                  {checkin.atRiskFlag ? (
                    <StatusChip tone="alert" label={lang === 'fa' ? 'در معرض خطر' : 'at risk'} />
                  ) : (
                    <StatusChip tone="good" label={lang === 'fa' ? 'ثبت شده' : 'logged'} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
