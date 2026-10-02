/**
 * Dashboard — the organisation at a glance, adapted from the live page with
 * the sample dataset: seats with rotation countdowns and the pod list.
 */
import Link from '../shims/link';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip, podStatusTone } from '../../../components/ui/StatusChip';
import { RotationBadge } from '../../../components/ui/RotationBadge';
import { computeRotation } from '../../../core/rotation';
import { formatShortDate } from '../../../core/time';
import { PODS, TODAY, type Persona } from '../data';

export function DashboardScreen({ persona }: { persona: Persona }) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Dashboard</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Signed in as {persona.fullName} · {persona.roleLabel}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DataCard
            label="Active roles"
            value={persona.rotation.length}
            unit={persona.rotation.length === 1 ? 'seat' : 'seats'}
            tone="good"
            hint="Roles are time-boxed assignments, re-read from the database on every request."
            provenance={{
              source: 'role_assignment (active today)',
              updatedAt: formatShortDate(TODAY),
              formula: 'start_date <= today <= end_date, and revoked_at is null',
              reference: '01-INFORMATION-ARCHITECTURE.md §3',
            }}
          />
        </div>

        <div className="lg:col-span-4">
          <DataCard
            label="Pods"
            value={persona.podNames.length}
            tone={persona.podNames.length > 0 ? 'active' : 'neutral'}
            hint={
              persona.podNames.length > 0
                ? persona.podNames.join(', ')
                : 'Hub seats span the whole organisation rather than one pod.'
            }
          />
        </div>

        <div className="lg:col-span-3">
          <DataCard
            label="Cycle"
            value="Day 62"
            unit="of 90"
            tone="active"
            hint="Execution phase · 28 days left in cycle 3."
          />
        </div>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Your seats</h2>
          <ul className="space-y-2">
            {persona.rotation.map((role) => (
              <li
                key={role.role}
                className="flex flex-wrap items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
              >
                <RotationBadge
                  role={role.role}
                  info={computeRotation(role.start, role.end, TODAY)}
                />
                <span className="tabular text-xs text-slate-500">
                  {formatShortDate(role.start)} → {formatShortDate(role.end)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Pods in your organisation</h2>
          <ul className="space-y-2">
            {PODS.map((pod) => (
              <li
                key={pod.id}
                className="flex items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {pod.holdingName} · {pod.memberCount} members
                  </span>
                </span>
                <StatusChip tone={podStatusTone(pod.status)} label={pod.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-12">
          <div className="border border-dashed border-line-300 bg-white p-4">
            <h2 className="text-sm font-medium text-ink-700">Where to look next</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-500">
              The <Link href="/budget" className="text-signal-600 underline">Budget Market</Link>{' '}
              shows how this cycle&apos;s pool is divided, the{' '}
              <Link href="/calendar" className="text-signal-600 underline">Sprint Calendar</Link>{' '}
              shows where the organisation is in time, and the{' '}
              <Link href="/hub" className="text-signal-600 underline">Hub Console</Link> is where
              the four hubs coordinate.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
