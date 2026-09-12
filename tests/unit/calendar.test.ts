/**
 * Calendar tests — 13-TECHNICAL-ARCHITECTURE.md §9 priority 2.
 *
 * "Sprint Calendar phase resolution … including pause-day handling and the
 * 'changes apply next cycle only' rule."
 *
 * The Day 80 / Day 81 boundary is where the pitch window opens, so the boundary
 * arithmetic is pinned down from every direction, including property tests that
 * assert no day can ever belong to two phases.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CalendarError,
  DEFAULT_CYCLE_LENGTH_DAYS,
  DEFAULT_PHASE_BOUNDARIES,
  computeCycleEndDate,
  countPauseDays,
  dateForCycleDay,
  daysUntilPitchDeadline,
  getCurrentPhase,
  isAutoSubmitWarning,
  isCheckinWindow,
  isPeerReviewWindow,
  isPitchWindow,
  isPodLeadRotationWindow,
  isResultsWindow,
  milestonesFor,
  nextCycleStartDate,
  parsePauseDays,
  parsePhaseBoundaries,
  phaseForDay,
  phasesFor,
  resolveCycleDay,
  type PhaseBoundaries,
  type SprintCycleLike,
} from '../../core/calendar';
import { addDays } from '../../core/time';

const B: PhaseBoundaries = { ...DEFAULT_PHASE_BOUNDARIES };

function cycle(overrides: Partial<SprintCycleLike> = {}): SprintCycleLike {
  const startDate = overrides.startDate ?? '2026-01-01';
  const pauseDays = overrides.pauseDays ?? [];
  const boundaries = overrides.phaseBoundaries ?? B;
  return {
    startDate,
    endDate: computeCycleEndDate(startDate, boundaries.p5_end, pauseDays),
    phaseBoundaries: boundaries,
    pauseDays,
  };
}

/** The date on which a cycle day falls, for a cycle starting 2026-01-01. */
const day = (n: number, pauseDays: string[] = []) => dateForCycleDay('2026-01-01', n, pauseDays);

describe('phase definitions', () => {
  it('uses the five phases from the appendix', () => {
    const phases = phasesFor(B);
    expect(phases.map((p) => [p.startDay, p.endDay])).toEqual([
      [1, 3],
      [4, 80],
      [81, 85],
      [86, 88],
      [89, 90],
    ]);
    expect(phases.map((p) => p.key)).toEqual([
      'lead_rotation',
      'execution',
      'pitch',
      'peer_review',
      'results',
    ]);
  });

  it('places every day from 1 to p5_end in exactly one phase', () => {
    for (let d = 1; d <= B.p5_end; d += 1) {
      const matches = phasesFor(B).filter((p) => d >= p.startDay && d <= p.endDay);
      expect(matches.length, `day ${d}`).toBe(1);
    }
  });

  it('resolves the Day 80 / Day 81 boundary exactly', () => {
    expect(phaseForDay(80, B).key).toBe('execution');
    expect(phaseForDay(81, B).key).toBe('pitch');
    expect(phaseForDay(85, B).key).toBe('pitch');
    expect(phaseForDay(86, B).key).toBe('peer_review');
    expect(phaseForDay(88, B).key).toBe('peer_review');
    expect(phaseForDay(89, B).key).toBe('results');
    expect(phaseForDay(90, B).key).toBe('results');
  });

  it('clamps days outside the cycle instead of returning undefined', () => {
    expect(phaseForDay(0, B).id).toBe(1);
    expect(phaseForDay(-10, B).id).toBe(1);
    expect(phaseForDay(999, B).id).toBe(5);
  });
});

describe('boundary validation', () => {
  it('accepts well-formed boundaries', () => {
    expect(parsePhaseBoundaries({ p1_end: 2, p2_end: 40, p3_end: 45, p4_end: 48, p5_end: 50 })).toEqual({
      p1_end: 2,
      p2_end: 40,
      p3_end: 45,
      p4_end: 48,
      p5_end: 50,
    });
  });

  it('rejects non-increasing boundaries', () => {
    expect(() => parsePhaseBoundaries({ p1_end: 5, p2_end: 5, p3_end: 85, p4_end: 88, p5_end: 90 })).toThrow(
      CalendarError,
    );
    expect(() => parsePhaseBoundaries({ p1_end: 90, p2_end: 80, p3_end: 85, p4_end: 88, p5_end: 90 })).toThrow(
      /strictly increasing/,
    );
  });

  it('rejects non-integer or missing values', () => {
    expect(() => parsePhaseBoundaries({ p1_end: 2.5 })).toThrow(CalendarError);
    expect(() => parsePhaseBoundaries({ p2_end: '80' })).toThrow(CalendarError);
    expect(() => parsePhaseBoundaries(null)).toThrow(CalendarError);
  });

  it('validates pause days and de-duplicates them', () => {
    expect(parsePauseDays(['2026-01-05', '2026-01-05', '2026-01-03'])).toEqual([
      '2026-01-03',
      '2026-01-05',
    ]);
    expect(parsePauseDays(undefined)).toEqual([]);
    expect(() => parsePauseDays(['2026-02-30'])).toThrow(CalendarError);
    expect(() => parsePauseDays(['not-a-date'])).toThrow(CalendarError);
    expect(() => parsePauseDays('2026-01-05')).toThrow(CalendarError);
  });
});

