/**
 * Day math is the backbone of every deadline in the product ("Day 81 of 90"),
 * so the helpers are pinned down here — including the UTC-boundary behaviour
 * that silently breaks naive local-time implementations.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addDays,
  clampDate,
  daysBetween,
  formatLongDate,
  isISODate,
  isWithin,
  maxISODate,
  minISODate,
  parseISODate,
  toISODate,
  todayISO,
} from '../../core/time';

/** Arbitrary valid UTC-midnight date between 1970 and 2099. */
function utcDay() {
  return fc
    .integer({ min: Date.UTC(1970, 0, 2), max: Date.UTC(2099, 11, 30) })
    .map((ms) => {
      const d = new Date(ms);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    });
}

describe('isISODate', () => {
  it('accepts well-formed dates and rejects everything else', () => {
    expect(isISODate('2026-09-12')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true); // leap year
    expect(isISODate('2026-02-29')).toBe(false); // not a leap year
    expect(isISODate('2026-9-12')).toBe(false);
    expect(isISODate('12/09/2026')).toBe(false);
    expect(isISODate('')).toBe(false);
    expect(isISODate(new Date())).toBe(false);
    expect(isISODate(null)).toBe(false);
  });
});

describe('parseISODate / toISODate', () => {
  it('parses at UTC midnight, never local midnight', () => {
    const date = parseISODate('2026-09-12');
    expect(date.toISOString()).toBe('2026-09-12T00:00:00.000Z');
    expect(date.getUTCDate()).toBe(12);
  });

  it('throws on malformed input rather than producing Invalid Date', () => {
    expect(() => parseISODate('nonsense')).toThrow(/Invalid ISO date/);
    expect(() => toISODate(new Date('nope'))).toThrow(/Invalid date/);
  });

  it('round-trips any UTC-midnight date', () => {
    fc.assert(
      fc.property(
        // Integer timestamps, not fc.date(): fc.date() deliberately generates
        // Invalid Date values, and this property is about calendar days.
        utcDay(),
        (date) => {
          const iso = toISODate(date);
          expect(iso).toBe(date.toISOString().slice(0, 10));
          expect(parseISODate(iso).getTime()).toBe(date.getTime());
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('addDays / daysBetween', () => {
  it('adds and subtracts whole days', () => {
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10);
    expect(daysBetween('2026-01-11', '2026-01-01')).toBe(-10);
  });

  it('is the inverse of addDays for any offset', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (offset) => {
        const start = '2026-03-01';
        expect(daysBetween(start, addDays(start, offset))).toBe(offset);
      }),
      { numRuns: 300 },
    );
  });

  it('is unaffected by daylight-saving transitions', () => {
    // Europe/London springs forward on 2026-03-29; a local-time implementation
    // would return 30.958 days here.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('isWithin / clampDate', () => {
  it('treats both endpoints as inclusive', () => {
    expect(isWithin('2026-06-01', '2026-06-01', '2026-06-30')).toBe(true);
    expect(isWithin('2026-06-30', '2026-06-01', '2026-06-30')).toBe(true);
    expect(isWithin('2026-05-31', '2026-06-01', '2026-06-30')).toBe(false);
    expect(isWithin('2026-07-01', '2026-06-01', '2026-06-30')).toBe(false);
  });

  it('clamps into range', () => {
    expect(clampDate('2026-05-01', '2026-06-01', '2026-06-30')).toBe('2026-06-01');
    expect(clampDate('2026-07-01', '2026-06-01', '2026-06-30')).toBe('2026-06-30');
    expect(clampDate('2026-06-15', '2026-06-01', '2026-06-30')).toBe('2026-06-15');
  });

  it('picks min/max by calendar order', () => {
    expect(minISODate('2026-01-02', '2026-01-01')).toBe('2026-01-01');
    expect(maxISODate('2026-01-02', '2026-01-01')).toBe('2026-01-02');
  });
});

describe('todayISO / formatting', () => {
  it('returns today in UTC', () => {
    expect(todayISO(new Date('2026-09-12T23:59:59Z'))).toBe('2026-09-12');
    // A local-time implementation would report the next day for this instant
    // in any timezone ahead of UTC.
    expect(todayISO(new Date('2026-09-12T00:00:00Z'))).toBe('2026-09-12');
  });

  it('formats dates without shifting the day', () => {
    expect(formatLongDate('2026-09-12')).toBe('12 September 2026');
  });
});
