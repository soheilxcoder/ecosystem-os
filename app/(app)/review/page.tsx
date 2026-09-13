/**
 * `/review` — the Peer Review & Governance landing screen.
 *
 * The module has three workflows and two governance tracks, none of which may
 * be merged. This screen therefore does not merge them: it shows three
 * separate doorways, and the governance table below states which track each pod
 * is on — computed by the same function the two tracks' services use, so the
 * overview can never disagree with the track screens.
 */

import Link from 'next/link';

import { StatusChip } from '../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { ApiMe } from '../../../lib/types';
import { TRACK_LABELS } from '../../../core/governance';
import { formatShortDate } from '../../../core/time';
import type { CaseDetailView, ReviewQueueView } from '../../../lib/governance';

export const dynamic = 'force-dynamic';

interface PodTrack {
  podId: string;
  podName: string;
  status: string;
  track: 'entry_trial' | 'accountability' | 'none';
  stage: string | null;
  day: number | null;
  dueDate: string | null;
  finalResult: string | null;
}

export default async function ReviewHomePage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  const [tracks, queue, cases] = await Promise.all([
    apiRequestOrNull<PodTrack[]>('/api/review/tracks', { token }),
    me?.user
      ? apiRequestOrNull<ReviewQueueView>(`/api/review/queue?reviewerUserId=${me.user.id}`, { token })
      : Promise.resolve(null),
    apiRequestOrNull<CaseDetailView[]>('/api/review/cases', { token }),
  ]);

  const isValidator = (me?.roles ?? []).some((role) => role.roleType === 'peer_validator');
  const isResolver = (me?.roles ?? []).some((role) => role.roleType === 'conflict_resolver');

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-950">Peer review &amp; governance</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Three separate processes live here: peer review, conflict resolution, and the two governance
        tracks. They share a building, not a state machine.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <section className="border-l-2 border-signal-600 bg-white p-4 shadow-none">
          <h2 className="text-sm font-medium text-ink-950">Peer review</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isValidator
              ? `${queue?.items.length ?? 0} pitch(es) assigned to you this cycle.`
              : 'You do not currently hold the Peer Validator seat.'}
          </p>
          {queue && !queue.windowOpen ? (
            <p role="status" className="mt-2 text-sm text-status-watch">
              The review window (Days 86–88) is closed.
            </p>
          ) : null}
          <Link href="/review/queue" className="mt-3 inline-block text-sm text-signal-700 underline">
            Open my review queue
          </Link>
        </section>

        <section className="border-l-2 border-signal-600 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Conflict resolution</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isResolver
              ? `${cases?.filter((item) => item.status === 'open').length ?? 0} open case(s) assigned to you.`
              : 'You are not currently a Conflict Resolver.'}
          </p>
          <Link href="/review/cases" className="mt-3 inline-block text-sm text-signal-700 underline">
            Open the case list
          </Link>
        </section>

        <section className="border-l-2 border-signal-600 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Governance tracks</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tracks?.filter((pod) => pod.track !== 'none').length ?? 0} pod(s) on a track right now.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            A pod is never on both — the database refuses it.
          </p>
        </section>
      </div>

      <h2 className="mt-8 font-display text-lg text-ink-950">Which track is each pod on?</h2>

      {!tracks ? (
        <div className="mt-3 border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">The governance service is unreachable.</p>
          <p className="mt-2 text-sm text-slate-500">
            Start the API with <code>npm run dev:api</code>.
          </p>
        </div>
      ) : tracks.length === 0 ? (
        <p className="mt-3 border border-line-200 bg-white p-4 text-sm text-slate-500">
          No pods yet.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto border border-line-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Governance track per pod</caption>
              <thead className="border-b border-line-200 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Pod</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Track</th>
                  <th scope="col" className="px-3 py-2 font-medium">Where it stands</th>
                  <th scope="col" className="px-3 py-2 font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((pod) => (
                  <tr key={pod.podId} className="border-b border-line-100">
                    <td className="px-3 py-2">{pod.podName}</td>
                    <td className="px-3 py-2 text-slate-500">{pod.status}</td>
                    <td className="px-3 py-2">
                      <StatusChip
                        tone={pod.track === 'none' ? 'neutral' : pod.track === 'entry_trial' ? 'active' : 'watch'}
                        label={TRACK_LABELS[pod.track]}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {pod.track === 'entry_trial'
                        ? `Day ${pod.day} of 90 · due ${pod.dueDate ? formatShortDate(pod.dueDate) : '—'}`
                        : pod.track === 'accountability'
                          ? `Stage: ${(pod.stage ?? '').replace(/_/g, ' ')}`
                          : 'Standard cycle'}
                    </td>
                    <td className="px-3 py-2">
                      {pod.track === 'entry_trial' ? (
                        <Link href={`/review/entry/${pod.podId}`} className="text-signal-700 underline">
                          Entry Rule
                        </Link>
                      ) : pod.track === 'accountability' ? (
                        <Link href={`/review/accountability/${pod.podId}`} className="text-signal-700 underline">
                          Accountability Path
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 md:hidden">
            {tracks.map((pod) => (
              <li key={pod.podId} className="border border-line-200 bg-white p-3">
                <p className="text-sm font-medium text-ink-950">{pod.podName}</p>
                <p className="mt-1 text-xs text-slate-500">{TRACK_LABELS[pod.track]}</p>
                {pod.track === 'entry_trial' ? (
                  <Link href={`/review/entry/${pod.podId}`} className="mt-2 inline-block text-sm text-signal-700 underline">
                    Day {pod.day} of 90
                  </Link>
                ) : pod.track === 'accountability' ? (
                  <Link
                    href={`/review/accountability/${pod.podId}`}
                    className="mt-2 inline-block text-sm text-signal-700 underline"
                  >
                    {(pod.stage ?? '').replace(/_/g, ' ')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
