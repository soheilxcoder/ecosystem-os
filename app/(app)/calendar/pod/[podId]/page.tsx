/**
 * Per-pod sprint calendar (`/calendar/pod/:podId`).
 *
 * The same cycle as the org view, annotated with this pod's own milestones. A
 * pod still inside its 90-day entry trial shows the trial timeline instead, with
 * a label that keeps the two clearly distinct (Module 08 requires the entry rule
 * and the accountability path never to share a state machine or a component).
 */

import Link from 'next/link';
import { CycleWheel, PhaseLegend, PipelineBar } from '../../../../../components/calendar/CycleWheel';
import { DataCard } from '../../../../../components/ui/DataCard';
import { StatusChip, podStatusTone } from '../../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import { formatShortDate } from '../../../../../core/time';
import { computeRotation, rotationLabel } from '../../../../../core/rotation';
import { phasesFor, type PhaseDefinition } from '../../../../../core/calendar';

export const dynamic = 'force-dynamic';

interface CalendarPayload {
  cycleId: string;
  cycleNumber: number;
  day: number;
  cycleStartDate: string;
  cycleEndDate: string;
  daysRemainingInCycle: number;
  pauseDaysApplied: number;
  pauseDays: string[];
  phase: PhaseDefinition;
  phaseBoundaries: { p1_end: number; p2_end: number; p3_end: number; p4_end: number; p5_end: number };
  milestones: Array<{ type: string; label: string; day: number; date: string }>;
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
  members: Array<{ id: string; fullName: string; joinedAt: string }>;
  priorities: string[];
}

export default async function PodCalendarPage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const token = await getSessionToken();
  const [calendar, overview] = await Promise.all([
    apiRequestOrNull<CalendarPayload>(`/api/calendar/current?podId=${podId}`, { token }),
    apiRequestOrNull<OverviewPayload>(`/api/pods/${podId}/overview`, { token }),
  ]);

  if (!calendar || !overview) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl text-ink-950">Pod calendar</h1>
        <p className="mt-2 text-sm text-slate-500">
          This pod’s calendar is not available — either the pod does not exist, or no sprint cycle
          has been started.
        </p>
        <Link href="/calendar" className="mt-4 inline-block text-sm text-signal-600 underline">
          Back to the org calendar
        </Link>
      </div>
    );
  }

  const phases = phasesFor(calendar.phaseBoundaries);
  const totalDays = calendar.phaseBoundaries.p5_end;
  const { pod } = overview;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink-950">{pod.name}</h1>
          <StatusChip tone={podStatusTone(pod.status)} label={pod.status} />
          {pod.categoryTag ? (
            <span className="text-sm text-slate-500">{pod.categoryTag}</span>
          ) : null}
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          {pod.holdingName} · {pod.memberCount} members · cycle {calendar.cycleNumber} runs{' '}
          {formatShortDate(calendar.cycleStartDate)} – {formatShortDate(calendar.cycleEndDate)}.
        </p>
      </header>

      {pod.status === 'trial' ? (
        <div className="mb-4 border-l-2 border-status-active bg-white p-4">
          <p className="text-sm font-medium text-ink-950">
            This pod is in its entry trial — a 90-day bilateral decision, not the accountability path.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {pod.trialEndDate
              ? `Trial decision due ${formatShortDate(pod.trialEndDate)}.`
              : 'No trial end date recorded.'}{' '}
            The entry rule tracker lands with the governance module in phase 3.
          </p>
        </div>
      ) : null}

      {calendar.pauseDaysApplied > 0 ? (
        <p role="status" className="mb-4 border border-line-200 bg-white px-3 py-2 text-sm text-ink-700">
          Adjusted for {calendar.pauseDaysApplied} pause day
          {calendar.pauseDaysApplied === 1 ? '' : 's'}.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <div className="border border-line-200 bg-white p-4">
            <CycleWheel phases={phases} day={calendar.day} totalDays={totalDays} />
            <div className="xs:hidden">
              <PipelineBar phases={phases} day={calendar.day} totalDays={totalDays} />
            </div>
          </div>
        </section>

        <section className="lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Phases</h2>
          <PhaseLegend phases={phases} day={calendar.day} />
        </section>

        <section className="space-y-4 lg:col-span-3">
          <DataCard
            label="Cycle day"
            value={calendar.day}
            unit={`of ${totalDays}`}
            tone="active"
            hint={`${calendar.daysRemainingInCycle} days remaining`}
          />
          <div className="border border-line-200 bg-white p-4">
            <h3 className="text-xs text-slate-500">This pod’s milestones</h3>
            <ul className="mt-2 space-y-1">
              {calendar.milestones.map((milestone) => (
                <li key={milestone.type} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-ink-700">{milestone.label}</span>
                  <span className="tabular shrink-0 text-xs text-slate-500">
                    {formatShortDate(milestone.date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {overview.priorities.length > 0 ? (
            <div className="border border-line-200 bg-white p-4">
              <h3 className="text-xs text-slate-500">Cycle priorities</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-ink-950">
                {overview.priorities.map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        <section className="lg:col-span-12">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Members</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overview.members.map((member) => {
              const rotation = computeRotation(member.joinedAt, null, calendar.cycleStartDate);
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{member.fullName}</span>
                    <span className="tabular block text-xs text-slate-500">
                      Joined {formatShortDate(member.joinedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {rotationLabel(rotation)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
