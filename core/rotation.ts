/**
 * Rotation math — "rotation is drawn, not written" (12-DESIGN-SYSTEM.md §2.4).
 *
 * Everywhere a lead / reviewer / coach seat appears in the UI it must render
 * with its countdown, so the ring glyph and the badge share this one
 * computation instead of each screen re-deriving days-remaining locally.
 */

import type { ISODate } from './time';
import { daysBetween } from './time';

/** A seat with this many days or fewer left is emphasised in the UI. */
export const ROTATION_WARNING_DAYS = 14;

export type RotationState = 'active' | 'ending_soon' | 'expired' | 'open_ended' | 'vacant';

export interface RotationInfo {
  state: RotationState;
  /** Whole days from `today` until `endDate` (inclusive end date). */
  daysRemaining: number | null;
  /** Total length of the term in days (null when open-ended). */
  totalDays: number | null;
  elapsedDays: number | null;
  /** 0..1 progress through the term, for the radial countdown glyph. */
  progress: number | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
}

const VACANT: RotationInfo = {
  state: 'vacant',
  daysRemaining: null,
  totalDays: null,
  elapsedDays: null,
  progress: null,
  startDate: null,
  endDate: null,
};

/**
 * @param startDate term start (null when the seat has never been filled)
 * @param endDate   term end, inclusive; null = open-ended (no rotation)
 */
export function computeRotation(
  startDate: ISODate | null,
  endDate: ISODate | null,
  today: ISODate,
): RotationInfo {
  if (!startDate) return VACANT;

  if (endDate === null) {
    const elapsed = Math.max(0, daysBetween(startDate, today));
    return {
      state: 'open_ended',
      daysRemaining: null,
      totalDays: null,
      elapsedDays: elapsed,
      progress: null,
      startDate,
      endDate: null,
    };
  }

  const totalDays = Math.max(0, daysBetween(startDate, endDate)) + 1; // inclusive
  const remaining = daysBetween(today, endDate); // 0 on the final day
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(startDate, today) + 1));
  const progress = totalDays === 0 ? 1 : Math.min(1, Math.max(0, elapsedDays / totalDays));

  if (remaining < 0) {
    return {
      state: 'expired',
      daysRemaining: remaining,
      totalDays,
      elapsedDays: totalDays,
      progress: 1,
      startDate,
      endDate,
    };
  }

  return {
    state: remaining <= ROTATION_WARNING_DAYS ? 'ending_soon' : 'active',
    daysRemaining: remaining,
    totalDays,
    elapsedDays,
    progress,
    startDate,
    endDate,
  };
}

/** Human label for the badge, e.g. "14 days left" / "ends today" / "expired". */
export function rotationLabel(info: RotationInfo): string {
  switch (info.state) {
    case 'vacant':
      return 'No rotation set';
    case 'open_ended':
      return 'Open-ended';
    case 'expired':
      return 'Rotation ended';
    case 'ending_soon':
    case 'active':
      if (info.daysRemaining === 0) return 'Ends today';
      if (info.daysRemaining === 1) return '1 day left';
      return `${info.daysRemaining} days left`;
    default:
      return '';
  }
}
