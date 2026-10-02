/**
 * Per-user write rate limiting (13-TECHNICAL-ARCHITECTURE §6).
 *
 * The public write surfaces — proposal creation, voting, review submission —
 * are throttled per authenticated user so a single account cannot flood the
 * platform. The limiter is a sliding-window counter kept in memory: one API
 * process owns the embedded database, so in-memory state covers the whole
 * system, and a restart resetting it is acceptable (the limits are an abuse
 * guard, not a billing mechanism).
 */

export interface RateLimitRule {
  /** Maximum number of writes inside one window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

/**
 * The three rate-limited write buckets. Kept deliberately generous — a normal
 * member acting in good faith never touches them; they exist to stop floods.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  /** Agreement (proposal) creation. */
  'proposal.create': { max: 30, windowMs: 60 * 60 * 1000 },
  /** Pod lead voting. */
  'pod.vote': { max: 20, windowMs: 60 * 60 * 1000 },
  /** Peer review score submission. */
  'review.submit': { max: 20, windowMs: 60 * 60 * 1000 },
};

export interface RateLimiter {
  /**
   * Record one write and report whether it is allowed. Returns false once the
   * caller exceeded `max` writes inside the trailing window.
   */
  check(bucket: string, userId: string, now?: number): boolean;
  /** Test helper — drop all recorded hits. */
  reset(): void;
}

export function createRateLimiter(overrides: Partial<Record<string, RateLimitRule>> = {}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(bucket, userId, now = Date.now()) {
      const rule = overrides[bucket] ?? RATE_LIMITS[bucket];
      if (!rule) return true;
      const key = `${bucket}:${userId}`;
      const cutoff = now - rule.windowMs;
      const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (timestamps.length >= rule.max) {
        hits.set(key, timestamps);
        return false;
      }
      timestamps.push(now);
      hits.set(key, timestamps);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
