/**
 * 90-Day Entry Rule — one of Module 08's two governance state machines.
 *
 * Deliberately its own file, its own table and its own set of terms: the source
 * model is emphatic that this track must never share a state machine or a UI
 * component with the Accountability Path. There is no correction period here,
 * by design — a failed trial ends immediately.
 */

import type { ISODate } from './time';
import { addDays, daysBetween } from './time';

export const ENTRY_TRIAL_DAYS = 90;

/** `{label, met}` where `met === null` means "not applicable". */
export interface TrialCriterion {
  label: string;
  met: boolean | null;
}

export type EntryRecommendation = 'join' | 'discontinue';
export type EntryResult = 'full_entry' | 'discontinued';

export const RECOMMENDATION_LABELS: Record<EntryRecommendation, string> = {
  join: 'Join fully',
  discontinue: 'Do not continue',
};

export const ENTRY_RESULT_LABELS: Record<EntryResult, string> = {
  full_entry: 'RESULT: Full entry',
  discontinued: 'RESULT: Discontinued — no correction period applies (Entry Rule).',
};

/** Day 0 is the entry date, so "Day 90" is 90 days later. */
export function entryDecisionDueDate(startDate: ISODate): ISODate {
  return addDays(startDate, ENTRY_TRIAL_DAYS);
}

/** Which day of its trial a pod is on (0 on the entry date). */
export function trialDayOf(startDate: ISODate, today: ISODate): number {
  return daysBetween(startDate, today);
}

export function isEntryDecisionUnlocked(startDate: ISODate, today: ISODate): boolean {
  return trialDayOf(startDate, today) >= ENTRY_TRIAL_DAYS;
}

/** Whole days until the Day-90 decision (negative once overdue). */
export function daysUntilEntryDecision(startDate: ISODate, today: ISODate): number {
  return ENTRY_TRIAL_DAYS - trialDayOf(startDate, today);
}

export interface CriteriaProgress {
  total: number;
  met: number;
  outstanding: number;
  notApplicable: number;
}

export function criteriaProgress(criteria: readonly TrialCriterion[]): CriteriaProgress {
  const total = criteria.length;
  const met = criteria.filter((criterion) => criterion.met === true).length;
  const notApplicable = criteria.filter((criterion) => criterion.met === null).length;
  return { total, met, outstanding: total - met - notApplicable, notApplicable };
}

/**
 * The bilateral decision.
 *
 * Both sides — the pod's own representative and a Deployment Hub member —
 * record a recommendation independently. Continuing the trial requires *both*
 * to want it: any "do not continue" ends the unit, which is what "no correction
 * period applies" means in practice. Until both are recorded there is no joint
 * decision at all, and nothing is stamped.
 */
export function combineEntryDecision(
  podRep: EntryRecommendation | null,
  hubRep: EntryRecommendation | null,
): EntryResult | null {
  if (!podRep || !hubRep) return null;
  return podRep === 'join' && hubRep === 'join' ? 'full_entry' : 'discontinued';
}

export function isEntryRecommendation(value: unknown): value is EntryRecommendation {
  return value === 'join' || value === 'discontinue';
}

/** A decided trial is frozen: only a new, separately logged record may revisit it. */
export function canRecordRecommendation(
  existing: EntryRecommendation | null,
  decidedAt: string | null,
): boolean {
  return decidedAt === null;
}
