/**
 * Org-wide sprint calendar (`/calendar/org`).
 *
 * The single place to answer "what phase is the organisation in, and how many
 * days are left". Pause days are stated on this screen rather than hidden in an
 * admin view, because they change everybody's dates
 * (06-MODULE-SPRINT-CALENDAR.md).
 */

import Link from 'next/link';
import { CycleWheel, PhaseLegend, PipelineBar } from '../../../components/calendar/CycleWheel';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import { formatShortDate, daysBetween } from '../../../core/time';
import { phasesFor, type PhaseDefinition } from '../../../core/calendar';
import type { ApiMe } from '../../../lib/types';

export const dynamic = 'force-dynamic';

interface CalendarPayload {
  cycleId: string;
  cycleNumber: number;
  day: number;
  cycleStartDate: string;
  cycleEndDate: string;
  phaseEndDate: string;
  daysRemainingInPhase: number;
  daysRemainingInCycle: number;
  pauseDaysApplied: number;
  pauseDays: string[];
  isPauseDay: boolean;
  phase: PhaseDefinition;
  phaseBoundaries: { p1_end: number; p2_end: number; p3_end: number; p4_end: number; p5_end: number };
  milestones: Array<{ type: string; label: string; day: number; date: string }>;
}

export default async function OrgCalendarPage() {
  const token = await getSessionToken();
  const [calendar, me] = await Promise.all([
    apiRequestOrNull<CalendarPayload>('/api/calendar/current?scope=org', { token }),
    apiRequestOrNull<ApiMe>('/api/me', { token }),
  ]);

  if (!calendar) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl text-ink-950">Sprint Calendar</h1>
        <div className="mt-4 border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">No sprint cycle has been started yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            The Architecture Hub starts the first cycle from the Hub Console; until then no module
            knows what day of the cycle it is.
          </p>
        </div>
      </div>
    );
  }

  const phases = phasesFor(calendar.phaseBoundaries);
  const totalDays = calendar.phaseBoundaries.p5_end;
  const upcoming = calendar.milestones
    .filter((milestone) => milestone.day >= calendar.day)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Sprint Calendar</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Cycle {calendar.cycleNumber} · {formatShortDate(calendar.cycleStartDate)} –{' '}
          {formatShortDate(calendar.cycleEndDate)}. All pods are synchronised to this calendar, which
          is what makes their scores comparable.
        </p>
      </header>

      {calendar.pauseDaysApplied > 0 ? (
        <p
          role="status"
          className="mb-4 border border-line-200 bg-white px-3 py-2 text-sm text-ink-700"
        >
          Adjusted for {calendar.pauseDaysApplied} pause day
          {calendar.pauseDaysApplied === 1 ? '' : 's'} — the cycle is extended, day numbering is
          unchanged.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <div className="border border-line-200 bg-white p-4">
            <CycleWheel
              phases={phases}
              day={calendar.day}
              totalDays={totalDays}
              label={calendar.phase.name}
            />
            <div className="xs:hidden">
              <PipelineBar phases={phases} day={calendar.day} totalDays={totalDays} />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              {calendar.isPauseDay
                ? 'Today is a pause day — it does not count as a cycle day.'
                : `Day ${calendar.day} of ${totalDays}`}
            </p>
          </div>
        </section>

        <section className="lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Phases</h2>
          <PhaseLegend phases={phases} day={calendar.day} />
        </section>

        <section className="space-y-4 lg:col-span-3">
          <DataCard
            label="Current phase"
            value={calendar.phase.name.split(' ').slice(0, 3).join(' ')}
            hint={calendar.phase.summary}
            tone="active"
            provenance={{
              source: 'sprint_cycle (active cycle)',
              updatedAt: formatShortDate(calendar.cycleStartDate),
              formula: `Day boundaries ${calendar.phaseBoundaries.p1_end} / ${calendar.phaseBoundaries.p2_end} / ${calendar.phaseBoundaries.p3_end} / ${calendar.phaseBoundaries.p4_end} / ${calendar.phaseBoundaries.p5_end}`,
              reference: '15-BUSINESS-RULES-APPENDIX.md',
            }}
          />
          <DataCard
            label="Days left in this phase"
            value={calendar.daysRemainingInPhase}
            tone={calendar.daysRemainingInPhase <= 3 ? 'watch' : 'neutral'}
            hint={`${calendar.daysRemainingInCycle} days left in the cycle`}
          />

          <div className="border border-line-200 bg-white p-4">
            <h3 className="text-xs text-slate-500">Pause days</h3>
            {calendar.pauseDays.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">None scheduled for this cycle.</p>
            ) : (
              <ul className="tabular mt-1 space-y-1 text-sm text-ink-950">
                {calendar.pauseDays.map((date) => (
                  <li key={date}>{formatShortDate(date)}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Upcoming milestones</h2>
          <ul className="divide-y divide-line-200 border border-line-200 bg-white">
            {upcoming.length === 0 ? (
              <li className="p-4 text-sm text-slate-500">No milestones remain in this cycle.</li>
            ) : (
              upcoming.map((milestone, index) => (
                <li key={milestone.type} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{milestone.label}</span>
                    <span className="tabular block text-xs text-slate-500">
                      Day {milestone.day} · {formatShortDate(milestone.date)} · in{' '}
                      {daysBetween(calendar.cycleStartDate, milestone.date) -
                        calendar.day +
                        1}{' '}
                      days
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip
                      tone={milestone.day === calendar.day ? 'active' : 'neutral'}
                      label={milestone.day === calendar.day ? 'Today' : 'Scheduled'}
                    />
                    <a
                      href={`/api/calendar/milestone.ics?index=${calendar.milestones.findIndex(
                        (m) => m.type === milestone.type,
                      )}`}
                      className="text-xs text-signal-600 underline"
                    >
                      Add to calendar
                    </a>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Your pods</h2>
          {!me || me.pods.length === 0 ? (
            <p className="border border-line-200 bg-white p-4 text-sm text-slate-500">
              You are not assigned to a pod yet — check with your Coaching Hub contact.
            </p>
          ) : (
            <ul className="divide-y divide-line-200 border border-line-200 bg-white">
              {me.pods.map((pod) => (
                <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                    <span className="block truncate text-xs text-slate-500">{pod.holdingName}</span>
                  </span>
                  <Link
                    href={`/calendar/pod/${pod.id}`}
                    className="shrink-0 text-xs text-signal-600 underline"
                  >
                    View pod calendar
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
