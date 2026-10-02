import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  DEFAULT_RED_FLAG_STREAK,
  HEALTH_THRESHOLDS,
  HEALTH_WEIGHTS,
  MISSING_SENTIMENT_DEFAULT,
  REASSIGNMENT_REVIEW,
  SUGGESTED_POD_RANGE,
  TREND_NEUTRAL_POINTS,
  TREND_POINTS_PER_UNIT,
  atRiskRate,
  flagBanner,
  healthColor,
  podHealthSignal,
  ratioWarning,
  reassignmentState,
  redStreak,
  type HealthColor,
} from '../../core/health';

// ---------------------------------------------------------------------------
// The weights
// ---------------------------------------------------------------------------

describe('the health weights', () => {
  it('sums to 100, so a health score reads on the same scale as a Unit Score', () => {
    const total = Object.values(HEALTH_WEIGHTS).reduce((sum, part) => sum + part, 0);
    expect(total).toBe(100);
  });

  it('gives check-in reliability the largest share', () => {
    // It is the only input the pod controls week to week, and the freshest.
    expect(HEALTH_WEIGHTS.checkinReliability).toBeGreaterThan(
      HEALTH_WEIGHTS.peerReviewSentiment,
    );
    expect(HEALTH_WEIGHTS.checkinReliability).toBeGreaterThan(HEALTH_WEIGHTS.budgetScoreTrend);
  });

  it('centres the trend band so a flat pod is not penalised for having no trend', () => {
    expect(TREND_NEUTRAL_POINTS).toBe(HEALTH_WEIGHTS.budgetScoreTrend / 2);
  });
});

// ---------------------------------------------------------------------------
// The formula
// ---------------------------------------------------------------------------

describe('podHealthSignal', () => {
  it('scores a clean pod with good reviews and a rising trend at the top', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 10,
      scoreTrend: 5,
      reviewSentiment: 100,
    });

    // 40 (no at-risk) + 30 (perfect sentiment) + 30 (trend saturates at 15+15).
    expect(signal.parts.checkinReliability).toBe(40);
    expect(signal.parts.peerReviewSentiment).toBe(30);
    expect(signal.parts.budgetScoreTrend).toBe(30);
    expect(signal.score).toBe(100);
    expect(signal.color).toBe('green');
  });

  it('scores every check-in flagged at-risk with poor reviews and a falling trend at zero', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 8,
      checkins: 8,
      scoreTrend: -20,
      reviewSentiment: 0,
    });

    expect(signal.parts.checkinReliability).toBe(0);
    expect(signal.parts.peerReviewSentiment).toBe(0);
    expect(signal.parts.budgetScoreTrend).toBe(0);
    expect(signal.score).toBe(0);
    expect(signal.color).toBe('red');
  });

  it('reproduces the arithmetic band by band', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 1,
      checkins: 4,
      scoreTrend: 2,
      reviewSentiment: 80,
    });

    // at-risk rate 0.25 → (1 − 0.25) × 40 = 30
    expect(signal.parts.checkinReliability).toBeCloseTo(30, 10);
    // sentiment 80 → 0.80 × 30 = 24
    expect(signal.parts.peerReviewSentiment).toBeCloseTo(24, 10);
    // trend +2 → 15 + (2 × 3) = 21
    expect(signal.parts.budgetScoreTrend).toBeCloseTo(21, 10);

    expect(signal.rawScore).toBeCloseTo(75, 10);
    expect(signal.score).toBe(75);
    expect(signal.color).toBe('green');
  });

  it('places the colour bands exactly on their thresholds', () => {
    expect(healthColor(HEALTH_THRESHOLDS.green)).toBe('green');
    expect(healthColor(HEALTH_THRESHOLDS.green - 1)).toBe('amber');
    expect(healthColor(HEALTH_THRESHOLDS.amber)).toBe('amber');
    expect(healthColor(HEALTH_THRESHOLDS.amber - 1)).toBe('red');
  });

  it('treats a pod with no check-ins as having no at-risk rate, not a full score', () => {
    // Silence is module 3's concern; double-penalising it here would make this
    // signal say two things at once.
    expect(atRiskRate(0, 0)).toBe(0);
    const signal = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 0,
      scoreTrend: 0,
      reviewSentiment: 70,
    });
    expect(signal.parts.checkinReliability).toBe(40);
  });

  it('substitutes the documented default when no review exists, and says so', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 5,
      scoreTrend: 0,
      reviewSentiment: null,
    });

    expect(signal.factors.sentimentAssumed).toBe(true);
    expect(signal.factors.reviewSentiment).toBe(MISSING_SENTIMENT_DEFAULT);
    expect(signal.parts.peerReviewSentiment).toBeCloseTo((MISSING_SENTIMENT_DEFAULT / 100) * 30, 10);
  });

  it('centres the trend band when there is no prior cycle, and says so', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 5,
      scoreTrend: null,
      reviewSentiment: 80,
    });

    expect(signal.factors.trendAssumed).toBe(true);
    expect(signal.factors.scoreTrend).toBeNull();
    expect(signal.parts.budgetScoreTrend).toBe(TREND_NEUTRAL_POINTS);
  });

  it('defaults a missing sentiment above the amber floor, so a new pod is not born red', () => {
    // A brand-new pod: no reviews, no trend, no check-ins yet.
    const signal = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 0,
      scoreTrend: null,
      reviewSentiment: null,
    });
    expect(signal.color).not.toBe('red');
    expect(signal.score).toBeGreaterThanOrEqual(HEALTH_THRESHOLDS.amber);
  });

  it('carries provenance through unchanged, and null when none was given', () => {
    const provenance = {
      checkinCycleNumber: 3,
      sentimentCycleNumber: 2,
      scoreCycleNumbers: [3, 2] as [number, number],
    };
    expect(
      podHealthSignal({
        atRiskCheckins: 0,
        checkins: 1,
        scoreTrend: 0,
        reviewSentiment: 70,
        provenance,
      }).provenance,
    ).toEqual(provenance);

    expect(
      podHealthSignal({
        atRiskCheckins: 0,
        checkins: 1,
        scoreTrend: 0,
        reviewSentiment: 70,
      }).provenance,
    ).toBeNull();
  });

  it('records the at-risk rate as a whole percentage', () => {
    const signal = podHealthSignal({
      atRiskCheckins: 1,
      checkins: 3,
      scoreTrend: 0,
      reviewSentiment: 70,
    });
    expect(signal.factors.atRiskRate).toBe(33);
  });
});

