/**
 * `/coaching/console` — 07-MODULE-COACHING.md, screen 2 (Coach view).
 *
 * The assigned-pods grid with a traffic-light health indicator, the
 * reassignment countdown made visible, and the red-streak suggestion banner.
 *
 * Three things the spec asks for that this page is careful about:
 *   - The red-streak banner is a *suggestion*. It never opens an accountability
 *     case and says so; acting on it is the coach's judgement.
 *   - The ratio warning is guidance, not a gate — it is printed beside the grid,
 *     and the pods are still shown whatever the number is.
 *   - Private notes stay in the session detail; the console only counts them.
 */

import { StatusChip } from '../../../../components/ui/StatusChip';
import { LogSessionForm } from '../../../../components/coaching/LogSessionForm';
import { CapacityForm } from '../../../../components/coaching/CapacityForm';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';
import {
  SESSION_TYPE_LABELS,
  formatSessionDate,
  healthLabel,
  healthTone,
  type CoachConsolePayload,
} from '../../../../lib/types-coaching';

export const dynamic = 'force-dynamic';

export default async function CoachConsolePage() {
  const token = await getSessionToken();
  const [me, view] = await Promise.all([
    apiRequestOrNull<ApiMe>('/api/me', { token }),
    apiRequestOrNull<CoachConsolePayload>('/api/coaching/console', { token }),
  ]);

  const isCoach = (me?.roles ?? []).some((role) => role.roleType === 'coach');

  if (!view) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Coaching Console</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Your assigned pods, their health, and the sessions you have run.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">
            {isCoach ? 'No pods assigned yet' : 'This view is for coaches'}
          </h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            {isCoach
              ? 'The Coaching Hub has not assigned you a pod yet. When it does, their health and session history appear here.'
              : 'Sign in with a coach account to see the coaching console. The Coaching Hub manages assignments on the roster.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Coaching Console</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            {view.coachName} · {view.podCount} pod{view.podCount === 1 ? '' : 's'}
            {view.cycleNumber ? ` · cycle ${view.cycleNumber}` : ''}
          </p>
        </div>
        <StatusChip
          tone={view.podCount >= view.suggestedRange.min && view.podCount <= view.suggestedRange.max ? 'good' : 'watch'}
          label={`${view.podCount} of ${view.suggestedRange.min}–${view.suggestedRange.max} suggested pods`}
        />
      </header>

      {view.ratioWarning && (
        <div className="mb-5 rounded border border-status-watch/40 bg-surface-white px-4 py-3" role="status">
          <p className="text-sm text-ink-950">{view.ratioWarning}</p>
          <p className="mt-1 text-2xs text-slate-500">
            Guidance only — it never blocks an assignment.
          </p>
        </div>
      )}

      {/* Red-streak suggestions */}
      {view.flags.length > 0 && (
        <section className="mb-5 space-y-3" aria-label="Red-streak suggestions">
          {view.flags.map((flag) => (
            <div key={flag.podId} className="rounded border border-status-alert/40 bg-surface-white px-4 py-3" role="status">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="alert" label={`${flag.podName}: red ${flag.streak} cycles running`} />
                <span className="flex items-center gap-1" aria-label="recent health colours">
                  {flag.history.map((color, index) => (
                    <span
                      key={index}
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: color === 'green' ? '#1E7A4C' : color === 'amber' ? '#B7791F' : '#B23B3B',
                      }}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                This pod has been at risk for {flag.streak} consecutive cycles (threshold {flag.threshold}).
                Consider the accountability path — this is a suggestion, not an escalation: nothing here
                opens a case.
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="pods-heading">
          <h2 id="pods-heading" className="font-display text-lg text-ink-950">
            Your pods
          </h2>

          {view.pods.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No pods assigned to you yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {view.pods.map((pod) => (
                <article key={pod.podId} className="rounded border border-line-200 bg-surface-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-950">{pod.podName}</h3>
                    <span className="text-2xs text-slate-500">{pod.holdingName}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {pod.health ? (
                      <>
                        <StatusChip tone={healthTone(pod.health.signalColor)} label={healthLabel(pod.health.signalColor)} />
                        <span className="font-mono text-sm tabular-nums text-ink-950">{pod.health.signalScore}</span>
                      </>
                    ) : (
                      <StatusChip tone="neutral" label="No signal yet" />
                    )}
                  </div>

                  <dl className="mt-3 space-y-1 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <dt>Last session</dt>
                      <dd className="text-ink-950">
                        {pod.lastSessionAt
                          ? `${formatSessionDate(pod.lastSessionAt)} · ${SESSION_TYPE_LABELS[pod.lastSessionType ?? ''] ?? ''}`
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Next session</dt>
                      <dd className="text-ink-950">{pod.nextSessionAt ? formatSessionDate(pod.nextSessionAt) : '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Rotation</dt>
                      <dd className="text-ink-950">
                        cycle {pod.reassignment.cyclesWithPodSet} ·{' '}
                        {pod.reassignment.urgency === 'ok'
                          ? `${pod.reassignment.cyclesUntilReview} to review`
                          : pod.reassignment.urgency}
                      </dd>
                    </div>
                  </dl>

                  {pod.reassignment.urgency !== 'ok' && (
                    <p className="mt-2 rounded border border-status-watch/40 bg-white px-2 py-1 text-2xs text-ink-950">
                      {pod.reassignment.urgency === 'overdue'
                        ? 'Past the rotation window — the Hub should reassign.'
                        : 'Rotation review is due this cycle.'}
                    </p>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer rounded bg-signal-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-signal-700">
                      Log session
                    </summary>
                    <div className="mt-2">
                      <LogSessionForm podId={pod.podId} podName={pod.podName} today={me?.today ?? null} />
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}

          {/* Open requests */}
          <section className="mt-6" aria-labelledby="requests-heading">
            <h2 id="requests-heading" className="font-display text-lg text-ink-950">
              Session requests
            </h2>
            {view.openRequests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No open requests.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line-200 rounded border border-line-200 bg-surface-white">
                {view.openRequests.map((request) => (
                  <li key={request.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-ink-950">{request.topic}</span>
                      <StatusChip
                        tone={request.urgency === 'high' ? 'alert' : request.urgency === 'low' ? 'neutral' : 'active'}
                        label={request.urgency}
                      />
                    </div>
                    {request.preferredTimes && (
                      <p className="mt-1 text-2xs text-slate-500">Preferred: {request.preferredTimes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        <aside className="space-y-4">
          <CapacityForm
            currentCapacity={view.profile?.capacity ?? null}
            schedulingUrl={view.profile?.schedulingUrl ?? null}
          />

          <div className="rounded border border-line-200 bg-surface-white p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Rotation rule</h2>
            <p className="mt-2 text-sm text-slate-500">
              Assignments are reviewed every 2–3 cycles so no pod becomes dependent on one coach. The
              countdown on each card makes that rule visible.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
