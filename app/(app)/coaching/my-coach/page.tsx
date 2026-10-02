/**
 * `/coaching/my-coach` — 07-MODULE-COACHING.md, screen 1 (Pod Member/Lead view).
 *
 * Who our coach is, how to reach them, when they rotate, and the sessions they
 * chose to share. The session history here comes through the pod-visible view,
 * so this page cannot show a private note even by accident — a session the coach
 * saved privately appears as a date with no note, which is what "coaches control
 * what is pod-visible" looks like when it is enforced in the query, not the UI.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../components/ui/StatusChip';
import { RequestSessionForm } from '../../../../components/coaching/RequestSessionForm';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import {
  SESSION_TYPE_LABELS,
  formatSessionDate,
  healthLabel,
  healthTone,
  type MyCoachPayload,
} from '../../../../lib/types-coaching';

export const dynamic = 'force-dynamic';

export default async function MyCoachPage() {
  const token = await getSessionToken();
  const view = await apiRequestOrNull<MyCoachPayload>('/api/coaching/my-coach', { token });

  if (!view) {
    return (
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">My Coach</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            The coach assigned to your pod, and the sessions they have shared with you.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">No coach assigned yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            You are not a member of a pod with a coach, or a coach has not been assigned yet. The
            Coaching Hub assigns a coach when a pod is deployed.
          </p>
        </div>
      </div>
    );
  }

  const { coach, reassignment, sessions, requests, health, podName } = view;
  const openRequests = requests.filter((r) => r.status === 'open');

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">My Coach</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            {podName}&apos;s assigned coach and the sessions they have shared with you.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coach identity */}
        <section className="lg:col-span-2">
          <div className="rounded border border-line-200 bg-surface-white p-4">
            {coach ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl text-ink-950">{coach.fullName}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{coach.email}</p>
                  </div>
                  <StatusChip tone="active" label="Your coach" />
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded border border-line-200 bg-paper-100 px-3 py-2">
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Coaching you for</dt>
                    <dd className="mt-0.5 text-sm text-ink-950">
                      {coach.coachingSinceDays !== null
                        ? `${coach.coachingSinceDays} day${coach.coachingSinceDays === 1 ? '' : 's'}`
                        : 'this cycle'}
                    </dd>
                  </div>
                  <div className="rounded border border-line-200 bg-paper-100 px-3 py-2">
                    <dt className="text-2xs uppercase tracking-wide text-slate-500">Book a time</dt>
                    <dd className="mt-0.5 text-sm">
                      {coach.schedulingUrl ? (
                        <a
                          href={coach.schedulingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signal-600 underline-offset-2 hover:underline"
                        >
                          Scheduling link
                        </a>
                      ) : (
                        <span className="text-slate-500">Ask your coach directly</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {reassignment && (
                  <div className="mt-4 border-t border-line-200 pt-3">
                    <p className="text-xs text-slate-500">
                      To keep coaching independent, assignments rotate every
                      {' '}{/* the 2–3 cycle window */}2–3 cycles.
                    </p>
                    <p className="mt-1 text-sm text-ink-950">
                      Cycle {reassignment.cyclesWithPodSet} of this pod set.{' '}
                      {reassignment.urgency === 'ok'
                        ? reassignment.reviewAround
                          ? `Reassignment review around ${reassignment.reviewAround}${reassignment.reviewAroundIsEstimate ? ' (estimate)' : ''}.`
                          : `Reassignment review in ${reassignment.cyclesUntilReview} cycle${reassignment.cyclesUntilReview === 1 ? '' : 's'}.`
                        : 'Reassignment review is due.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">No coach is assigned to your pod right now.</p>
            )}
          </div>

          {/* Session history */}
          <div className="mt-4 rounded border border-line-200 bg-surface-white p-4">
            <h2 className="font-display text-lg text-ink-950">Session history</h2>
            <p className="mt-1 text-xs text-slate-500">
              Sessions your coach chose to share show their summary. Private sessions show only the
              date — the note itself never reaches the pod.
            </p>

            {sessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No sessions yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line-200">
                {sessions.map((session) => (
                  <li key={session.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-950">
                        {formatSessionDate(session.occurredAt)}
                      </span>
                      <span className="text-2xs text-slate-500">
                        {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                      </span>
                    </div>
                    {session.sharedWithPod && session.podVisibleSummary ? (
                      <p className="mt-1 text-sm text-ink-950">{session.podVisibleSummary}</p>
                    ) : (
                      <p className="mt-1 text-sm italic text-slate-500">
                        Private session — no summary shared.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Right rail */}
        <aside className="space-y-4">
          {health && (
            <div className="rounded border border-line-200 bg-surface-white p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Pod health signal
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <StatusChip tone={healthTone(health.signalColor)} label={healthLabel(health.signalColor)} />
                <span className="font-mono text-sm tabular-nums text-ink-950">{health.signalScore}</span>
                <span className="text-xs text-slate-500">/ 100</span>
              </div>
              <p className="mt-2 text-2xs text-slate-500">
                Built from your check-in flags, the budget-score trend and peer-review sentiment.
              </p>
            </div>
          )}

          <RequestSessionForm podId={view.podId} />

          {openRequests.length > 0 && (
            <div className="rounded border border-line-200 bg-surface-white p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Your open requests
              </h2>
              <ul className="mt-2 space-y-2">
                {openRequests.map((request) => (
                  <li key={request.id} className="text-sm text-ink-950">
                    {request.topic}
                    <span className="ml-1 text-2xs text-slate-500">· {request.urgency}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-2xs text-slate-500">
            Need something else? Read about coaching in{' '}
            <Link href="/design-system" className="underline-offset-2 hover:underline">
              the design system
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