describe('cycle day resolution', () => {
  it('counts Day 1 on the start date', () => {
    expect(resolveCycleDay(cycle(), '2026-01-01').day).toBe(1);
  });

  it('reports day 0 before the cycle starts', () => {
    const state = resolveCycleDay(cycle(), '2025-12-31');
    expect(state.day).toBe(0);
    expect(state.isBeforeCycle).toBe(true);
  });

  it('counts 90 days with no pause days', () => {
    const c = cycle();
    expect(c.endDate).toBe('2026-03-31');
    expect(resolveCycleDay(c, '2026-03-31').day).toBe(90);
  });

  it('excludes a pause day from the count and shifts later days', () => {
    // A single shutdown day on 2026-01-05 pushes every later day back by one.
    const c = cycle({ pauseDays: ['2026-01-05'] });
    expect(resolveCycleDay(c, '2026-01-04').day).toBe(4);
    expect(resolveCycleDay(c, '2026-01-05').isPauseDay).toBe(true);
    expect(resolveCycleDay(c, '2026-01-06').day).toBe(5);
    // The cycle therefore ends one calendar day later.
    expect(c.endDate).toBe('2026-04-01');
  });

  it('extends the cycle end date by the number of pause days', () => {
    const pauseDays = ['2026-01-05', '2026-01-06', '2026-02-14'];
    const c = cycle({ pauseDays });
    expect(c.endDate).toBe(addDays('2026-03-31', 3));
    expect(resolveCycleDay(c, c.endDate).day).toBe(90);
  });

  it('handles a pause day on the very last day of the cycle', () => {
    const c = cycle({ pauseDays: ['2026-03-31'] });
    expect(resolveCycleDay(c, '2026-03-31').isPauseDay).toBe(true);
    expect(c.endDate).toBe('2026-04-01');
    expect(resolveCycleDay(c, '2026-04-01').day).toBe(90);
  });

  it('flags days past the last counted day', () => {
    const c = cycle();
    expect(resolveCycleDay(c, '2026-04-05').isAfterCycle).toBe(true);
  });

  it('counts pause days in a range only once', () => {
    expect(countPauseDays('2026-01-01', '2026-01-31', ['2026-01-05', '2026-01-06', '2026-02-01'])).toBe(2);
  });

  it('maps cycle days back to their calendar dates', () => {
    expect(dateForCycleDay('2026-01-01', 1)).toBe('2026-01-01');
    expect(dateForCycleDay('2026-01-01', 81)).toBe('2026-03-22');
    expect(dateForCycleDay('2026-01-01', 81, ['2026-01-05'])).toBe('2026-03-23');
  });

  it('is the inverse of resolveCycleDay for any day and pause set', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0, 1, 2, 3),
        fc.integer({ min: 1, max: 90 }),
        (pauseCount, targetDay) => {
          const pauseDays = Array.from({ length: pauseCount }, (_, i) =>
            addDays('2026-01-01', 10 + i * 7),
          );
          const c = cycle({ pauseDays });
          const date = dateForCycleDay(c.startDate, targetDay, pauseDays);
          // Skip the case where the resolved date is itself a pause day.
          if (c.pauseDays.includes(date)) return;
          expect(resolveCycleDay(c, date).day).toBe(targetDay);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('getCurrentPhase', () => {
  it('reports the phase, day and remaining days', () => {
    const c = cycle();
    const state = getCurrentPhase(c, '2026-01-15');
    expect(state.day).toBe(15);
    expect(state.phase.key).toBe('execution');
    expect(state.daysRemainingInPhase).toBe(65);
    expect(state.daysRemainingInCycle).toBe(75);
    expect(state.cycleEndDate).toBe('2026-03-31');
  });

  it('reports progress through the cycle', () => {
    expect(getCurrentPhase(cycle(), '2026-01-01').progress).toBeCloseTo(1 / 90, 6);
    expect(getCurrentPhase(cycle(), '2026-03-31').progress).toBe(1);
  });

  it('gives the phase end date with pause days applied', () => {
    // Two shutdown days immediately after Day 1 push the end of the rotation
    // window from 3 January to 5 January.
    const pauseDays = ['2026-01-02', '2026-01-03'];
    const c = cycle({ pauseDays });
    const state = getCurrentPhase(c, day(3, pauseDays));
    expect(state.phase.key).toBe('lead_rotation');
    expect(state.day).toBe(3);
    expect(state.phaseEndDate).toBe('2026-01-05');
    expect(state.pauseDaysApplied).toBe(2);
  });

  it('never lets a pause day open a window early', () => {
    // Day 80 lands on 2026-03-27 after four pause days; the pitch window must
    // still open on cycle day 81, not on the calendar date it used to fall on.
    const pauseDays = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04'];
    const c = cycle({ pauseDays });
    const day80 = dateForCycleDay(c.startDate, 80, pauseDays);
    const day81 = dateForCycleDay(c.startDate, 81, pauseDays);
    expect(getCurrentPhase(c, day80).phase.key).toBe('execution');
    expect(getCurrentPhase(c, day81).phase.key).toBe('pitch');
    expect(isPitchWindow(getCurrentPhase(c, day80).day, B)).toBe(false);
    expect(isPitchWindow(getCurrentPhase(c, day81).day, B)).toBe(true);
  });

  it('keeps day and phase consistent across a whole cycle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 90 }), (d) => {
        const c = cycle();
        const state = getCurrentPhase(c, day(d));
        expect(state.day).toBe(d);
        const phase = phaseForDay(d, B);
        expect(state.phase.id).toBe(phase.id);
        expect(state.daysRemainingInPhase).toBe(phase.endDay - d);
      }),
      { numRuns: 200 },
    );
  });

  it('never reports two phases for the same day', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (d) => {
        const windows = [
          isPodLeadRotationWindow(d, B),
          isCheckinWindow(d, B),
          isPitchWindow(d, B),
          isPeerReviewWindow(d, B),
          isResultsWindow(d, B),
        ].filter(Boolean);
        expect(windows.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });
});

