/**
 * Sprint Calendar (Module 06) — the org-wide clock.
 *
 * This module is the **single source of truth** for "what day of the 90-day
 * cycle is it". Every other module calls `getCurrentPhase()` rather than
 * re-deriving day arithmetic locally, because two modules disagreeing about
 * whether it is Day 80 or Day 81 is the exact bug class that would open or close
 * the pitch window on the wrong day (06-MODULE-SPRINT-CALENDAR.md,
 * "Business logic").
 *
 * Rules implemented here:
 *  - Fixed phases: 1–3 / 4–80 / 81–85 / 86–88 / 89–90 (15-BUSINESS-RULES-APPENDIX.md).
 *  - Pause days do not count as cycle days, so they shift every later boundary
 *    forward transparently.
 *  - A cycle keeps the boundaries it was created with: configuration changes
 *    apply from the next cycle only, never retroactively.
 */

import { addDays, daysBetween, isISODate, type ISODate } from './time';

export const DEFAULT_CYCLE_LENGTH_DAYS = 90;

/** Phase boundaries are stored as the last day number of each phase. */
export const DEFAULT_PHASE_BOUNDARIES = {
  p1_end: 3,
  p2_end: 80,
  p3_end: 85, // pitch window closes
  p4_end: 88,
  p5_end: 90,
} as const;

export interface PhaseBoundaries {
  p1_end: number;
  p2_end: number;
  p3_end: number;
  p4_end: number;
  p5_end: number;
}

export type PhaseKey = 'lead_rotation' | 'execution' | 'pitch' | 'peer_review' | 'results';

export interface PhaseDefinition {
  id: 1 | 2 | 3 | 4 | 5;
  key: PhaseKey;
  name: string;
  /** Plain-language description used by the "what's happening today" card. */
  summary: string;
  startDay: number;
  endDay: number;
}

const PHASE_META: Array<Omit<PhaseDefinition, 'startDay' | 'endDay'>> = [
  {
    id: 1,
    key: 'lead_rotation',
    name: 'Pod Lead rotation + priority setting',
    summary: 'Pods elect their Pod Lead for this cycle and agree the cycle’s priorities.',
  },
  {
    id: 2,
    key: 'execution',
    name: 'Execution, automated weekly check-ins',
    summary: 'Delivery is running. Each pod logs a weekly check-in; blockers flag the coach.',
  },
  {
    id: 3,
    key: 'pitch',
    name: 'Report drafting + final pitch submission',
    summary: 'Pod Leads compile the cycle report and submit the final pitch before Day 85.',
  },
  {
    id: 4,
    key: 'peer_review',
    name: 'Peer review by rotating panel',
    summary: 'Rotating peer validators score the submitted pitches.',
  },
  {
    id: 5,
    key: 'results',
    name: 'Results announced, budget allocated',
    summary: 'Scores are published, budgets are allocated, and the next cycle begins.',
  },
];

export class CalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarError';
  }
}

/** Build the five phase definitions from a set of boundaries. */
export function phasesFor(boundaries: PhaseBoundaries): PhaseDefinition[] {
  const ends = [boundaries.p1_end, boundaries.p2_end, boundaries.p3_end, boundaries.p4_end, boundaries.p5_end];
  let start = 1;
  return PHASE_META.map((meta, index) => {
    const endDay = ends[index]!;
    const phase: PhaseDefinition = { ...meta, startDay: start, endDay };
    start = endDay + 1;
    return phase;
  });
}

/** Validate and normalise boundaries coming from JSON storage or an HTTP body. */
export function parsePhaseBoundaries(input: unknown): PhaseBoundaries {
  if (input === null || typeof input !== 'object') {
    throw new CalendarError('phase_boundaries must be an object');
  }
  const raw = input as Record<string, unknown>;
  const keys = ['p1_end', 'p2_end', 'p3_end', 'p4_end', 'p5_end'] as const;
  const parsed = {} as PhaseBoundaries;

  for (const key of keys) {
    const value = raw[key] ?? (DEFAULT_PHASE_BOUNDARIES as Record<string, number>)[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new CalendarError(`phase_boundaries.${key} must be a positive integer`);
    }
    parsed[key] = value;
  }

  const order = [parsed.p1_end, parsed.p2_end, parsed.p3_end, parsed.p4_end, parsed.p5_end];
  for (let i = 1; i < order.length; i += 1) {
    if (order[i]! <= order[i - 1]!) {
      throw new CalendarError('phase_boundaries must be strictly increasing (p1 < p2 < p3 < p4 < p5)');
    }
  }
  return parsed;
}

