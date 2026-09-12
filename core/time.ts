/**
 * Date-only time helpers.
 *
 * Every calendar, rotation and trial rule in this system is expressed in whole
 * days ("Day 81 of 90", "the 30-day correction period", "end_date"), so all
 * date math in the platform goes through these helpers using **UTC, date-only**
 * values. Mixing local-time `Date` arithmetic with day boundaries is the single
 * most common source of off-by-one-day bugs in this product class (is it Day 80
 * or Day 81?), so raw `new Date()` comparisons are deliberately not used
 * anywhere in domain code.
 */

export type ISODate = string; // 'YYYY-MM-DD'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return false;
  // Date.parse silently rolls over impossible calendar dates (2026-02-29
  // becomes 2026-03-01), so the value must survive a round-trip to be valid.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Parse an ISO date into a UTC-midnight Date. Throws on malformed input. */
export function parseISODate(date: ISODate): Date {
  if (!isISODate(date)) {
    throw new TypeError(`Invalid ISO date: ${String(date)} (expected YYYY-MM-DD)`);
  }
  return new Date(`${date}T00:00:00Z`);
}

/** Format a Date (or timestamp) as an ISO date using UTC calendar fields. */
export function toISODate(date: Date | number | string = new Date()): ISODate {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date: ${String(date)}`);
  }
  return d.toISOString().slice(0, 10);
}

/** Today's date in UTC. Injectable for tests via the `now` argument. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Add (or subtract, with a negative `days`) whole days to an ISO date. */
export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/**
 * Whole days from `start` to `end` (end - start).
 * Returns 0 for the same day, negative when `end` precedes `start`.
 */
export function daysBetween(start: ISODate, end: ISODate): number {
  const a = parseISODate(start).getTime();
  const b = parseISODate(end).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Is `date` within the inclusive range [start, end]?
 *
 * Inclusive on both ends: a role whose end_date is 2026-03-31 is still active
 * on 2026-03-31 and expires at the start of 2026-04-01.
 */
export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return daysBetween(start, date) >= 0 && daysBetween(date, end) >= 0;
}

/** Clamp a date into the inclusive range [start, end]. */
export function clampDate(date: ISODate, start: ISODate, end: ISODate): ISODate {
  if (daysBetween(start, date) < 0) return start;
  if (daysBetween(date, end) < 0) return end;
  return date;
}

export function minISODate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISODate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Long-form date for UI: "12 September 2026". */
export function formatLongDate(date: ISODate, locale = 'en-GB'): string {
  return parseISODate(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short-form date for dense tables: "12 Sep 2026". */
export function formatShortDate(date: ISODate, locale = 'en-GB'): string {
  return parseISODate(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
