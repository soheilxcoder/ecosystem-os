/**
 * Pod overview (`/pod/:podId/overview`) — 03-MODULE-PODS-TEAMS.md screen 1.
 *
 * The pod's daily home: who is in it, who currently holds the Pod Lead seat and
 * for how much longer, this cycle's priorities, the check-in log, and the pitch
 * panel. Every rotating seat renders with its countdown.
 */

import Link from 'next/link';
import { DataCard } from '../../../../../components/ui/DataCard';
import { StatusChip, podStatusTone } from '../../../../../components/ui/StatusChip';
import { RotationBadge } from '../../../../../components/ui/RotationBadge';
import { CheckinForm, PrioritiesForm, VoteModal } from '../../../../../components/pods/PodForms';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import { formatShortDate, daysBetween } from '../../../../../core/time';
import { computeRotation, rotationLabel } from '../../../../../core/rotation';
import { isCheckinWindow, isPitchWindow, isPodLeadRotationWindow } from '../../../../../core/calendar';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  fullName: string;
  email: string;
  joinedAt: string;
}

interface OverviewPayload {
  pod: {
    id: string;
    name: string;
    categoryTag: string | null;
    status: string;
    holdingName: string;
    memberCount: number;
    trialEndDate: string | null;
  };
  members: Member[];
  phase: {
    cycleId: string;
    cycleNumber: number;
    day: number;
    cycleStartDate: string;
    cycleEndDate: string;
    phase: { name: string; summary: string };
    phaseBoundaries: { p1_end: number; p2_end: number; p3_end: number; p4_end: number; p5_end: number };
  } | null;
  checkins: Array<{
    id: string;
    weekNumber: number;
    body: string;
    atRiskFlag: boolean;
    authorUserId: string | null;
    createdAt: string;
  }>;
  election: {
    candidates: Array<{ userId: string; fullName: string; isOutgoingLead: boolean }>;
    votes: Array<{ voterUserId: string; candidateUserId: string }>;
    tieBreakRule: string;
    winnerUserId: string | null;
  } | null;
  priorities: string[];
}

interface MeRoles {
  userId: string;
  roles: Array<{ roleType: string; scopeId: string | null; endDate: string | null }>;
}