/** Which phase a cycle day falls in (day 1..p5_end). */
export function phaseForDay(day: number, boundaries: PhaseBoundaries): PhaseDefinition {
  const phases = phasesFor(boundaries);
  const found = phases.find((phase) => day >= phase.startDay && day <= phase.endDay);
  if (found) return found;
  // Outside the cycle: clamp to the first or last phase so callers always get
  // a usable answer rather than undefined.
  return day < 1 ? phases[0]! : phases[phases.length - 1]!;
}

// ---------------------------------------------------------------------------
// Pause days
// ---------------------------------------------------------------------------

export function isPauseDay(date: ISODate, pauseDays: readonly ISODate[]): boolean {
  return pauseDays.includes(date);
}

/** Pause days inside the inclusive range [from, to]. */
export function countPauseDays(
  from: ISODate,
  to: ISODate,
  pauseDays: readonly ISODate[],
): number {
  if (pauseDays.length === 0) return 0;
  let count = 0;
  for (const pause of pauseDays) {
    if (daysBetween(from, pause) >= 0 && daysBetween(pause, to) >= 0) count += 1;
  }
  return count;
}

/** The date on which cycle-day `day` falls, skipping pause days. */
export function dateForCycleDay(
  startDate: ISODate,
  day: number,
  pauseDays: readonly ISODate[] = [],
): ISODate {
  if (day <= 0) return startDate;
  let date = startDate;
  let counted = 0;
  // Bound the loop so a corrupt configuration can never spin forever.
  const maxIterations = day + pauseDays.length + 3660;
  for (let i = 0; i < maxIterations; i += 1) {
    if (!isPauseDay(date, pauseDays)) {
      counted += 1;
      if (counted === day) return date;
    }
    date = addDays(date, 1);
  }
  throw new CalendarError(`Could not resolve cycle day ${day} — check the cycle configuration`);
}

/** The calendar end date of a cycle of `cycleLengthDays` counted days. */
export function computeCycleEndDate(
  startDate: ISODate,
  cycleLengthDays: number,
  pauseDays: readonly ISODate[] = [],
): ISODate {
  return dateForCycleDay(startDate, cycleLengthDays, pauseDays);
}

export interface SprintCycleLike {
  startDate: ISODate;
  endDate: ISODate;
  phaseBoundaries: PhaseBoundaries;
  pauseDays: readonly ISODate[];
}

export interface ResolvedCycleDay {
  /** Cycle day number, excluding pause days. 0 when the date precedes the cycle. */
  day: number;
  isPauseDay: boolean;
  /** How many pause days have been applied so far (drives the "Adjusted for N pause day(s)" label). */
  pauseDaysApplied: number;
  isBeforeCycle: boolean;
  /** Past the cycle's last counted day (the cycle is over or overdue). */
  isAfterCycle: boolean;
}

export function resolveCycleDay(cycle: SprintCycleLike, date: ISODate): ResolvedCycleDay {
  const calendarDays = daysBetween(cycle.startDate, date) + 1;
  if (calendarDays <= 0) {
    return { day: 0, isPauseDay: false, pauseDaysApplied: 0, isBeforeCycle: true, isAfterCycle: false };
  }

  const applied = countPauseDays(cycle.startDate, date, cycle.pauseDays);
  const day = calendarDays - applied;
  const pausedToday = isPauseDay(date, cycle.pauseDays);
  const lastDay = cycle.phaseBoundaries.p5_end;

  return {
    day: Math.max(0, day),
    isPauseDay: pausedToday,
    pauseDaysApplied: applied,
    isBeforeCycle: false,
    isAfterCycle: !pausedToday && day > lastDay,
  };
}

export interface CyclePhaseState {
  day: number;
  phase: PhaseDefinition;
  isPauseDay: boolean;
  pauseDaysApplied: number;
  isBeforeCycle: boolean;
  isAfterCycle: boolean;
  /** Whole days left in the current phase (0 on the last day of the phase). */
  daysRemainingInPhase: number;
  daysRemainingInCycle: number;
  cycleStartDate: ISODate;
  cycleEndDate: ISODate;
  /** Date on which the current phase ends, pause days included. */
  phaseEndDate: ISODate;
  progress: number;
}

