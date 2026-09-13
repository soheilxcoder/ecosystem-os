/**
 * The invariant that governs Module 08 — pure, and tested harder than anything
 * else in this phase.
 *
 * 13-TECHNICAL-ARCHITECTURE.md §9 point 3 is explicit: "property-based tests
 * that assert a pod can never simultaneously be 'in trial' and 'in
 * accountability' are worth the investment." The two tracks are separate code
 * paths (core/entry-trial.ts, core/accountability.ts), separate tables with
 * separate triggers, and this file is the single place that decides which track
 * a pod is on — so a screen cannot accidentally render the wrong one.
 */

import type { PodStatus, UUID } from './types';

export type GovernanceTrack = 'entry_trial' | 'accountability' | 'none';

export interface GovernanceSubject {
  podId: UUID;
  status: PodStatus;
  /** An EntryTrial exists with no final result yet. */
  hasOpenTrial: boolean;
  /** An AccountabilityCase exists with no final result yet. */
  hasOpenAccountability: boolean;
}

/**
 * Which governance track a pod is on. A pod in `trial` status is always on the
 * 90-Day Entry Rule; anything else that has an open case is on the
 * Accountability Path; otherwise it is on neither.
 */
export function trackFor(pod: GovernanceSubject): GovernanceTrack {
  if (pod.hasOpenTrial) return 'entry_trial';
  if (pod.hasOpenAccountability) return 'accountability';
  return 'none';
}

/**
 * The invariant, stated once so the database triggers, the services and the
 * tests can all be checked against the same predicate: a pod may never have an
 * open Entry Trial and an open Accountability Case at the same time.
 */
export function violatesTrackInvariant(pod: GovernanceSubject): boolean {
  return pod.hasOpenTrial && pod.hasOpenAccountability;
}

/** Both tracks are legal for this pod — used before opening either case. */
export function canOpenTrial(pod: GovernanceSubject): boolean {
  return pod.status === 'trial' && !pod.hasOpenTrial && !pod.hasOpenAccountability;
}

export function canOpenAccountabilityCase(pod: GovernanceSubject): boolean {
  return pod.status !== 'trial' && !pod.hasOpenAccountability && !pod.hasOpenTrial;
}

export const TRACK_LABELS: Record<GovernanceTrack, string> = {
  entry_trial: '90-Day Entry Rule',
  accountability: 'Accountability & Dissolution Path',
  none: 'Standard cycle — no governance case open',
};

// ---------------------------------------------------------------------------
// Rule registry (Module 08's shared Rule Versioning panel)
// ---------------------------------------------------------------------------

export const RULE_KEYS = [
  'calendar.cycle_length_days',
  'calendar.phase_boundaries',
  'governance.tie_break_rule',
  'governance.allow_lead_re_election',
  'accountability.stage2_score_threshold',
  'accountability.panel_size',
  'accountability.correction_period_days',
  'review.reviewers_per_pitch',
  'review.comment_min_length',
  'budget.formula_weights',
] as const;

export type RuleKey = (typeof RULE_KEYS)[number];

export interface RuleDefinition {
  key: RuleKey;
  label: string;
  /** Where the rule actually lives; `recorded` rules are logged but applied by a later module. */
  source: 'cycle_config' | 'org_governance_config' | 'recorded';
  defaultValue: unknown;
}

export const RULE_REGISTRY: Record<RuleKey, RuleDefinition> = {
  'calendar.cycle_length_days': {
    key: 'calendar.cycle_length_days',
    label: 'Sprint cycle length (days)',
    source: 'cycle_config',
    defaultValue: 90,
  },
  'calendar.phase_boundaries': {
    key: 'calendar.phase_boundaries',
    label: 'Sprint phase boundaries',
    source: 'cycle_config',
    defaultValue: { p1_end: 3, p2_end: 80, p3_end: 85, p4_end: 88, p5_end: 90 },
  },
  'governance.tie_break_rule': {
    key: 'governance.tie_break_rule',
    label: 'Pod Lead election tie-break rule',
    source: 'org_governance_config',
    defaultValue: 'longest_tenure',
  },
  'governance.allow_lead_re_election': {
    key: 'governance.allow_lead_re_election',
    label: 'Outgoing Pod Lead may stand again',
    source: 'org_governance_config',
    defaultValue: false,
  },
  'accountability.stage2_score_threshold': {
    key: 'accountability.stage2_score_threshold',
    label: 'Score below which stage 2 is triggered',
    source: 'org_governance_config',
    defaultValue: 50,
  },
  'accountability.panel_size': {
    key: 'accountability.panel_size',
    label: 'Panel members at a dissolution vote',
    source: 'org_governance_config',
    defaultValue: 3,
  },
  'accountability.correction_period_days': {
    key: 'accountability.correction_period_days',
    label: 'Length of the correction period (days)',
    source: 'org_governance_config',
    defaultValue: 30,
  },
  'review.reviewers_per_pitch': {
    key: 'review.reviewers_per_pitch',
    label: 'Peer reviewers assigned per pitch',
    source: 'org_governance_config',
    defaultValue: 3,
  },
  'review.comment_min_length': {
    key: 'review.comment_min_length',
    label: 'Minimum length of a review comment',
    source: 'org_governance_config',
    defaultValue: 140,
  },
  'budget.formula_weights': {
    key: 'budget.formula_weights',
    label: 'Budget formula weights (financial / peer review / strategic, in %)',
    source: 'recorded',
    // The constitutional 40/35/25 split, in whole percentages so it reads the
    // same way on the budget screen as it does in the appendix.
    defaultValue: { financial: 40, peer_review: 35, strategic: 25 },
  },
};

export function isRuleKey(value: string): value is RuleKey {
  return (RULE_KEYS as readonly string[]).includes(value);
}

/**
 * A rule change must never be retroactive (Module 08: "effective cycle (always
 * next cycle, never retroactive)"). This is the shared guard every rule
 * proposal passes through.
 */
export function assertFutureCycle(
  effectiveCycleNumber: number,
  currentCycleNumber: number,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isInteger(effectiveCycleNumber) || effectiveCycleNumber < 1) {
    return { ok: false, message: 'A rule change needs a valid cycle number' };
  }
  if (effectiveCycleNumber <= currentCycleNumber) {
    return {
      ok: false,
      message: `A rule change can only take effect from a future cycle (this is cycle ${currentCycleNumber})`,
    };
  }
  return { ok: true };
}