export default async function PodOverviewPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;
  const token = await getSessionToken();
  const [overview, me] = await Promise.all([
    apiRequestOrNull<OverviewPayload>(`/api/pods/${podId}/overview`, { token }),
    apiRequestOrNull<{ user: { id: string } | null; roles: MeRoles['roles']; today: string }>(
      '/api/me',
      { token },
    ),
  ]);

  if (!overview) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">This pod is not available.</p>
        <p className="mt-2 text-sm text-slate-500">
          It may not exist, or you may not have access to it.
        </p>
      </div>
    );
  }

  const { pod, phase, checkins, election, priorities } = overview;
  const today = me?.today ?? phase?.cycleStartDate ?? '2026-01-01';
  const boundaries = phase?.phaseBoundaries ?? { p1_end: 3, p2_end: 80, p3_end: 85, p4_end: 88, p5_end: 90 };
  const cycleDay = phase?.day ?? 0;

  const myRoles = me?.roles ?? [];
  const isLead = myRoles.some(
    (role) => role.roleType === 'pod_lead' && role.scopeId === podId,
  );
  const isMember = myRoles.some(
    (role) => (role.roleType === 'pod_member' || role.roleType === 'pod_lead') && role.scopeId === podId,
  );
  const currentUserId = me?.user?.id ?? null;

  // The Pod Lead seat: whichever term covers today, shown with its countdown.
  const leadFromRoles = myRoles.find((role) => role.roleType === 'pod_lead');
  const leadRotation = computeRotation(
    phase?.cycleStartDate ?? null,
    phase?.cycleEndDate ?? null,
    today,
  );

  const myVote = election?.votes.find((vote) => vote.voterUserId === currentUserId) ?? null;
  const rotationOpen = phase ? isPodLeadRotationWindow(cycleDay, boundaries) : false;
  const checkinOpen = phase ? isCheckinWindow(cycleDay, boundaries) : false;
  const pitchOpen = phase ? isPitchWindow(cycleDay, boundaries) : false;

  const memberById = new Map(overview.members.map((member) => [member.id, member]));

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink-950">{pod.name}</h1>
          <StatusChip tone={podStatusTone(pod.status)} label={pod.status} />
          {pod.categoryTag ? (
            <span className="text-sm text-slate-500">{pod.categoryTag}</span>
          ) : null}
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          {pod.holdingName} · {pod.memberCount} members
          {phase ? ` · cycle ${phase.cycleNumber}, day ${phase.day}` : ''}
        </p>
      </header>

      {!phase ? (
        <p className="mb-4 border border-status-watch/40 bg-status-watch/10 p-3 text-sm text-ink-950">
          No sprint cycle has been started, so the check-in, pitch and voting windows are all closed.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Pod Lead panel */}
        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Pod Lead</h2>
          <div className="border border-line-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RotationBadge role="Pod Lead" info={leadRotation} />
              {leadFromRoles ? (
                <span className="tabular text-xs text-slate-500">
                  {formatShortDate(phase?.cycleStartDate ?? today)} →{' '}
                  {formatShortDate(phase?.cycleEndDate ?? today)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {election?.winnerUserId && memberById.get(election.winnerUserId)
                ? `${memberById.get(election.winnerUserId)!.fullName} holds the seat for this cycle.`
                : 'The seat rotates every cycle by member vote — it is never a permanent title.'}
            </p>

            {rotationOpen && election ? (
              <div className="mt-3 border-t border-line-200 pt-3">
                <VoteModal
                  podId={pod.id}
                  candidates={election.candidates}
                  tieBreakRule={election.tieBreakRule}
                  currentVote={myVote?.candidateUserId ?? null}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {election.votes.length} of {overview.members.length} members have voted.
                </p>
              </div>
            ) : (
              <p className="mt-3 border-t border-line-200 pt-3 text-xs text-slate-500">
                Voting opens on Day 1 of the next cycle.
              </p>
            )}

            <details className="mt-3 border-t border-line-200 pt-2">
              <summary className="cursor-pointer text-sm text-signal-600">
                View rotation history
              </summary>
              <p className="mt-2 text-sm text-slate-500">
                Rotation history is recorded per cycle and shown here as terms are completed.
              </p>
            </details>
          </div>
        </section>

        {/* Priorities */}
        <section className="lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-700">This cycle’s priorities</h2>
          <div className="border border-line-200 bg-white p-4">
            {priorities.length === 0 ? (
              <p className="text-sm text-slate-500">
                No priorities set yet. The Pod Lead sets three to five during Days 1–3.
              </p>
            ) : null}
            <PrioritiesForm
              podId={pod.id}
              initial={priorities}
              disabled={!isLead || !rotationOpen}
            />
          </div>
        </section>

        {/* Cycle position */}
        <section className="lg:col-span-3">
          <DataCard
            label="Cycle day"
            value={phase?.day ?? '—'}
            unit={phase ? `of ${boundaries.p5_end}` : undefined}
            tone="active"
            hint={phase?.phase.summary}
            footer={
              <Link href={`/calendar/pod/${pod.id}`} className="text-xs text-signal-600 underline">
                View pod calendar
              </Link>
            }
          />
        </section>

        {/* Check-ins */}
        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Weekly check-ins</h2>
          <div className="space-y-3">
            {isMember ? (
              <CheckinForm podId={pod.id} disabled={!checkinOpen} />
            ) : (
              <p className="text-sm text-slate-500">
                Only members of this pod can log a check-in.
              </p>
            )}

            {checkins.length === 0 ? (
              <p className="border border-line-200 bg-white p-4 text-sm text-slate-500">
                No check-ins this cycle. The first one is due in week 1 of the execution window.
              </p>
            ) : (
              <ol className="divide-y divide-line-200 border border-line-200 bg-white">
                {checkins.map((checkin) => (
                  <li key={checkin.id} className="flex gap-3 p-3">
                    <span className="tabular w-16 shrink-0 text-xs text-slate-500">
                      W{checkin.weekNumber}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink-950">{checkin.body}</span>
                      <span className="tabular mt-1 block text-xs text-slate-500">
                        {checkin.authorUserId
                          ? memberById.get(checkin.authorUserId)?.fullName ?? 'Former member'
                          : 'Auto-logged'}
                        {' · '}
                        {formatShortDate(checkin.createdAt.slice(0, 10))}
                        {checkin.atRiskFlag ? ' · flagged at risk' : ''}
                      </span>
                    </span>
                    {checkin.atRiskFlag ? (
                      <StatusChip tone="watch" label="At risk" />
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* Pitch panel */}
        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Pitch</h2>
          <div className="border border-line-200 bg-white p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Window</dt>
                <dd className="tabular text-ink-950">
                  Days {boundaries.p2_end + 1}–{boundaries.p3_end}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Current day</dt>
                <dd className="tabular text-ink-950">{phase?.day ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusChip
                    tone={pitchOpen ? 'active' : 'neutral'}
                    label={pitchOpen ? 'Open' : rotationLabel(computeRotation(null, null, today)) === '' ? 'Closed' : 'Closed'}
                  />
                </dd>
              </div>
            </dl>

            <div className="mt-3 border-t border-line-200 pt-3">
              {phase ? (
                <Link
                  href={`/pod/${pod.id}/pitch/${phase.cycleId}`}
                  className={`inline-block rounded px-3 py-1.5 text-sm font-medium ${
                    pitchOpen && isLead
                      ? 'bg-signal-600 text-white hover:bg-signal-700'
                      : 'border border-line-300 text-slate-500'
                  }`}
                  aria-disabled={!(pitchOpen && isLead)}
                >
                  Open pitch editor
                </Link>
              ) : null}
              {!pitchOpen ? (
                <p className="mt-2 text-xs text-slate-500">
                  {phase && cycleDay < boundaries.p2_end + 1
                    ? `Opens on Day ${boundaries.p2_end + 1} — in ${boundaries.p2_end + 1 - cycleDay} days.`
                    : 'The submission window has closed for this cycle.'}
                </p>
              ) : !isLead ? (
                <p className="mt-2 text-xs text-slate-500">
                  Only the current Pod Lead can edit and submit the pitch.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Members */}
        <section className="lg:col-span-12">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Members</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overview.members.map((member) => {
              const tenure = daysBetween(member.joinedAt, today);
              return (
                <li
                  key={member.id}
                  className="flex items-start justify-between gap-2 border border-line-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{member.fullName}</span>
                    <span className="tabular block text-xs text-slate-500">
                      In this pod for {Math.max(0, Math.floor(tenure / 30))} months
                    </span>
                  </span>
                  {member.id === election?.winnerUserId ? (
                    <StatusChip tone="good" label="Pod Lead" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
