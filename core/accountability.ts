/**
 * Accountability & Dissolution Path — the other of Module 08's two governance
 * state machines.
 *
 * Four sequential stages, ending in a panel vote. Every difference from the
 * Entry Rule is deliberate: this track is gradual, has a 30-day correction
 * period with intensive coach support, and ends with a *panel* decision — never
 * a single decision-maker.
 */

import type { ISODate } from './time';
import { addDays } from './time';

export const ACCOUNTABILITY_STAGES = [
  'transparency',
  'reduced_share',
  'mediation',
  'correction_period',
] as const;

export type AccountabilityStage = (typeof ACCOUNTABILITY_STAGES)[number];

export const STAGE_LABELS: Record<AccountabilityStage, string> = {
  transparency: '1. Full transparency',
  reduced_share: '2. Reduced credibility & profit share',
  mediation: '3. Mediation by Conflict Resolver',
  correction_period: '4. 30-day correction period',
};

export const STAGE_SUMMARIES: Record<AccountabilityStage, string> = {
  transparency:
    'The baseline, always true: dashboards and budget numbers are already public to the whole organisation.',
  reduced_share:
    'Triggered automatically when the pod crosses the configured performance threshold; the reduction is a visible, tracked adjustment in the budget calculation.',
  mediation:
    'A Conflict Resolver works with both sides. Opens a case workspace if a dispute is formally logged.',
  correction_period:
    'Thirty days of intensive coach support, then a panel vote on whether the pod continues.',
};

export const CORRECTION_PERIOD_DAYS = 30;

/** The source rule: never a single decision-maker. */
export const MIN_PANEL_SIZE = 3;

export type PanelVote = 'continue' | 'dissolve';
export type AccountabilityResult = 'continue' | 'dissolve';

export function stageIndex(stage: AccountabilityStage): number {
  return ACCOUNTABILITY_STAGES.indexOf(stage);
}

export function nextStage(stage: AccountabilityStage): AccountabilityStage | null {
  const index = stageIndex(stage);
  if (index < 0 || index + 1 >= ACCOUNTABILITY_STAGES.length) return null;
  return ACCOUNTABILITY_STAGES[index + 1]!;
}

/** Stages are sequential in both directions: no skipping, no going back. */
export function canAdvanceTo(from: AccountabilityStage, to: AccountabilityStage): boolean {
  return nextStage(from) === to;
}

export function canReturnTo(from: AccountabilityStage, to: AccountabilityStage): boolean {
  const index = stageIndex(from);
  return index > 0 && ACCOUNTABILITY_STAGES[index - 1] === to;
}

export function isAccountabilityStage(value: unknown): value is AccountabilityStage {
  return typeof value === 'string' && (ACCOUNTABILITY_STAGES as readonly string[]).includes(value);
}

/**
 * Stage 2 is triggered by data, not by a manager's judgement: the pod's score
 * crossing the org-configured threshold. A threshold of `null` means the rule is
 * not armed, so nothing triggers automatically.
 */
export function isStage2Triggered(
  score: number | null,
  threshold: number | null,
): boolean {
  if (score === null || threshold === null) return false;
  return score < threshold;
}

export function correctionEndDate(startDate: ISODate, days = CORRECTION_PERIOD_DAYS): ISODate {
  return addDays(startDate, days);
}

export function isCorrectionPeriodOver(endDate: ISODate, today: ISODate): boolean {
  return today >= endDate;
}

// ---------------------------------------------------------------------------
// Panel vote
// ---------------------------------------------------------------------------

export interface PanelVoteRecord {
  userId: string;
  vote: PanelVote | null;
}

export interface PanelTally {
  panelSize: number;
  cast: number;
  /** Votes still outstanding. */
  remaining: number;
  quorum: number;
  continueVotes: number;
  dissolveVotes: number;
  /**
   * True once the outcome cannot be changed by the votes still outstanding —
   * which includes every member having voted.
   */
  canFinalize: boolean;
  result: AccountabilityResult | null;
}

/** A strict majority of the panel, which is also the quorum to finalize. */
export function panelQuorum(panelSize: number): number {
  return Math.floor(panelSize / 2) + 1;
}

/**
 * Tally a panel vote.
 *
 * Two rules shape this:
 *
 *  1. A hung panel keeps the pod. Dissolution requires a majority *against*
 *     continuing, so the burden of proof sits with ending a unit.
 *  2. The result is only final once it is **mathematically certain** — a
 *     two-of-three panel that has split one vote each has not decided anything,
 *     because the third member could still carry it either way. Counting early
 *     would let a straggler's vote be discarded by the order people happened to
 *     vote in.
 */
export function tallyPanelVotes(members: readonly PanelVoteRecord[]): PanelTally {
  const panelSize = members.length;
  const cast = members.filter((member) => member.vote !== null).length;
  const remaining = panelSize - cast;
  const quorum = panelQuorum(panelSize);
  const continueVotes = members.filter((member) => member.vote === 'continue').length;
  const dissolveVotes = members.filter((member) => member.vote === 'dissolve').length;

  // Dissolution is certain when even every outstanding vote for it cannot be
  // beaten; continuation is certain when no outstanding vote can deliver a
  // majority against it (ties go to the pod).
  const dissolveCertain = dissolveVotes > continueVotes + remaining;
  const continueCertain = dissolveVotes + remaining <= continueVotes;
  const settled = remaining === 0 || dissolveCertain || continueCertain;

  const canFinalize = panelSize >= MIN_PANEL_SIZE && cast >= quorum && settled;
  const result: AccountabilityResult | null = canFinalize
    ? dissolveVotes > continueVotes
      ? 'dissolve'
      : 'continue'
    : null;

  return {
    panelSize,
    cast,
    remaining,
    quorum,
    continueVotes,
    dissolveVotes,
    canFinalize,
    result,
  };
}

/**
 * A warning shown while a panel is being constituted: fewer than three people
 * means the "never a single decision-maker" rule is not yet satisfiable.
 */
export function minPanelWarning(panelSize: number): string | null {
  if (panelSize >= MIN_PANEL_SIZE) return null;
  if (panelSize === 0) {
    return `No panel members yet — the vote needs at least ${MIN_PANEL_SIZE} people`;
  }
  return `Only ${panelSize} panel member${panelSize === 1 ? '' : 's'} so far — a dissolution decision needs at least ${MIN_PANEL_SIZE} people, never a single decision-maker`;
}

export function isPanelVote(value: unknown): value is PanelVote {
  return value === 'continue' || value === 'dissolve';
}