/** The shared phase-resolution function every module calls. */
export function getCurrentPhase(cycle: SprintCycleLike, date: ISODate): CyclePhaseState {
  const resolved = resolveCycleDay(cycle, date);
  const phase = phaseForDay(
    Math.min(Math.max(resolved.day, 1), cycle.phaseBoundaries.p5_end),
    cycle.phaseBoundaries,
  );
  const cycleEndDate = computeCycleEndDate(
    cycle.startDate,
    cycle.phaseBoundaries.p5_end,
    cycle.pauseDays,
  );
  const totalDays = cycle.phaseBoundaries.p5_end;

  return {
    day: resolved.day,
    phase,
    isPauseDay: resolved.isPauseDay,
    pauseDaysApplied: resolved.pauseDaysApplied,
    isBeforeCycle: resolved.isBeforeCycle,
    isAfterCycle: resolved.isAfterCycle,
    daysRemainingInPhase: Math.max(0, phase.endDay - resolved.day),
    daysRemainingInCycle: Math.max(0, totalDays - resolved.day),
    cycleStartDate: cycle.startDate,
    cycleEndDate,
    phaseEndDate: dateForCycleDay(cycle.startDate, phase.endDay, cycle.pauseDays),
    progress: Math.min(1, Math.max(0, resolved.day / totalDays)),
  };
}

// ---------------------------------------------------------------------------
// Window predicates — the gates every module enforces server-side
// ---------------------------------------------------------------------------

/** Days 1–3: Pod Lead rotation window and priority setting. */
export function isPodLeadRotationWindow(day: number, boundaries: PhaseBoundaries): boolean {
  return day >= 1 && day <= boundaries.p1_end;
}

/** Days 4–80: weekly check-ins. */
export function isCheckinWindow(day: number, boundaries: PhaseBoundaries): boolean {
  return day > boundaries.p1_end && day <= boundaries.p2_end;
}

/** Days 81–85: pitch drafting and submission. */
export function isPitchWindow(day: number, boundaries: PhaseBoundaries): boolean {
  return day > boundaries.p2_end && day <= boundaries.p3_end;
}

/** Days 86–88: peer review. */
export function isPeerReviewWindow(day: number, boundaries: PhaseBoundaries): boolean {
  return day > boundaries.p3_end && day <= boundaries.p4_end;
}

/** Days 89–90: results and budget allocation. */
export function isResultsWindow(day: number, boundaries: PhaseBoundaries): boolean {
  return day > boundaries.p4_end && day <= boundaries.p5_end;
}

/**
 * The pitch auto-submit warning starts on Day 84 (the day before the last two
 * days of the window), per 03-MODULE-PODS-TEAMS.md.
 */
export function isAutoSubmitWarning(day: number, boundaries: PhaseBoundaries): boolean {
  return isPitchWindow(day, boundaries) && day >= boundaries.p3_end - 1;
}

/** Whole cycle days until the pitch deadline (negative once the window has closed). */
export function daysUntilPitchDeadline(day: number, boundaries: PhaseBoundaries): number {
  return boundaries.p3_end - day;
}

// ---------------------------------------------------------------------------
// Cycle construction
// ---------------------------------------------------------------------------

export interface Milestone {
  type: 'pod_lead_rotation' | 'pitch_open' | 'pitch_deadline' | 'review_deadline' | 'results';
  label: string;
  day: number;
  date: ISODate;
}

/** The five milestone dates of a cycle, with pause days applied. */
export function milestonesFor(cycle: SprintCycleLike): Milestone[] {
  const { startDate, phaseBoundaries: b, pauseDays } = cycle;
  return [
    {
      type: 'pod_lead_rotation',
      label: 'Pod Lead rotation window opens',
      day: 1,
      date: dateForCycleDay(startDate, 1, pauseDays),
    },
    {
      type: 'pitch_open',
      label: 'Pitch window opens',
      day: b.p2_end + 1,
      date: dateForCycleDay(startDate, b.p2_end + 1, pauseDays),
    },
    {
      type: 'pitch_deadline',
      label: 'Pitch submission deadline',
      day: b.p3_end,
      date: dateForCycleDay(startDate, b.p3_end, pauseDays),
    },
    {
      type: 'review_deadline',
      label: 'Peer review deadline',
      day: b.p4_end,
      date: dateForCycleDay(startDate, b.p4_end, pauseDays),
    },
    {
      type: 'results',
      label: 'Results announced, budget allocated',
      day: b.p5_end,
      date: dateForCycleDay(startDate, b.p5_end, pauseDays),
    },
  ];
}

/** The next cycle starts the day after this one's last counted day. */
export function nextCycleStartDate(cycle: SprintCycleLike): ISODate {
  return addDays(computeCycleEndDate(cycle.startDate, cycle.phaseBoundaries.p5_end, cycle.pauseDays), 1);
}

/** ISO-8601 date list validation for pause days. */
export function parsePauseDays(input: unknown): ISODate[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new CalendarError('pause_days must be an array of YYYY-MM-DD dates');
  const seen = new Set<ISODate>();
  for (const value of input) {
    if (!isISODate(value)) {
      throw new CalendarError(`Invalid pause day: ${String(value)} (expected YYYY-MM-DD)`);
    }
    seen.add(value);
  }
  return [...seen].sort();
}