describe('window predicates', () => {
  it('opens the Pod Lead rotation window on Days 1–3', () => {
    expect(isPodLeadRotationWindow(1, B)).toBe(true);
    expect(isPodLeadRotationWindow(3, B)).toBe(true);
    expect(isPodLeadRotationWindow(4, B)).toBe(false);
    expect(isPodLeadRotationWindow(0, B)).toBe(false);
  });

  it('opens check-ins on Days 4–80', () => {
    expect(isCheckinWindow(3, B)).toBe(false);
    expect(isCheckinWindow(4, B)).toBe(true);
    expect(isCheckinWindow(80, B)).toBe(true);
    expect(isCheckinWindow(81, B)).toBe(false);
  });

  it('opens the pitch window on Days 81–85 only', () => {
    expect(isPitchWindow(80, B)).toBe(false);
    expect(isPitchWindow(81, B)).toBe(true);
    expect(isPitchWindow(85, B)).toBe(true);
    expect(isPitchWindow(86, B)).toBe(false);
  });

  it('opens peer review on Days 86–88 and results on 89–90', () => {
    expect(isPeerReviewWindow(85, B)).toBe(false);
    expect(isPeerReviewWindow(86, B)).toBe(true);
    expect(isPeerReviewWindow(88, B)).toBe(true);
    expect(isResultsWindow(89, B)).toBe(true);
    expect(isResultsWindow(90, B)).toBe(true);
    expect(isResultsWindow(91, B)).toBe(false);
  });

  it('starts the auto-submit warning on Day 84', () => {
    expect(isAutoSubmitWarning(83, B)).toBe(false);
    expect(isAutoSubmitWarning(84, B)).toBe(true);
    expect(isAutoSubmitWarning(85, B)).toBe(true);
    expect(isAutoSubmitWarning(86, B)).toBe(false); // window closed: it is too late
  });

  it('counts days to the pitch deadline', () => {
    expect(daysUntilPitchDeadline(81, B)).toBe(4);
    expect(daysUntilPitchDeadline(85, B)).toBe(0);
    expect(daysUntilPitchDeadline(86, B)).toBe(-1);
  });
});

describe('milestones and cycle succession', () => {
  it('lists the five milestones with pause-aware dates', () => {
    const c = cycle({ pauseDays: ['2026-01-05'] });
    const milestones = milestonesFor(c);
    expect(milestones.map((m) => m.type)).toEqual([
      'pod_lead_rotation',
      'pitch_open',
      'pitch_deadline',
      'review_deadline',
      'results',
    ]);
    expect(milestones[1]!.day).toBe(81);
    // Day 81 is one calendar day later than it would be without the pause day.
    expect(milestones[1]!.date).toBe(addDays(day(81), 1));
  });

  it('starts the next cycle the day after this one ends', () => {
    const c = cycle();
    expect(nextCycleStartDate(c)).toBe('2026-04-01');
    const withPause = cycle({ pauseDays: ['2026-01-05'] });
    expect(nextCycleStartDate(withPause)).toBe('2026-04-02');
  });

  it('uses a 90-day default cycle length', () => {
    expect(DEFAULT_CYCLE_LENGTH_DAYS).toBe(90);
    expect(B.p5_end).toBe(90);
  });
});
