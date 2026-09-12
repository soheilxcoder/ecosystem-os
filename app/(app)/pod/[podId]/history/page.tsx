/** Pod history (`/pod/:podId/history`) — one row per past cycle. */

import { StatusChip } from '../../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import { formatShortDate } from '../../../../../core/time';

export const dynamic = 'force-dynamic';

interface PitchRow {
  id: string;
  cycleId: string;
  status: 'draft' | 'submitted' | 'reviewed' | 'scored';
  previousSummary: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

const STATUS_TONE = {
  draft: 'neutral',
  submitted: 'active',
  reviewed: 'watch',
  scored: 'good',
} as const;

export default async function PodHistoryPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;
  const token = await getSessionToken();
  const [pitches, overview] = await Promise.all([
    apiRequestOrNull<PitchRow[]>(`/api/pods/${podId}/history`, { token }),
    apiRequestOrNull<{ pod: { name: string } }>(`/api/pods/${podId}/overview`, { token }),
  ]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">
            {overview?.pod.name ?? 'Pod'} · History
          </h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Every cycle’s pitch, score and flags, as a public record. Scores and budgets appear from
            the budget module in phase 4.
          </p>
        </div>
        <a
          href={`/api/pods/${podId}/history.csv`}
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600"
        >
          Export history (CSV)
        </a>
      </header>

      {!pitches || pitches.length === 0 ? (
        <div className="border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">No cycles recorded yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            History builds up one row per cycle, starting with this cycle’s pitch.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {pitches.map((pitch) => (
            <li key={pitch.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-950">
                  {pitch.previousSummary?.slice(0, 160) || 'No summary recorded'}
                </p>
                <p className="tabular mt-1 text-xs text-slate-500">
                  {pitch.submittedAt
                    ? `Submitted ${formatShortDate(pitch.submittedAt.slice(0, 10))}`
                    : 'Still a draft'}
                  {pitch.autoSubmitted ? ' · auto-submitted at the Day-85 deadline' : ''}
                </p>
              </div>
              <StatusChip tone={STATUS_TONE[pitch.status]} label={pitch.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