describe('podHealthSignal (properties)', () => {
  it('is total: every input combination yields a score in 0–100 and a colour', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        fc.option(fc.integer({ min: -50, max: 50 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        (atRisk, checkins, trend, sentiment) => {
          const signal = podHealthSignal({
            atRiskCheckins: atRisk,
            checkins,
            scoreTrend: trend,
            reviewSentiment: sentiment,
          });
          expect(signal.score).toBeGreaterThanOrEqual(0);
          expect(signal.score).toBeLessThanOrEqual(100);
          expect(['green', 'amber', 'red']).toContain(signal.color);
          expect(signal.color).toBe(healthColor(signal.score));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never scores worse when fewer check-ins are flagged at-risk', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 100 }),
        (checkins, lowerAtRisk, sentiment) => {
          const atRisk = Math.min(checkins, lowerAtRisk + 1);
          const worse = podHealthSignal({
            atRiskCheckins: atRisk,
            checkins,
            scoreTrend: 0,
            reviewSentiment: sentiment,
          });
          const better = podHealthSignal({
            atRiskCheckins: atRisk - 1,
            checkins,
            scoreTrend: 0,
            reviewSentiment: sentiment,
          });
          expect(better.rawScore).toBeGreaterThanOrEqual(worse.rawScore);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('clamps every band, so no single input can push the total past 100 or below 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (trend, sentiment) => {
          const signal = podHealthSignal({
            atRiskCheckins: 0,
            checkins: 1,
            scoreTrend: trend,
            reviewSentiment: sentiment,
          });
          expect(signal.parts.budgetScoreTrend).toBeLessThanOrEqual(HEALTH_WEIGHTS.budgetScoreTrend);
          expect(signal.parts.budgetScoreTrend).toBeGreaterThanOrEqual(0);
          expect(signal.parts.peerReviewSentiment).toBeLessThanOrEqual(
            HEALTH_WEIGHTS.peerReviewSentiment,
          );
          expect(signal.parts.peerReviewSentiment).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('splits into exactly the three bands it reports', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: -10, max: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (atRisk, checkins, trend, sentiment) => {
          const signal = podHealthSignal({
            atRiskCheckins: atRisk,
            checkins,
            scoreTrend: trend,
            reviewSentiment: sentiment,
          });
          const summed =
            signal.parts.checkinReliability +
            signal.parts.peerReviewSentiment +
            signal.parts.budgetScoreTrend;
          expect(signal.rawScore).toBeCloseTo(summed, 10);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// The red streak and the flag banner
// ---------------------------------------------------------------------------

describe('redStreak', () => {
  it('counts back from the most recent and stops at the first non-red', () => {
    expect(redStreak(['red', 'red', 'red'])).toBe(3);
    expect(redStreak(['red', 'green', 'red', 'red'])).toBe(2);
    expect(redStreak(['green', 'red'])).toBe(1);
    expect(redStreak(['red', 'green'])).toBe(0);
    expect(redStreak([])).toBe(0);
  });

  it('counts colours, not raw scores', () => {
    // A low score that is still amber does not extend a red streak: the banner
    // is about the reported colour, which is what the coach actually saw.
    expect(redStreak(['red', 'amber', 'red'])).toBe(1);
  });
});

describe('flagBanner', () => {
  it('defaults to the documented two-cycle threshold', () => {
    expect(DEFAULT_RED_FLAG_STREAK).toBe(2);
    expect(flagBanner(['red', 'red']).show).toBe(true);
    expect(flagBanner(['red']).show).toBe(false);
  });

  it('honours an org-configured threshold', () => {
    expect(flagBanner(['red', 'red'], 3).show).toBe(false);
    expect(flagBanner(['red', 'red', 'red'], 3).show).toBe(true);
  });

  it('reports the streak and threshold alongside the decision, so the banner can explain itself', () => {
    const banner = flagBanner(['amber', 'red', 'red', 'red'], 2);
    expect(banner).toEqual({ show: true, streak: 3, threshold: 2 });
  });

  it('is a suggestion, never an action: nothing here mutates or throws', () => {
    const colors: HealthColor[] = ['red', 'red', 'red'];
    const frozen = [...colors];
    expect(() => flagBanner(colors, 2)).not.toThrow();
    expect(colors).toEqual(frozen);
  });

  it('treats a threshold below 1 as 1 rather than firing on an empty history', () => {
    expect(flagBanner([], 0).show).toBe(false);
    expect(flagBanner(['green'], 0).show).toBe(false);
    expect(flagBanner(['red'], 0).show).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reassignment timing
// ---------------------------------------------------------------------------

describe('reassignmentState', () => {
  it('uses the 2–3 cycle review window from the spec', () => {
    expect(REASSIGNMENT_REVIEW).toEqual({ soft: 2, hard: 3 });
  });

  it('counts the start cycle as cycle 1, so a new assignment reads ok', () => {
    expect(reassignmentState(1)).toEqual({
      urgency: 'ok',
      cyclesWithPodSet: 1,
      cyclesUntilReview: 1,
    });
  });

  it('is due at the soft mark and overdue at the hard mark', () => {
    expect(reassignmentState(2).urgency).toBe('due');
    expect(reassignmentState(2).cyclesUntilReview).toBe(0);
    expect(reassignmentState(3).urgency).toBe('overdue');
    expect(reassignmentState(7).urgency).toBe('overdue');
  });

  it('never reports a negative countdown', () => {
    expect(reassignmentState(9).cyclesUntilReview).toBe(0);
  });

  it('treats a nonsensical cycle count as 1', () => {
    expect(reassignmentState(0).cyclesWithPodSet).toBe(1);
    expect(reassignmentState(-4).cyclesWithPodSet).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ratio guidance
// ---------------------------------------------------------------------------

describe('ratioWarning', () => {
  it('uses the suggested 3–5 pod range from the spec', () => {
    expect(SUGGESTED_POD_RANGE).toEqual({ min: 3, max: 5 });
  });

  it('is silent inside the range', () => {
    expect(ratioWarning(3)).toBeNull();
    expect(ratioWarning(4)).toBeNull();
    expect(ratioWarning(5)).toBeNull();
  });

  it('warns above the range with the exact sentence the spec gives', () => {
    expect(ratioWarning(6)).toBe(
      'This coach now covers 6 pods — above the suggested 3–5 range',
    );
  });

  it('warns below the range too, singular and plural', () => {
    expect(ratioWarning(1)).toBe('This coach covers 1 pod — below the suggested 3–5 range');
    expect(ratioWarning(2)).toBe('This coach covers 2 pods — below the suggested 3–5 range');
  });

  it('is silent for a coach with no pods yet — available capacity is not a problem', () => {
    expect(ratioWarning(0)).toBeNull();
  });

  it('returns guidance, never an error: it cannot throw and cannot block', () => {
    for (const count of [0, 1, 5, 6, 50, 500]) {
      expect(() => ratioWarning(count)).not.toThrow();
    }
  });
});

describe('trend sensitivity', () => {
  it('saturates the trend band at roughly a ±5 swing', () => {
    const flat = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 1,
      scoreTrend: 0,
      reviewSentiment: 70,
    });
    const up = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 1,
      scoreTrend: 5,
      reviewSentiment: 70,
    });
    const saturated = podHealthSignal({
      atRiskCheckins: 0,
      checkins: 1,
      scoreTrend: 50,
      reviewSentiment: 70,
    });

    expect(up.parts.budgetScoreTrend).toBe(TREND_NEUTRAL_POINTS + 5 * TREND_POINTS_PER_UNIT);
    expect(saturated.parts.budgetScoreTrend).toBe(up.parts.budgetScoreTrend);
    expect(flat.parts.budgetScoreTrend).toBe(TREND_NEUTRAL_POINTS);
  });
});
