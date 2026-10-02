/**
 * Pod detail — overview, members and pitch history. Tabs mirror the real
 * layout, including the two that land with later modules. Fully bilingual.
 */
import { useState } from 'react';
import { StatusChip, podStatusTone } from '../../../components/ui/StatusChip';
import { DataCardI18n } from '../components/primitives';
import { PODS, type PodSample } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

const MEMBERS: Record<string, { name: string; seatKey: StringKey; since: string }[]> = {
  'pod-atlas': [
    { name: 'Lena Lead', seatKey: 'seat.Pod Lead', since: '2026-01' },
    { name: 'Mara Voss', seatKey: 'member.seatDelivery', since: '2026-02' },
    { name: 'Kian Tehrani', seatKey: 'member.seatDelivery', since: '2026-02' },
    { name: 'Sasha Reid', seatKey: 'member.seatQuality', since: '2026-03' },
    { name: 'Noor Haddad', seatKey: 'member.seatQuality', since: '2026-04' },
    { name: 'Emil Sørensen', seatKey: 'member.seatDelivery', since: '2026-05' },
    { name: 'Priya Anand', seatKey: 'member.seatClient', since: '2026-06' },
    { name: 'Tomás Reyes', seatKey: 'member.seatDelivery', since: '2026-07' },
  ],
};

const PITCH_HISTORY = [
  { cycle: 3, date: '2026-08-12', titleKey: 'pitch.c3.title', summaryKey: 'pitch.c3.summary' },
  { cycle: 2, date: '2026-05-15', titleKey: 'pitch.c2.title', summaryKey: 'pitch.c2.summary' },
  { cycle: 1, date: '2026-02-10', titleKey: 'pitch.c1.title', summaryKey: 'pitch.c1.summary' },
] as const;

export function PodScreen({ podId }: { podId: string }) {
  const pod = PODS.find((p) => p.id === podId) ?? PODS[0]!;
  const [tab, setTab] = useState<'overview' | 'members' | 'history'>('overview');
  const { t } = useI18n();
  const names = useNames();

  const tabs = [
    { id: 'overview' as const, label: t('pod.tabOverview'), available: true },
    { id: 'members' as const, label: t('pod.tabMembers'), available: true },
    { id: 'history' as const, label: t('pod.tabHistory'), available: true },
    { id: null, label: t('pod.tabCLOU'), available: false },
    { id: null, label: t('pod.tabCoaching'), available: false },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink-950">{names.podName(pod.id)}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('pod.holdingLeadCoach', {
            holding: names.holdingByName(pod.holdingName),
            lead: pod.leadName,
            coach: pod.coachName,
          })}
        </p>
      </header>

      <nav aria-label="Pod sections" className="mb-4 flex flex-wrap gap-1 border-b border-line-200">
        {tabs.map((item) =>
          item.available ? (
            <button
              key={item.label}
              type="button"
              onClick={() => item.id && setTab(item.id)}
              className={`rounded-t border-b-2 px-3 py-2 text-sm ${
                tab === item.id
                  ? 'border-signal-600 font-medium text-signal-700'
                  : 'border-transparent text-ink-700 hover:border-signal-600 hover:text-signal-700'
              }`}
            >
              {item.label}
            </button>
          ) : (
            <span
              key={item.label}
              aria-disabled="true"
              className="cursor-not-allowed px-3 py-2 text-sm text-slate-300"
              title={t('pod.tabComingLater')}
            >
              {item.label}
            </span>
          ),
        )}
      </nav>

      {tab === 'overview' && <PodOverview pod={pod} />}
      {tab === 'members' && <PodMembers pod={pod} />}
      {tab === 'history' && <PodHistory pod={pod} />}
    </div>
  );
}

function PodOverview({ pod }: { pod: PodSample }) {
  const { t, num, money } = useI18n();
  const latest = PITCH_HISTORY[0]!;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <DataCardI18n
        label={t('pod.statusLabel')}
        value={pod.status === 'active' ? t('pod.activePod') : t('pod.entryTrial')}
        tone={podStatusTone(pod.status) === 'good' ? 'good' : 'active'}
        hint={t('pod.membersHint', { n: num(pod.memberCount) })}
      />
      <DataCardI18n
        label={t('pod.unitScoreCard')}
        value={num(pod.unitScore, 2)}
        tone="neutral"
        hint={t('pod.unitScoreHint')}
        provenance={{
          source: 'unit_score (calculated)',
          updatedAt: '2026-09-28',
          formula: `(0.40 × ${pod.components.financial}) + (0.35 × ${pod.components.peer_review}) + (0.25 × ${pod.components.strategic})`,
          reference: '05-MODULE-BUDGET-MARKET.md',
        }}
      />
      <DataCardI18n
        label={t('pod.provBudget')}
        value={money(pod.finalBudget)}
        tone="neutral"
        hint={t('pod.provBudgetHint', { share: num(pod.shareOfPoolPercent, 1) })}
      />

      <section className="border border-line-200 bg-white p-4 md:col-span-2 lg:col-span-2">
        <h2 className="text-sm font-medium text-ink-950">{t('pod.latestPitch')}</h2>
        <p className="mt-1 text-sm text-ink-700">{t(latest.titleKey)}</p>
        <p className="mt-2 text-sm text-slate-500">{t(latest.summaryKey)}</p>
        <p className="mt-2 text-xs text-slate-500">
          {t('pitch.cycle', { n: num(latest.cycle), date: latest.date })}
        </p>
      </section>

      <section className="border border-line-200 bg-white p-4">
        <h2 className="text-sm font-medium text-ink-950">{t('pod.health')}</h2>
        <div className="mt-2 flex items-center gap-2">
          <StatusChip
            tone={pod.signal.level === 'green' ? 'good' : pod.signal.level === 'amber' ? 'watch' : 'alert'}
            label={pod.signal.level}
          />
          <span className="tabular text-sm text-ink-950">{num(pod.signal.score)} / 100</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('pod.healthNote')}</p>
      </section>
    </div>
  );
}

function PodMembers({ pod }: { pod: PodSample }) {
  const { t } = useI18n();
  const names = useNames();
  const members = MEMBERS[pod.id] ?? MEMBERS['pod-atlas']!;
  return (
    <ul className="divide-y divide-line-200 border border-line-200 bg-white">
      {members.slice(0, pod.memberCount).map((member) => (
        <li key={member.name} className="flex items-center justify-between gap-3 p-3">
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink-950">{member.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {t('pod.seat', { seat: names.seat(member.seatKey) })}
            </span>
          </span>
          <span className="tabular shrink-0 text-xs text-slate-500">
            {t('pod.since', { m: member.since })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PodHistory({ pod }: { pod: PodSample }) {
  const { t, num } = useI18n();
  const names = useNames();
  return (
    <ul className="space-y-3">
      {PITCH_HISTORY.map((pitch) => (
        <li key={pitch.cycle} className="border border-line-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink-950">{t(pitch.titleKey)}</h3>
            <StatusChip tone="good" label={t('pitch.accepted')} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{t(pitch.summaryKey)}</p>
          <p className="mt-2 text-xs text-slate-500">
            {t('pitch.cycle', { n: num(pitch.cycle), date: pitch.date })} · {names.podName(pod.id)}
          </p>
        </li>
      ))}
    </ul>
  );
}
