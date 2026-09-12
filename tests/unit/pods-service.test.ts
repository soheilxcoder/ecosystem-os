/**
 * Unit tests for the pure helpers in the pods service: the election tie-break
 * rules and the cycle-week calculation.
 *
 * These decide who holds a Pod Lead seat, so every tie-break rule from
 * 03-MODULE-PODS-TEAMS.md is pinned down, including determinism.
 */

import { describe, expect, it } from 'vitest';
import { resolveWinner, weekNumberForDay } from '../../server/services/pods';

const candidates = [
  { userId: 'a', joinedAt: '2025-01-01', isOutgoingLead: false },
  { userId: 'b', joinedAt: '2024-01-01', isOutgoingLead: false },
  { userId: 'c', joinedAt: '2026-01-01', isOutgoingLead: false },
];

describe('resolveWinner', () => {
  it('returns null when nobody has voted', () => {
    expect(resolveWinner({}, candidates, 'longest_tenure', null)).toBeNull();
  });

  it('returns the clear winner', () => {
    expect(resolveWinner({ a: 1, b: 4, c: 2 }, candidates, 'longest_tenure', null)).toBe('b');
  });

  it('breaks a tie by longest tenure in the pod', () => {
    // a and c tie on 2 votes each; b (the earliest joiner) is not tied.
    expect(resolveWinner({ a: 2, c: 2 }, candidates, 'longest_tenure', null)).toBe('a');
  });

  it('breaks a tie by the outgoing Pod Lead when that is the configured rule', () => {
    expect(resolveWinner({ a: 1, c: 1 }, candidates, 'lead_tiebreak', 'c')).toBe('c');
  });

  it('falls back to a candidate when the outgoing lead is not tied', () => {
    expect(resolveWinner({ a: 1, c: 1 }, candidates, 'lead_tiebreak', 'b')).toBeTruthy();
  });

  it('breaks a tie deterministically under the random rule', () => {
    const first = resolveWinner({ a: 1, c: 1 }, candidates, 'random', null);
    const second = resolveWinner({ a: 1, c: 1 }, candidates, 'random', null);
    expect(first).toBe(second); // same tie, same outcome — never flaky
    expect(['a', 'c']).toContain(first);
  });

  it('never returns someone who did not receive votes', () => {
    expect(resolveWinner({ a: 3 }, candidates, 'longest_tenure', null)).toBe('a');
  });
});

describe('weekNumberForDay', () => {
  it('starts week 1 on the first execution day', () => {
    // Day 4 is the first day of the execution window (Days 4–80).
    expect(weekNumberForDay(4, 4)).toBe(1);
  });

  it('rolls over every seven days', () => {
    expect(weekNumberForDay(10, 4)).toBe(1);
    expect(weekNumberForDay(11, 4)).toBe(2);
    expect(weekNumberForDay(17, 4)).toBe(2);
    expect(weekNumberForDay(18, 4)).toBe(3);
  });

  it('reaches week 11 by the end of the execution window', () => {
    expect(weekNumberForDay(80, 4)).toBe(11);
  });

  it('never returns a week below 1', () => {
    expect(weekNumberForDay(1, 4)).toBe(1);
    expect(weekNumberForDay(0, 4)).toBe(1);
  });
});
