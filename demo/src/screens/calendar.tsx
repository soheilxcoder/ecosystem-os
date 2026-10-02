/**
 * Sprint Calendar — where the organisation is in time, adapted from the live
 * page: the cycle wheel, the phase legend, milestones and pause days.
 */
import { CycleWheel, PhaseLegend, PipelineBar } from '../../../components/calendar/CycleWheel';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { phasesFor, phaseForDay } from '../../../core/calendar';
import { daysBetween, formatShortDate } from '../../../core/time';
import {
  CYCLE_DAY,
  CYCLE_END,
  CYCLE_NUMBER,
  CYCLE_START,
  MILESTONES,
  PHASE_BOUNDARIES,
  PODS,
} from '../data';

const boundaries = { ...PHASE_BOUNDARIES, p5_end: 90 };
const phases = phasesFor(boundaries);
const phase = phaseForDay(CYCLE_DAY, boundaries);
const daysRemainingInPhase = phase.endDay - CYCLE_DAY;
const daysRemainingInCycle = 90 - CYCLE_DAY;
const upcoming = MILESTONES.filter((m) => m.day >= CYCLE_DAY);

export function CalendarScreen() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Sprint Calendar</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Cycle {CYCLE_NUMBER} · {formatShortDate(CYCLE_START)} – {formatShortDate(CYCLE_END)}.
          All pods are synchronised to this calendar, which is what makes their scores comparable.
        </p>
      </header>

      <p role="status" className="mb-4 border border-line-200 bg-white px-3 py-2 text-sm text-ink-700">
        Adjusted for 1 pause day — the cycle is extended, day numbering is unchanged.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <div className="border border-line-200 bg-white p-4">
            <CycleWheel phases={phases} day={CYCLE_DAY} totalDays={90} label={phase.name} />
            <div className="xs:hidden">
              <PipelineBar phases={phases} day={CYCLE_DAY} totalDays={90} />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">Day {CYCLE_DAY} of 90</p>
          </div>
        </section>

        <section className="lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Phases</h2>
          <PhaseLegend phases={phases} day={CYCLE_DAY} />
        </section>

        <section className="space-y-4 lg:col-span-3">
          <DataCard
            label="Current phase"
            value={phase.name.split(' ').slice(0, 3).join(' ')}
            hint={phase.summary}
            tone="active"
            provenance={{
              source: 'sprint_cycle (active cycle)',
              updatedAt: formatShortDate(CYCLE_START),
              formula: `Day boundaries ${boundaries.p1_end} / ${boundaries.p2_end} / ${boundaries.p3_end} / ${boundaries.p4_end} / 90`,
              reference: '15-BUSINESS-RULES-APPENDIX.md',
            }}
          />
          <DataCard
            label="Days left in this phase"
            value={daysRemainingInPhase}
            tone={daysRemainingInPhase <= 3 ? 'watch' : 'neutral'}
            hint={`${daysRemainingInCycle} days left in the cycle`}
          />

          <div className="border border-line-200 bg-white p-4">
            <h3 className="text-xs text-slate-500">Pause days</h3>
            <ul className="tabular mt-1 space-y-1 text-sm text-ink-950">
              <li>2026-08-21</li>
            </ul>
          </div>
        </section>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Upcoming milestones</h2>
          <ul className="divide-y divide-line-200 border border-line-200 bg-white">
            {upcoming.length === 0 ? (
              <li className="p-4 text-sm text-slate-500">No milestones remain in this cycle.</li>
            ) : (
              upcoming.map((milestone) => (
                <li key={milestone.type} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">{milestone.label}</span>
                    <span className="tabular block text-xs text-slate-500">
                      Day {milestone.day} · {formatShortDate(milestone.date)} · in{' '}
                      {daysBetween(CYCLE_START, milestone.date) - CYCLE_DAY + 1} days
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip
                      tone={milestone.day === CYCLE_DAY ? 'active' : 'neutral'}
                      label={milestone.day === CYCLE_DAY ? 'Today' : 'Scheduled'}
                    />
                    <span className="text-xs text-slate-500">Add to calendar</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">Pods on this calendar</h2>
          <ul className="divide-y divide-line-200 border border-line-200 bg-white">
            {PODS.map((pod) => (
              <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                  <span className="block truncate text-xs text-slate-500">{pod.holdingName}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  Day {CYCLE_DAY} of 90
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
