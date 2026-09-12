/** Pod members (`/pod/:podId/members`). */

import { StatusChip, podStatusTone } from '../../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import { formatShortDate, daysBetween } from '../../../../../core/time';

export const dynamic = 'force-dynamic';

interface OverviewPayload {
  pod: { id: string; name: string; status: string; holdingName: string };
  members: Array<{ id: string; fullName: string; email: string; joinedAt: string }>;
  phase: { cycleStartDate: string } | null;
  election: { winnerUserId: string | null } | null;
}

export default async function PodMembersPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;
  const token = await getSessionToken();
  const overview = await apiRequestOrNull<OverviewPayload>(`/api/pods/${podId}/overview`, { token });

  if (!overview) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">This pod is not available.</p>
      </div>
    );
  }

  const today = overview.phase?.cycleStartDate ?? '2026-01-01';

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink-950">{overview.pod.name} · Members</h1>
          <StatusChip tone={podStatusTone(overview.pod.status)} label={overview.pod.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          No permanent titles exist in this model — only rotating seats with end dates.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {overview.members.map((member) => (
          <li key={member.id} className="border border-line-200 bg-white p-4">
            <p className="text-sm font-medium text-ink-950">{member.fullName}</p>
            <p className="truncate text-xs text-slate-500">{member.email}</p>
            <p className="tabular mt-2 text-xs text-slate-500">
              Joined {formatShortDate(member.joinedAt)} ·{' '}
              {Math.max(0, Math.floor(daysBetween(member.joinedAt, today) / 30))} months in the pod
            </p>
            {member.id === overview.election?.winnerUserId ? (
              <div className="mt-2">
                <StatusChip tone="good" label="Pod Lead this cycle" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
