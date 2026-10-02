/**
 * Module 07 — Coaching: the pod health signal formula.
 *
 * `07-MODULE-COACHING.md` names the three inputs a coach's traffic light is
 * built from — "recent check-in at-risk flags from Module 3, budget-score trend
 * from Module 5, and peer-review sentiment" — but never gives the arithmetic.
 * `17-MASTER-ANALYSIS-AND-REBUILD-PLAN.md` §3.3 calls that out as one of four
 * entities the specs under-define, and notes that principle 1 (every computed
 * number must be traceable) means this signal needs an explicit formula too.
 *
 * So this file is that formula, written down. It is deliberately pure: no
 * database, no I/O, no clock — the same contract `core/budget.ts` keeps. The
 * service layer gathers the inputs, this file turns them into a number, and the
 * UI renders both, so a coach who asks "why is my pod red?" gets the three
 * contributions rather than a colour.
 *
 * The method here is the one the static prototype chose in
 * `site/assets/domain.js` → `podHealthSignal()`. Per §3.3 it is now recorded
 * rather than left implicit, and the constants below are named so a change to
 * any of them is a visible decision.
 *
 *   Health = CheckInReliability (0–40)
 *          + PeerReviewSentiment (0–30)
 *          + BudgetScoreTrend    (0–30)
 *
 *   green ≥ 72 · amber ≥ 55 · red < 55
 */

// ---------------------------------------------------------------------------
// The weights
// ---------------------------------------------------------------------------

/**
 * How many points each input can contribute. They sum to 100 so the health
 * score reads on the same 0–100 scale as a Unit Score, which matters because
 * the two are displayed next to each other on the coach console.
 *
 * Check-in reliability carries the most weight on purpose: it is the only one
 * of the three the pod controls week to week, and it is the freshest. Peer
 * review is a lagging, once-per-cycle judgement; budget trend lags a full cycle
 * behind that.
 */
export const HEALTH_WEIGHTS = {
  checkinReliability: 40,
  peerReviewSentiment: 30,
  budgetScoreTrend: 30,
} as const;

/**
 * The trend component is centred rather than zero-based: a pod whose score is
 * flat earns the midpoint, not nothing. A newly formed pod has no trend yet,
 * and scoring that as 0 would put every new pod in the red before it had done
 * anything — the same reasoning `core/budget.ts` uses for an untagged strategic
 * score.
 */
export const TREND_NEUTRAL_POINTS = 15;

/**
 * Points per unit of score movement. With a ±5 swing being a large cycle-over-
 * cycle move in practice, this saturates the 0–30 band at roughly ±5 and keeps
 * ordinary movement inside it.
 */
export const TREND_POINTS_PER_UNIT = 3;

/**
 * Peer-review sentiment used when a pod has no reviews on record yet.
 *
 * 70 is deliberately above the amber floor: "no peer has said anything" is not
 * evidence of trouble, and defaulting it low would flag pods for a gap in the
 * organisation's review coverage rather than for their own condition. The
 * service layer records the fallback in `contributing_factors` so the UI can
 * say the sentiment is assumed, not measured.
 */
export const MISSING_SENTIMENT_DEFAULT = 70;

/** Colour thresholds, inclusive at the bottom of each band. */
export const HEALTH_THRESHOLDS = { green: 72, amber: 55 } as const;

/**
 * How many consecutive cycles a pod must sit in the red before the console
 * raises the accountability-path banner.
 *
 * `07` gives this as an org-configurable example ("flagged red for 2+
 * consecutive cycles"). It is the default, not a constant: `org_governance_config`
 * can carry a different value and the service passes it in.
 */
export const DEFAULT_RED_FLAG_STREAK = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthColor = 'green' | 'amber' | 'red';

/**
 * Which cycle each input actually came from.
 *
 * The three inputs do not all arrive on the same schedule. Check-ins accumulate
 * through the current cycle; a Unit Score exists only once a budget has been
 * computed; peer reviews are submitted on Days 86–88, so for most of a cycle the
 * freshest completed review is the previous cycle's. A signal that reported only
 * a colour would therefore be unanswerable when a coach asks "red according to
 * what?" — so the service records the cycle behind each figure and this object
 * carries it into the stored row.
 *
 * Every field is optional because a missing input is a normal state, not an
 * error, and the formula must still run.
 */
export interface HealthSignalProvenance {
  /** Cycle the check-in counts were read from. */
  checkinCycleNumber?: number | null;
  /** Cycle the peer-review sentiment was read from — often one behind. */
  sentimentCycleNumber?: number | null;
  /** `[latest, previous]` cycle numbers behind the trend, or null if unknown. */
  scoreCycleNumbers?: [number, number] | null;
}

