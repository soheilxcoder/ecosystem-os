/**
 * `/coaching/sessions/[sessionId]` — one session, shaped by who asks.
 *
 * The same endpoint returns either the full row (coach / Coaching Hub, with
 * private notes) or the pod-visible projection (everyone else, without them),
 * and the payload tells the page which it got via `includesPrivateNotes`. The
 * page therefore never has to guess whether a missing field means "hidden" or
 * "not there".
 */

import Link from 'next/link';

import { StatusChip } from '../../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import {
  SESSION_TYPE_LABELS,
  formatSessionDate,
  type SessionDetailPayload,
} from '../../../../../lib/types-coaching';

export const dynamic = 'force-dynamic';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const token = await getSessionToken();
  const payload = await apiRequestOrNull<SessionDetailPayload>(
    `/api/coaching/sessions/${sessionId}`,
    { token },
  );

  if (!payload) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h1 className="font-display text-lg text-ink-950">Session not found</h1>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Either this session does not exist, or it is not visible to you. A private session never
            confirms its existence to the pod.
          </p>
          <Link
            href="/coaching/console"
            className="mt-4 inline-block rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
          >
            Back to the console
          </Link>
        </div>
      </div>
    );
  }

  const { session, includesPrivateNotes } = payload;
  const privateNotes = includesPrivateNotes
    ? (session as { privateNotes?: string }).privateNotes ?? null
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Coaching session</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatSessionDate(session.occurredAt)} ·{' '}
            {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
          </p>
        </div>
        <StatusChip
          tone={session.sharedWithPod ? 'good' : 'neutral'}
          label={session.sharedWithPod ? 'Shared with pod' : 'Private'}
        />
      </header>

      {privateNotes !== null ? (
        <section className="rounded border border-line-200 bg-surface-white p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Private notes <span className="normal-case text-slate-500">(coach &amp; Coaching Hub only)</span>
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-950">{privateNotes}</p>
        </section>
      ) : null}

      <section className="mt-4 rounded border border-line-200 bg-surface-white p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {session.sharedWithPod ? 'Pod-visible summary' : 'What the pod sees'}
        </h2>
        {session.sharedWithPod && session.podVisibleSummary ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-950">{session.podVisibleSummary}</p>
        ) : (
          <p className="mt-2 text-sm italic text-slate-500">
            Nothing was shared — the pod sees only that this session happened.
          </p>
        )}
      </section>

      <div className="mt-6">
        <Link
          href={includesPrivateNotes ? '/coaching/console' : '/coaching/my-coach'}
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          {includesPrivateNotes ? 'Back to the console' : 'Back to my coach'}
        </Link>
      </div>
    </div>
  );
}
