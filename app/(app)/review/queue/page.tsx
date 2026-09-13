/**
 * `/review/queue` — 08-MODULE-PEER-REVIEW-GOVERNANCE.md screen 1.
 *
 * The Peer Validator's assigned reviews. Two things are made explicit rather
 * than enforced silently: the review window (Days 86–88) is stated on the page,
 * and the comment-length rule is shown as a live counter — the comments are the
 * only thing the reviewed pod ever learns from this process, so a bare number
 * is not a review.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../components/ui/StatusChip';
import { AssignPanelForm, ReviewScoreForm } from '../../../../components/review/ReviewForms';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONES,
  type ReviewQueueView,
} from '../../../../lib/governance';
import { formatShortDate } from '../../../../core/time';

export const dynamic = 'force-dynamic';

export default async function ReviewQueuePage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });
  const userId = me?.user?.id;

  const queue = userId
    ? await apiRequestOrNull<ReviewQueueView>(`/api/review/queue?reviewerUserId=${userId}`, { token })
    : null;

  if (!queue) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink-950">My review queue</h1>
        <div className="mt-4 border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">
            {userId ? 'The review service is unreachable.' : 'Your session has expired.'}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {userId ? (
              <>
                Start the API with <code>npm run dev:api</code>. If you do not hold the Peer
                Validator seat, this screen is not yours — that is the conflict-of-interest rule
                working, not a bug.
              </>
            ) : (
              <Link href="/login" className="text-signal-700 underline">
                Sign in again
              </Link>
            )}
          </p>
        </div>
      </div>
    );
  }

  const submitted = queue.items.filter((item) => item.status === 'submitted').length;

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-950">My review queue</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        You review pods you are not part of: assignment excludes your own pod, your coach, and any
        pod trading with the target under an active CLOU. The panel rotates one seat per cycle.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 border border-line-200 bg-white p-4">
        <StatusChip
          tone={queue.windowOpen ? 'good' : 'watch'}
          label={queue.windowOpen ? 'Review window open' : 'Review window closed'}
          meta={queue.cycleNumber ? `Cycle ${queue.cycleNumber} · Days 86–88` : 'Days 86–88'}
        />
        <span className="tabular text-sm text-slate-500">
          {submitted} of {queue.items.length} submitted
        </span>
        {queue.items.length > 0 ? (
          <span className="text-sm text-slate-500">
            {queue.reviewersPerPitch} reviewer(s) per pitch · comments of at least{' '}
            <span className="tabular">{queue.minCommentLength}</span> characters
          </span>
        ) : null}
      </div>

      {queue.unassigned.length > 0 ? (
        <div className="mt-4">
          <AssignPanelForm cycleId={queue.items[0]?.cycleId ?? null} count={queue.unassigned.length} />
        </div>
      ) : null}

      {queue.items.length === 0 ? (
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          Nothing is assigned to you in this cycle. Panels are drawn once the pitches are in, from
          the pods you have no conflict of interest with.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {queue.items.map((item) => (
            <li key={item.reviewId}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-ink-950">
                  {item.podName} · Cycle {item.cycleNumber}
                </h2>
                <StatusChip
                  tone={REVIEW_STATUS_TONES[item.status]}
                  label={REVIEW_STATUS_LABELS[item.status]}
                  meta={
                    item.peerAverage !== null
                      ? `panel average ${item.peerAverage}`
                      : undefined
                  }
                />
              </div>
              <p className="mb-2 text-xs text-slate-500">
                Period {formatShortDate(item.cycleStart)} – {formatShortDate(item.cycleEnd)}
              </p>
              <ReviewScoreForm
                pitchId={item.pitchId}
                podName={item.podName}
                initialScore={item.score}
                initialComments={item.comments}
                initialRubric={item.rubricAnswers ?? {}}
                minCommentLength={queue.minCommentLength}
                windowOpen={queue.windowOpen}
                readOnly={item.status === 'submitted'}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