/** The three raw inputs, gathered by the service from modules 3, 5 and 8. */
export interface HealthSignalInput {
  /** Weekly check-ins carrying an at-risk flag, this cycle. */
  atRiskCheckins: number;
  /** Total weekly check-ins filed this cycle. */
  checkins: number;
  /**
   * Latest Unit Score minus the previous one. Positive means improving.
   * `null` when there is no prior cycle to compare against.
   */
  scoreTrend: number | null;
  /**
   * Mean peer-review score for the pod on a 0–100 scale, or `null` when no
   * review has been submitted.
   */
  reviewSentiment: number | null;
  /**
   * Passed straight through into the result. This function does not interpret
   * it — it stays pure — but carrying it means the stored signal explains
   * itself without the caller having to re-derive where each input came from.
   */
  provenance?: HealthSignalProvenance | null;
}

/** What each of the three bands actually contributed — shown on hover. */
export interface HealthScoreParts {
  checkinReliability: number;
  peerReviewSentiment: number;
  budgetScoreTrend: number;
}

export interface HealthSignal {
  color: HealthColor;
  /** 0–100, rounded for display. The unrounded value is kept in `rawScore`. */
  score: number;
  rawScore: number;
  parts: HealthScoreParts;
  /**
   * The inputs as they were used, including any substitution. This is the
   * `contributing_factors` JSON stored on `pod_health_signal` — the record that
   * makes the colour traceable after the fact, once the underlying check-ins
   * may have moved on.
   */
  factors: {
    atRiskCheckins: number;
    checkins: number;
    atRiskRate: number;
    scoreTrend: number | null;
    reviewSentiment: number;
    /** True when no review existed and `MISSING_SENTIMENT_DEFAULT` was used. */
    sentimentAssumed: boolean;
    /** True when no prior cycle existed, so the trend band is centred. */
    trendAssumed: boolean;
  };
  /**
   * Which cycle each input came from, echoed from the input. `null` when the
   * caller did not supply it — the signal is still valid, it just cannot name
   * its sources, and the UI says so rather than implying a cycle it does not
   * know.
   */
  provenance: HealthSignalProvenance | null;
}

// ---------------------------------------------------------------------------
// The formula
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fraction of this cycle's check-ins that were flagged at-risk, in 0–1.
 *
 * A pod that filed nothing has no rate to report. That is treated as 0 at-risk
 * — not as a full score — because silence is handled by the check-in compliance
 * rules in module 3, and double-penalising it here would make this signal say
 * two things at once.
 */
export function atRiskRate(atRiskCheckins: number, checkins: number): number {
  if (checkins <= 0) return 0;
  return clamp(atRiskCheckins / checkins, 0, 1);
}

/**
 * The full health signal. Pure and total: every input combination returns a
 * result, so a coach console can never fail to render a pod because data is
 * missing.
 */
export function podHealthSignal(input: HealthSignalInput): HealthSignal {
  const atRisk = Math.max(0, Math.round(input.atRiskCheckins ?? 0));
  const checkins = Math.max(0, Math.round(input.checkins ?? 0));
  const rate = atRiskRate(atRisk, checkins);

  // Narrowed directly rather than through `trendAssumed`, because TypeScript
  // cannot follow a boolean alias back to the union it was derived from.
  const rawTrend = input.scoreTrend;
  const trendAssumed = rawTrend === null || rawTrend === undefined;
  const trend: number = trendAssumed ? 0 : rawTrend;

  const sentimentAssumed = input.reviewSentiment === null || input.reviewSentiment === undefined;
  const sentiment = sentimentAssumed
    ? MISSING_SENTIMENT_DEFAULT
    : clamp(input.reviewSentiment as number, 0, 100);

  const checkinReliability = clamp(
    (1 - rate) * HEALTH_WEIGHTS.checkinReliability,
    0,
    HEALTH_WEIGHTS.checkinReliability,
  );
  const peerReviewSentiment = clamp(
    (sentiment / 100) * HEALTH_WEIGHTS.peerReviewSentiment,
    0,
    HEALTH_WEIGHTS.peerReviewSentiment,
  );
  const budgetScoreTrend = clamp(
    TREND_NEUTRAL_POINTS + trend * TREND_POINTS_PER_UNIT,
    0,
    HEALTH_WEIGHTS.budgetScoreTrend,
  );

  const rawScore = checkinReliability + peerReviewSentiment + budgetScoreTrend;
  const score = Math.round(rawScore);

  return {
    color: healthColor(score),
    score,
    rawScore,
    parts: { checkinReliability, peerReviewSentiment, budgetScoreTrend },
    factors: {
      atRiskCheckins: atRisk,
      checkins,
      atRiskRate: Math.round(rate * 100),
      scoreTrend: trendAssumed ? null : Number(trend.toFixed(2)),
      reviewSentiment: Math.round(sentiment),
      sentimentAssumed,
      trendAssumed,
    },
    provenance: input.provenance ?? null,
  };
}

