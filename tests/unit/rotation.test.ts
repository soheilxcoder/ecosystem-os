/**
 * Rotation math — 12-DESIGN-SYSTEM.md §2.4 "rotation is drawn, not written"
 * and the non-negotiable constraint in README.md: a lead or reviewer role must
 * always render with its countdown, never as a permanent title.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ROTATION_WARNING_DAYS,
  computeRotation,
  rotationLabel,
} from '../../core/rotation';
import { addDays, daysBetween } from '../../core/time';

describe('computeRotation', () => {
  it('reports a vacant seat when there is no start date', () => {
    const info = computeRotation(null, null, '2026-06-15');
    expect(info.state).toBe('vacant');
    expect(rotationLabel(info)).toBe('No rotation set');
  });

  it('marks open-ended roles (no end date) as such', () => {
    const info = computeRotation('2026-01-01', null, '2026-06-15');
    expect(info.state).toBe('open_ended');
    expect(info.daysRemaining).toBeNull();
    expect(info.progress).toBeNull();
    expect(rotationLabel(info)).toBe('Open-ended');
  });

  it('counts the final day itself as remaining (inclusive end date)', () => {
    const info = computeRotation('2026-01-01', '2026-06-15', '2026-06-15');
    expect(info.daysRemaining).toBe(0);
    expect(info.state).toBe('ending_soon');
    expect(rotationLabel(info)).toBe('Ends today');
  });

  it('counts a 90-day pod lead term as 90 days, not 89', () => {
    const start = '2026-01-01';
    const end = addDays(start, 89); // day 1 through day 90
    const info = computeRotation(start, end, start);
    expect(info.totalDays).toBe(90);
    expect(info.daysRemaining).toBe(89);
    expect(info.elapsedDays).toBe(1);
  });

  it('progresses from 0 to 1 across the term', () => {
    const start = '2026-01-01';
    const end = '2026-03-31';
    const first = computeRotation(start, end, start);
    const last = computeRotation(start, end, end);
    expect(first.progress).toBeCloseTo(1 / 90, 5);
    expect(last.progress).toBe(1);
  });

  it('flags a seat ending within the warning window', () => {
    const end = addDays('2026-06-15', ROTATION_WARNING_DAYS);
    expect(computeRotation('2026-01-01', end, '2026-06-15').state).toBe('ending_soon');
    expect(
      computeRotation('2026-01-01', addDays(end, 1), '2026-06-15').state,
    ).toBe('active');
  });

  it('expires the day after the end date and reports a negative remainder', () => {
    const info = computeRotation('2026-01-01', '2026-06-14', '2026-06-15');
    expect(info.state).toBe('expired');
    expect(info.daysRemaining).toBe(-1);
    expect(info.progress).toBe(1);
    expect(rotationLabel(info)).toBe('Rotation ended');
  });

  it('keeps progress and remaining days consistent for any random window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3650 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: -200, max: 400 }),
        (startOffset, termLength, todayOffset) => {
          const start = addDays('2020-01-01', startOffset);
          const end = addDays(start, termLength - 1);
          const today = addDays(start, todayOffset);
          const info = computeRotation(start, end, today);

          expect(info.totalDays).toBe(termLength);
          expect(info.daysRemaining).toBe(daysBetween(today, end));
          if (info.progress !== null) {
            expect(info.progress).toBeGreaterThanOrEqual(0);
            expect(info.progress).toBeLessThanOrEqual(1);
          }
          if (info.state === 'expired') {
            expect(info.daysRemaining!).toBeLessThan(0);
          } else {
            expect(info.daysRemaining!).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('produces label text for every state (badges never render empty)', () => {
    const states = [
      computeRotation(null, null, '2026-06-15'),
      computeRotation('2026-01-01', null, '2026-06-15'),
      computeRotation('2026-01-01', '2026-06-15', '2026-06-15'),
      computeRotation('2026-01-01', '2026-06-16', '2026-06-15'),
      computeRotation('2026-01-01', '2026-06-14', '2026-06-15'),
      computeRotation('2026-01-01', '2026-12-31', '2026-06-15'),
    ];
    for (const state of states) {
      expect(rotationLabel(state).length).toBeGreaterThan(0);
    }
  });
});
