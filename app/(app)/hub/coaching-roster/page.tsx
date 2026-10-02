/**
 * `/hub/coaching-roster` — 07-MODULE-COACHING.md, screen 4 (Coaching Hub).
 *
 * The assignment matrix on two axes: every coach with their pods, and every pod
 * with its coach — including unassigned pods, because a gap that is not listed
 * is a gap that never gets filled. Ratio guidance and the source model's
 * benchmarks sit alongside as reference, never as a constraint.
 */

import { StatusChip } from '../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import {
  healthLabel,
  healthTone,
  type RosterPayload,
} from '../../../../lib/types-coaching';

export const dynamic = 'force-dynamic';

export default async function CoachingRosterPage() {
  const token = await getSessionToken();
  const roster = await apiRequestOrNull<RosterPayload>('/api/coaching/roster', { token });

  if (!roster) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Coaching Roster</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Who coaches whom, and where the coverage gaps are.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Coaching Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            The roster is the Coaching Hub&apos;s screen. Sign in with the Coaching Hub seat to manage
            coach assignments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Coaching Roster</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            {roster.coaches.length} coach{roster.coaches.length === 1 ? '' : 'es'} ·{' '}
            {roster.pods.length} pods
            {roster.unassignedPods.length > 0 ? ` · ${roster.unassignedPods.length} unassigned` : ''}
          </p>
        </div>
      </header>

      {/* Ratio guidance panel */}
      <section className="mb-6 rounded border border-line-200 bg-surface-white p-4" aria-labelledby="ratio-heading">
        <h2 id="ratio-heading" className="font-display text-lg text-ink-950">
          Ratio guidance
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Reference, not a rule. Assignments outside the suggested range raise a note, never a block.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {roster.benchmarks.map((benchmark) => (
            <div key={benchmark.label} className="rounded border border-line-200 bg-paper-100 px-3 py-2">
              <p className="text-2xs uppercase tracking-wide text-slate-500">{benchmark.label}</p>
              <p className="mt-0.5 text-sm font-medium text-ink-950">{benchmark.value}</p>
              <p className="mt-0.5 text-2xs text-slate-500">{benchmark.note}</p>
            </div>
          ))}
        </div>
      </section>

      {roster.reviewDue.length > 0 && (
        <section className="mb-6 rounded border border-status-watch/40 bg-surface-white p-4" aria-labelledby="review-heading">
          <h2 id="review-heading" className="font-display text-base text-ink-950">
            Reassignment review due
          </h2>
          <ul className="mt-2 space-y-1">
            {roster.reviewDue.map((item) => (
              <li key={item.podId} className="text-sm text-ink-950">
                {item.podName} — {item.reassignment.urgency === 'overdue' ? 'overdue' : 'due'} at cycle{' '}
                {item.reassignment.cyclesWithPodSet}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Coaches axis */}
        <section aria-labelledby="coaches-heading">
          <h2 id="coaches-heading" className="font-display text-lg text-ink-950">
            Coaches
          </h2>
          <div className="mt-3 space-y-3">
            {roster.coaches.map((coach) => (
              <article key={coach.coachUserId} className="rounded border border-line-200 bg-surface-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-ink-950">{coach.fullName}</h3>
                    <p className="text-2xs text-slate-500">{coach.email}</p>
                  </div>
                  <StatusChip
                    tone={coach.capacity === 'stretched' ? 'watch' : 'good'}
                    label={coach.capacity}
                    meta={coach.capacityStale ? 'stale' : undefined}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {coach.pods.length === 0 ? (
                    <span className="text-2xs text-slate-500">No pods — available capacity</span>
                  ) : (
                    coach.pods.map((pod) => (
                      <span key={pod.podId} className="rounded border border-line-200 bg-paper-100 px-2 py-0.5 text-2xs text-ink-700">
                        {pod.podName}
                      </span>
                    ))
                  )}
                </div>

                {coach.ratioWarning && (
                  <p className="mt-2 rounded border border-status-watch/40 bg-white px-2 py-1 text-2xs text-ink-950">
                    {coach.ratioWarning}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Pods axis */}
        <section aria-labelledby="pods-heading">
          <h2 id="pods-heading" className="font-display text-lg text-ink-950">
            Pods
          </h2>
          <div className="mt-3 space-y-3">
            {roster.pods.map((pod) => (
              <article key={pod.podId} className="rounded border border-line-200 bg-surface-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-ink-950">{pod.podName}</h3>
                    <p className="text-2xs text-slate-500">{pod.holdingName}</p>
                  </div>
                  {pod.health ? (
                    <StatusChip tone={healthTone(pod.health.signalColor)} label={healthLabel(pod.health.signalColor)} />
                  ) : (
                    <StatusChip tone="neutral" label="No signal" />
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {pod.coachName ? (
                    <>
                      Coach: <span className="text-ink-950">{pod.coachName}</span>
                      {pod.reassignment && (
                        <>
                          {' '}· cycle {pod.reassignment.cyclesWithPodSet}
                          {pod.reassignment.urgency !== 'ok' && (
                            <span className="ml-1 text-status-alert"> · {pod.reassignment.urgency}</span>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <span className="rounded border border-status-alert/40 bg-white px-2 py-0.5 text-2xs text-ink-950">
                      No coach assigned — coverage gap
                    </span>
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
