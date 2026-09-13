/**
 * Track 1 — 90-Day Entry Rule.
 *
 * The shape of this track is the point: a straight line from Day 0 to Day 90
 * with no intermediate correction stages, and a decision that needs *both*
 * sides to agree before the unit continues.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, daysBetween } from '../../core/time';
import {
  ENTRY_RESULT_LABELS,
  ENTRY_TRIAL_DAYS,
  RECOMMENDATION_LABELS,
  combineEntryDecision,
  criteriaProgress,
  daysUntilEntryDecision,
  entryDecisionDueDate,
  isEntryDecisionUnlocked,
  isEntryRecommendation,
  trialDayOf,
  type TrialCriterion,
} from '../../core/entry-trial';

describe('the 90-day clock', () => {
  it('Day 0 is the entry date and Day 90 is the decision date', () => {
    expect(entryDecisionDueDate('2026-01-01')).toBe('2026-04-01'); // 31+28+31 = 90
    expect(trialDayOf('2026-01-01', '2026-01-01')).toBe(0);
    expect(trialDayOf('2026-01-01', '2026-04-01')).toBe(90);
  });

  it('the countdown reaches zero exactly on the due date', () => {
    expect(daysUntilEntryDecision('2026-01-01', '2026-01-01')).toBe(90);
    expect(daysUntilEntryDecision('2026-01-01', '2026-03-31')).toBe(1);
    expect(daysUntilEntryDecision('2026-01-01', '2026-04-01')).toBe(0);
    expect(daysUntilEntryDecision('2026-01-01', '2026-04-05')).toBe(-4);
  });

  it('property: the decision unlocks on Day 90 and never before', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_000 }),
        fc.integer({ min: -200, max: 200 }),
        (startOffset, offset) => {
          const startDate = addDays('2020-01-01', startOffset);
          const todayDate = addDays(startDate, offset);
          return (
            isEntryDecisionUnlocked(startDate, todayDate) ===
            daysBetween(startDate, todayDate) >= ENTRY_TRIAL_DAYS
          );
        },
      ),
      { numRuns: 400 },
    );
  });

  it('property: the decision date is always exactly 90 days after entry', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3_000 }), (offset) => {
        const startDate = addDays('2020-01-01', offset);
        return (
          daysBetween(startDate, entryDecisionDueDate(startDate)) === ENTRY_TRIAL_DAYS &&
          daysUntilEntryDecision(startDate, entryDecisionDueDate(startDate)) === 0
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe('entry criteria', () => {
  const criteria: TrialCriterion[] = [
    { label: 'Delivered the pilot', met: true },
    { label: 'Signed one CLOU', met: false },
    { label: 'Nominated a lead', met: true },
    { label: 'Optional extra', met: null },
  ];

  it('counts met, outstanding and not-applicable separately', () => {
    expect(criteriaProgress(criteria)).toEqual({
      total: 4,
      met: 2,
      outstanding: 1,
      notApplicable: 1,
    });
  });

  it('property: the three buckets always add up to the total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record<TrialCriterion>({ label: fc.string({ minLength: 1 }), met: fc.constantFrom(true, false, null) }),
          { maxLength: 20 },
        ),
        (list) => {
          const progress = criteriaProgress(list);
          return (
            progress.met + progress.outstanding + progress.notApplicable === progress.total &&
            progress.total === list.length
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('the bilateral decision', () => {
  it('is not a decision until both sides have spoken', () => {
    expect(combineEntryDecision('join', null)).toBeNull();
    expect(combineEntryDecision(null, 'join')).toBeNull();
    expect(combineEntryDecision(null, null)).toBeNull();
  });

  it('continues only when both the pod and the hub want it', () => {
    expect(combineEntryDecision('join', 'join')).toBe('full_entry');
  });

  it('one "do not continue" is enough to end the unit', () => {
    expect(combineEntryDecision('discontinue', 'join')).toBe('discontinued');
    expect(combineEntryDecision('join', 'discontinue')).toBe('discontinued');
    expect(combineEntryDecision('discontinue', 'discontinue')).toBe('discontinued');
  });

  it('says out loud that no correction period applies', () => {
    expect(ENTRY_RESULT_LABELS.discontinued).toMatch(/no correction period applies \(Entry Rule\)/);
    expect(ENTRY_RESULT_LABELS.full_entry).toBe('RESULT: Full entry');
  });

  it('each recommendation has a readable label', () => {
    expect(RECOMMENDATION_LABELS.join).toBe('Join fully');
    expect(RECOMMENDATION_LABELS.discontinue).toBe('Do not continue');
  });

  it('validates the recommendation vocabulary', () => {
    expect(isEntryRecommendation('join')).toBe(true);
    expect(isEntryRecommendation('maybe')).toBe(false);
    expect(isEntryRecommendation(null)).toBe(false);
  });
});