/** The colour band for a score. Thresholds are inclusive at the band floor. */
export function healthColor(score: number): HealthColor {
  if (score >= HEALTH_THRESHOLDS.green) return 'green';
  if (score >= HEALTH_THRESHOLDS.amber) return 'amber';
  return 'red';
}

// ---------------------------------------------------------------------------
// The red streak
// ---------------------------------------------------------------------------

/**
 * How many consecutive cycles — counting back from the most recent — a pod has
 * been red.
 *
 * `07` says the accountability banner appears when a pod "has been red for a
 * sustained period", and the prototype in `site/assets/store.js` counted the
 * current signal plus trailing low-score history entries. That conflated two
 * different things (a computed colour and a raw score), so this counts colours
 * only, oldest-to-newest, and stops at the first non-red.
 *
 * A streak is deliberately *reported*, never acted on. Module 8's accountability
 * path is opened by a human; see `flagBanner`.
 */
export function redStreak(colors: readonly HealthColor[]): number {
  let streak = 0;
  for (let i = colors.length - 1; i >= 0; i -= 1) {
    if (colors[i] === 'red') streak += 1;
    else break;
  }
  return streak;
}

/**
 * Whether the console should raise the accountability-path suggestion.
 *
 * Returns the streak alongside the decision so the banner can state its own
 * reason ("red for 3 consecutive cycles") instead of appearing unexplained —
 * principle 1 again, applied to a suggestion rather than a number.
 */
export function flagBanner(
  colors: readonly HealthColor[],
  threshold: number = DEFAULT_RED_FLAG_STREAK,
): { show: boolean; streak: number; threshold: number } {
  const streak = redStreak(colors);
  return { show: streak >= Math.max(1, threshold), streak, threshold: Math.max(1, threshold) };
}

// ---------------------------------------------------------------------------
// Reassignment timing
// ---------------------------------------------------------------------------

/**
 * The 3–5 pod range from `07`, used for guidance only.
 *
 * The spec is explicit that this warns and never blocks: "the UI should warn
 * ('This coach now covers 6 pods — above the suggested 3–5 range') but not
 * block the assignment." The roster reads these two numbers to phrase that
 * warning; no validation anywhere rejects an assignment for exceeding them.
 */
export const SUGGESTED_POD_RANGE = { min: 3, max: 5 } as const;

/**
 * Reassignment is reviewed every 2–3 cycles (`07`: "reassigned every 2–3
 * cycles to prevent personal dependency"). Two cycles is a soft reminder, three
 * escalates to a visible flag, and neither auto-executes.
 */
export const REASSIGNMENT_REVIEW = { soft: 2, hard: 3 } as const;

export type ReassignmentUrgency = 'ok' | 'due' | 'overdue';

/**
 * Where an assignment sits against its review window.
 *
 * `cyclesWithPodSet` counts the assignment's start cycle as cycle 1, so a coach
 * assigned this cycle is on 1 of 2–3 and reads `ok`. The console renders this
 * as a countdown, which is what makes the no-personal-dependency rule a visible
 * UI element rather than a policy nobody can see.
 */
export function reassignmentState(
  cyclesWithPodSet: number,
  review: { soft: number; hard: number } = REASSIGNMENT_REVIEW,
): { urgency: ReassignmentUrgency; cyclesWithPodSet: number; cyclesUntilReview: number } {
  const cycles = Math.max(1, Math.round(cyclesWithPodSet));
  const cyclesUntilReview = Math.max(0, review.soft - cycles);
  const urgency: ReassignmentUrgency =
    cycles >= review.hard ? 'overdue' : cycles >= review.soft ? 'due' : 'ok';
  return { urgency, cyclesWithPodSet: cycles, cyclesUntilReview };
}

/**
 * The ratio warning copy, or `null` when the load is inside the suggested band.
 *
 * Returned as text rather than a boolean so the server, the roster and the
 * reassign modal all show the same sentence — and so it is obvious at every
 * call site that this is guidance, since nothing here throws.
 */
export function ratioWarning(podCount: number): string | null {
  const { min, max } = SUGGESTED_POD_RANGE;
  if (podCount > max) {
    return `This coach now covers ${podCount} pods — above the suggested ${min}–${max} range`;
  }
  if (podCount > 0 && podCount < min) {
    return `This coach covers ${podCount} pod${podCount === 1 ? '' : 's'} — below the suggested ${min}–${max} range`;
  }
  return null;
}
