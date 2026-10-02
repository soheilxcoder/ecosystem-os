/**
 * Peer review & governance — three separate processes, adapted from the live
 * page with the sample dataset.
 */
import Link from '../shims/link';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PODS } from '../data';

const QUEUE = [
  { id: 'r1', pod: 'Pod Dune', pitch: 'Seasonal staff-scheduling tool', stage: 'Draft review', due: '2026-09-24' },
  { id: 'r2', pod: 'Pod Ember', pitch: 'Vendor-payment reconciliation, phase 2', stage: 'Submitted', due: '2026-09-24' },
];

const CASES = [
  {
    id: 'AC-004',
    pod: 'Pod Atlas',
    stage: 'Stage 4 — panel',
    status: 'open',
    summary: 'Conflict between two Atlas members over delivery ownership; panel constituted.',
  },
];

export function ReviewScreen() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Peer review &amp; governance</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Three separate processes live here: peer review, conflict resolution, and the two
          governance tracks. They share a building, not a state machine.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="border-l-2 border-signal-600 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Peer review</h2>
          <p className="mt-1 text-sm text-slate-500">2 pitch(es) assigned to you this cycle.</p>
          <p role="status" className="mt-2 text-sm text-status-watch">
            The review window (Days 86–88) is not open yet — auto-submit on Day 85.
          </p>
        </section>

        <section className="border-l-2 border-signal-600 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Conflict resolution</h2>
          <p className="mt-1 text-sm text-slate-500">1 open case assigned to you.</p>
          <ul className="mt-3 space-y-2">
            {CASES.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border border-line-200 px-2 py-1.5">
                <span className="min-w-0 truncate text-xs text-ink-950">{c.id} · {c.pod}</span>
                <StatusChip tone="alert" label={c.stage} />
              </li>
            ))}
          </ul>
        </section>

        <section className="border-l-2 border-signal-600 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Governance tracks</h2>
          <p className="mt-1 text-sm text-slate-500">
            Entry trial and accountability run on their own rails; neither borrows the other&apos;s
            stages.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Pod Cinder is in its entry trial — Day 41 of 90.
          </p>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">Your review queue</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {QUEUE.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{item.pod} — {item.pitch}</span>
                <span className="block text-xs text-slate-500">
                  {item.stage} · due {item.due}
                </span>
              </span>
              <span className="shrink-0 text-xs text-signal-600 underline">Open review</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">Pods and their tracks</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {PODS.map((pod) => (
            <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                <span className="block text-xs text-slate-500">{pod.holdingName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusChip
                  tone={pod.status === 'active' ? 'good' : 'active'}
                  label={pod.status === 'active' ? 'Active' : 'Entry trial'}
                />
                <Link href={`/pod/${pod.id}`} className="text-xs text-signal-600 underline">
                  Pod
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
