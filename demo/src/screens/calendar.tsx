/**
 * Sprint Calendar — where the organisation is in time: the cycle wheel, the
 * phase legend, milestones and pause days. Fully bilingual (phase names and
 * summaries come from the translation table; layout maths from core/calendar).
 */
import { CycleWheel, PipelineBar } from '../../../components/calendar/CycleWheel';
import { StatusChip } from '../../../components/ui/StatusChip';
import { phasesFor } from '../../../core/calendar';
import type { PhaseDefinition } from '../../../core/calendar';
import { daysBetween } from '../../../core/time';
import { PhaseLegendI18n } from '../components/primitives';
import { DataCardI18n } from '../components/primitives';
import {
  CYCLE_DAY,
  CYCLE_END,
  CYCLE_NUMBER,
  CYCLE_START,
  MILESTONES,
  PHASE_BOUNDARIES,
  PODS,
} from '../data';
import { useI18n, type I18n } from '../i18n';
import { useNames } from '../i18n/names';
import type { StringKey } from '../i18n/translations';

const boundaries = { ...PHASE_BOUNDARIES, p5_end: 90 };

/** Same boundaries as core/calendar, with translated names and summaries. */
function translatedPhases(t: I18n['t']): PhaseDefinition[] {
  return phasesFor(boundaries).map((phase) => ({
    ...phase,
    name: t(`phase.${phase.key}` as StringKey),
    summary: t(`phase.${phase.key}.summary` as StringKey),
  }));
}

export function CalendarScreen() {
  const { t, num, date } = useI18n();
  const names = useNames();

  const phases = translatedPhases(t);
  const phase = phases.find((p) => CYCLE_DAY >= p.startDay && CYCLE_DAY <= p.endDay)!;
  const daysRemainingInPhase = phase.endDay - CYCLE_DAY;
  const daysRemainingInCycle = 90 - CYCLE_DAY;
  const upcoming = MILESTONES.filter((m) => m.day >= CYCLE_DAY);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('calendar.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          {t('calendar.sub', {
            cycle: num(CYCLE_NUMBER),
            start: date(CYCLE_START),
            end: date(CYCLE_END),
          })}
        </p>
      </header>

      <p role="status" className="mb-4 border border-line-200 bg-white px-3 py-2 text-sm text-ink-700">
        {t('calendar.pauseNote')}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <div className="border border-line-200 bg-white p-4">
            <CycleWheel phases={phases} day={CYCLE_DAY} totalDays={90} label={phase.name} />
            <div className="xs:hidden">
              <PipelineBar phases={phases} day={CYCLE_DAY} totalDays={90} />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              {t('calendar.wheelLabel', { day: num(CYCLE_DAY), total: num(90) })}
            </p>
          </div>
        </section>

        <section className="lg:col-span-4">
          <h2 className="mb-2 text-sm font-medium text-ink-700">{t('calendar.phases')}</h2>
          <PhaseLegendI18n phases={phases} day={CYCLE_DAY} />
        </section>

        <section className="space-y-4 lg:col-span-3">
          <DataCardI18n
            label={t('calendar.currentPhase')}
            value={phase.name}
            hint={phase.summary}
            tone="active"
            provenance={{
              source: 'sprint_cycle (active cycle)',
              updatedAt: date(CYCLE_START),
              formula: t('calendar.provFormula', {
                b1: boundaries.p1_end,
                b2: boundaries.p2_end,
                b3: boundaries.p3_end,
                b4: boundaries.p4_end,
                b5: 90,
              }),
              reference: '15-BUSINESS-RULES-APPENDIX.md',
            }}
          />
          <DataCardI18n
            label={t('calendar.daysLeftPhase')}
            value={num(daysRemainingInPhase)}
            tone={daysRemainingInPhase <= 3 ? 'watch' : 'neutral'}
            hint={t('calendar.daysLeftCycle', { n: num(daysRemainingInCycle) })}
          />

          <div className="border border-line-200 bg-white p-4">
            <h3 className="text-xs text-slate-500">{t('calendar.pauseDays')}</h3>
            <ul className="tabular mt-1 space-y-1 text-sm text-ink-950">
              <li>{date('2026-08-21')}</li>
            </ul>
          </div>
        </section>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">{t('calendar.milestones')}</h2>
          <ul className="divide-y divide-line-200 border border-line-200 bg-white">
            {upcoming.length === 0 ? (
              <li className="p-4 text-sm text-slate-500">{t('calendar.none')}</li>
            ) : (
              upcoming.map((milestone) => (
                <li key={milestone.type} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-950">
                      {t(`milestone.${milestone.type}` as StringKey)}
                    </span>
                    <span className="tabular block text-xs text-slate-500">
                      {t('calendar.inDays', {
                        day: num(milestone.day),
                        date: date(milestone.date),
                        n: num(daysBetween(CYCLE_START, milestone.date) - CYCLE_DAY + 1),
                      })}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip
                      tone={milestone.day === CYCLE_DAY ? 'active' : 'neutral'}
                      label={milestone.day === CYCLE_DAY ? t('calendar.today') : t('calendar.scheduled')}
                    />
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">{t('calendar.pods')}</h2>
          <ul className="divide-y divide-line-200 border border-line-200 bg-white">
            {PODS.map((pod) => (
              <li key={pod.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">{names.podName(pod.id)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {names.holdingByName(pod.holdingName)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {t('calendar.dayOf90', { day: num(CYCLE_DAY) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
