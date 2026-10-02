/**
 * Pod detail — overview, members and pitch history, adapted from the live
 * `/pod/:podId` pages. Tabs mirror the real layout, including the two that
 * land with later modules.
 */
import { useState } from 'react';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip, podStatusTone } from '../../../components/ui/StatusChip';
import { PODS, money, type PodSample } from '../data';

const MEMBERS: Record<string, { name: string; seat: string; since: string }[]> = {
  'pod-atlas': [
    { name: 'Lena Lead', seat: 'Pod Lead', since: '2026-01' },
    { name: 'Mara Voss', seat: 'Delivery', since: '2026-02' },
    { name: 'Kian Tehrani', seat: 'Delivery', since: '2026-02' },
    { name: 'Sasha Reid', seat: 'Quality', since: '2026-03' },
    { name: 'Noor Haddad', seat: 'Quality', since: '2026-04' },
    { name: 'Emil Sørensen', seat: 'Delivery', since: '2026-05' },
    { name: 'Priya Anand', seat: 'Client Interface', since: '2026-06' },
    { name: 'Tomás Reyes', seat: 'Delivery', since: '2026-07' },
  ],
};

const PITCH_HISTORY = [
  {
    cycle: 'Cycle 3 · submitted 2026-08-12',
    title: 'Extend the reconciliation engine to two new banks',
    summary:
      'Keep the core team, add one integration seat. Review Board verdict: accepted with one condition (a clearer test plan).',
    status: 'accepted',
  },
  {
    cycle: 'Cycle 2 · submitted 2026-05-15',
    title: 'Payments reconciliation — phase two',
    summary:
      'Kept the focus from cycle 1 and asked for one additional seat. Verdict: accepted.',
    status: 'accepted',
  },
  {
    cycle: 'Cycle 1 · submitted 2026-02-10',
    title: 'Stand up the reconciliation pod',
    summary: 'Founding pitch. Verdict: accepted — entry trial granted.',
    status: 'accepted',
  },
];

export function PodScreen({ podId }: { podId: string }) {
  const pod = PODS.find((p) => p.id === podId) ?? PODS[0]!;
  const [tab, setTab] = useState<'overview' | 'members' | 'history'>('overview');

  const tabs = [
    { id: 'overview' as const, label: 'Overview', available: true },
    { id: 'members' as const, label: 'Members', available: true },
    { id: 'history' as const, label: 'Pitch History', available: true },
    { id: null, label: 'CLOU Agreements', available: false },
    { id: null, label: 'Coaching', available: false },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-ink-950">{pod.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {pod.holdingName} · Lead {pod.leadName} · Coach {pod.coachName}
        </p>
      </header>

      <nav aria-label="Pod sections" className="mb-4 flex flex-wrap gap-1 border-b border-line-200">
        {tabs.map((t) =>
          t.available ? (
            <button
              key={t.label}
              type="button"
              onClick={() => t.id && setTab(t.id)}
              className={`rounded-t border-b-2 px-3 py-2 text-sm ${
                tab === t.id
                  ? 'border-signal-600 font-medium text-signal-700'
                  : 'border-transparent text-ink-700 hover:border-signal-600 hover:text-signal-700'
              }`}
            >
              {t.label}
            </button>
          ) : (
            <span
              key={t.label}
              aria-disabled="true"
              className="cursor-not-allowed px-3 py-2 text-sm text-slate-300"
              title="Arrives with its module in a later phase"
            >
              {t.label}
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
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <DataCard
        label="Status"
        value={pod.status === 'active' ? 'Active pod' : 'Entry trial'}
        tone={podStatusTone(pod.status) === 'good' ? 'good' : 'active'}
        hint={`${pod.memberCount} members, all on time-boxed seats.`}
      />
      <DataCard
        label="Unit Score — cycle 3"
        value={pod.unitScore}
        tone="neutral"
        hint="Financial 40% · peer review 35% · strategic 25%."
        provenance={{
          source: 'unit_score (calculated)',
          updatedAt: '2026-09-28',
          formula: `(0.40 × ${pod.components.financial}) + (0.35 × ${pod.components.peer_review}) + (0.25 × ${pod.components.strategic})`,
          reference: '05-MODULE-BUDGET-MARKET.md',
        }}
      />
      <DataCard
        label="Provisional budget"
        value={money(pod.finalBudget)}
        tone="neutral"
        hint={`${pod.shareOfPoolPercent}% of the pool, pending the lock window.`}
      />

      <section className="border border-line-200 bg-white p-4 md:col-span-2 lg:col-span-2">
        <h2 className="text-sm font-medium text-ink-950">Latest pitch</h2>
        <p className="mt-1 text-sm text-ink-700">{PITCH_HISTORY[0]!.title}</p>
        <p className="mt-2 text-sm text-slate-500">{PITCH_HISTORY[0]!.summary}</p>
        <p className="mt-2 text-xs text-slate-500">{PITCH_HISTORY[0]!.cycle}</p>
      </section>

      <section className="border border-line-200 bg-white p-4">
        <h2 className="text-sm font-medium text-ink-950">Health signal</h2>
        <div className="mt-2 flex items-center gap-2">
          <StatusChip
            tone={pod.signal.level === 'green' ? 'good' : pod.signal.level === 'amber' ? 'watch' : 'alert'}
            label={pod.signal.level}
          />
          <span className="tabular text-sm text-ink-950">{pod.signal.score} / 100</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The coach reads this signal every week; it informs — never overrides — the formula.
        </p>
      </section>
    </div>
  );
}

function PodMembers({ pod }: { pod: PodSample }) {
  const members = MEMBERS[pod.id] ?? MEMBERS['pod-atlas']!;
  return (
    <ul className="divide-y divide-line-200 border border-line-200 bg-white">
      {members.slice(0, pod.memberCount).map((member) => (
        <li key={member.name} className="flex items-center justify-between gap-3 p-3">
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink-950">{member.name}</span>
            <span className="block truncate text-xs text-slate-500">{member.seat} seat</span>
          </span>
          <span className="tabular shrink-0 text-xs text-slate-500">since {member.since}</span>
        </li>
      ))}
    </ul>
  );
}

function PodHistory({ pod }: { pod: PodSample }) {
  return (
    <ul className="space-y-3">
      {PITCH_HISTORY.map((pitch) => (
        <li key={pitch.cycle} className="border border-line-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink-950">{pitch.title}</h3>
            <StatusChip tone="good" label={pitch.status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{pitch.summary}</p>
          <p className="mt-2 text-xs text-slate-500">
            {pitch.cycle} · {pod.name}
          </p>
        </li>
      ))}
    </ul>
  );
}
