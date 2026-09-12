/**
 * Dashboard — Phase 0 shell.
 *
 * The roadmap's Phase 0 definition of done is an empty shell: the sidebar, the
 * design-system components and a logged-in session. The pod hero, org pulse and
 * cycle timeline arrive with their modules, so this page states plainly what is
 * live and what is coming rather than faking numbers.
 */

import Link from 'next/link';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip, podStatusTone } from '../../../components/ui/StatusChip';
import { RotationBadge } from '../../../components/ui/RotationBadge';
import { computeRotation } from '../../../core/rotation';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { ApiMe } from '../../../lib/types';
import { formatShortDate } from '../../../core/time';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  pod_member: 'Pod Member',
  pod_lead: 'Pod Lead',
  peer_validator: 'Peer Validator',
  conflict_resolver: 'Conflict Resolver',
  coach: 'Coach',
  hub_architecture: 'Architecture Hub',
  hub_deployment: 'Deployment Hub',
  hub_coaching: 'Coaching Hub',
  hub_strategic: 'Strategic Interactions Hub',
  investor: 'Investor',
  holding_executive: 'Holding Executive',
};

export default async function DashboardPage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  const roles = me?.roles ?? [];
  const pods = me?.pods ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Dashboard</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          {me?.user
            ? `Signed in as ${me.user.fullName}. This is the Phase 0 shell: navigation, session and the design-system foundations are live.`
            : 'This is the Phase 0 shell.'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DataCard
            label="Active roles"
            value={roles.length}
            unit={roles.length === 1 ? 'seat' : 'seats'}
            tone={roles.length > 0 ? 'good' : 'neutral'}
            hint={
              roles.length > 0
                ? 'Roles are time-boxed assignments, re-read from the database on every request.'
                : 'No active role assignments — you will not be able to act in any pod.'
            }
            provenance={{
              source: 'role_assignment (active today)',
              updatedAt: me?.today ? formatShortDate(me.today) : undefined,
              formula: 'start_date <= today <= end_date, and revoked_at is null',
              reference: '01-INFORMATION-ARCHITECTURE.md §3',
            }}
          />
        </div>

        <div className="lg:col-span-4">
          <DataCard
            label="Pods"
            value={pods.length}
            tone={pods.length > 0 ? 'active' : 'neutral'}
            hint={
              pods.length > 0
                ? pods.map((pod) => pod.name).join(', ')
                : 'You are not assigned to a pod yet — check with your Coaching Hub contact.'
            }
          />
        </div>

        <div className="lg:col-span-3">
          <DataCard
            label="Modules live"
            value="1 / 10"
            tone="neutral"
            hint="Foundations. Pods and Sprint Calendar land in phase 1."
          />
        </div>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Your seats</h2>
          {roles.length === 0 ? (
            <p className="rounded border border-line-200 bg-white p-4 text-sm text-slate-500">
              Nothing assigned yet. Roles are records with a start and end date — they are never a
              permanent field on your profile.
            </p>
          ) : (
            <ul className="space-y-2">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
                >
                  <RotationBadge
                    role={ROLE_LABELS[role.roleType] ?? role.roleType}
                    info={computeRotation(role.startDate, role.endDate, me?.today ?? '2026-01-01')}
                  />
                  <span className="tabular text-xs text-slate-500">
                    {formatShortDate(role.startDate)} →{' '}
                    {role.endDate ? formatShortDate(role.endDate) : 'open-ended'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Pods in your organisation</h2>
          {pods.length === 0 ? (
            <p className="rounded border border-line-200 bg-white p-4 text-sm text-slate-500">
              No pods yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {pods.map((pod) => (
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
          )}
        </section>

        <section className="lg:col-span-12">
          <div className="border border-dashed border-line-300 bg-white p-4">
            <h2 className="text-sm font-medium text-ink-700">What lands when</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-500">
              Modules are built in the roadmap order so each one has real data to work against. The
             {' '}
              <Link href="/design-system" className="text-signal-600 underline">
                design system
              </Link>{' '}
              page shows every base component in each of its states.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
