/**
 * Front-end types and labels for Module 08.
 *
 * These mirror the API payloads exactly — the screens are a rendering of the
 * server's view, not a second opinion on it. The one thing the client does own
 * is vocabulary: the two tracks' wording is deliberately different everywhere,
 * because the model's most emphatic instruction is that they must never look
 * like the same process.
 */

import type { StatusTone } from '../components/ui/StatusChip';
import {
  ACCOUNTABILITY_STAGES,
  STAGE_LABELS,
  STAGE_SUMMARIES,
  type AccountabilityStage,
} from '../core/accountability';

export type { AccountabilityStage };
export { ACCOUNTABILITY_STAGES, STAGE_LABELS, STAGE_SUMMARIES };

// ---------------------------------------------------------------------------
// Peer review
// ---------------------------------------------------------------------------

export interface QueueItemView {
  reviewId: string;
  pitchId: string;
  podId: string;
  podName: string;
  cycleId: string;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  pitchSummary: string | null;
  pitchPlan: string | null;
  status: 'not_started' | 'in_progress' | 'submitted';
  score: number | null;
  comments: string | null;
  rubricAnswers: Record<string, string | number>;
  submittedAt: string | null;
  peerAverage: number | null;
  windowOpen: boolean;
}

export interface ReviewablePitch {
  pitchId: string;
  podId: string;
  podName: string;
  cycleId: string;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  pitchSummary: string | null;
  pitchPlan: string | null;
  submittedAt: string | null;
  reviewerUserIds: string[];
}

export interface ReviewQueueView {
  items: QueueItemView[];
  cycleNumber: number | null;
  windowOpen: boolean;
  unassigned: ReviewablePitch[];
  reviewersPerPitch: number;
  minCommentLength: number;
}

export const REVIEW_STATUS_TONES: Record<QueueItemView['status'], StatusTone> = {
  not_started: 'neutral',
  in_progress: 'active',
  submitted: 'good',
};

export const REVIEW_STATUS_LABELS: Record<QueueItemView['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
};

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

export interface ConflictCaseView {
  id: string;
  orgId: string;
  podAId: string;
  podBId: string;
  resolverUserId: string;
  subject: string;
  status: 'open' | 'resolved' | 'escalated';
  recommendationText: string | null;
  escalatedToRuleReview: boolean;
  openedAt: string;
  closedAt: string | null;
  podAName: string;
  podBName: string;
  resolverName: string | null;
  eventCount: number;
  lastActivityAt: string | null;
}

export interface ConflictCaseEventView {
  id: string;
  caseId: string;
  authorUserId: string | null;
  authorRole: 'resolver' | 'pod_a' | 'pod_b' | 'system';
  body: string;
  createdAt: string;
}

export interface CaseDetailView extends ConflictCaseView {
  events: ConflictCaseEventView[];
}

export const CASE_STATUS_TONES: Record<ConflictCaseView['status'], StatusTone> = {
  open: 'watch',
  resolved: 'good',
  escalated: 'alert',
};

export const CASE_ROLE_LABELS: Record<ConflictCaseEventView['authorRole'], string> = {
  resolver: 'Conflict Resolver',
  pod_a: 'Pod A',
  pod_b: 'Pod B',
  system: 'System',
};

// ---------------------------------------------------------------------------
// Track 1 — 90-Day Entry Rule
// ---------------------------------------------------------------------------

export interface EntryTrialView {
  podId: string;
  podName: string;
  track: 'entry_trial';
  trial: {
    id: string;
    orgId: string;
    podId: string;
    startDate: string;
    decisionDueDate: string;
    criteria: Array<{ label: string; met: boolean | null }>;
    podRepUserId: string | null;
    podRepRecommendation: 'join' | 'discontinue' | null;
    deploymentHubUserId: string | null;
    deploymentHubRecommendation: 'join' | 'discontinue' | null;
    finalResult: 'full_entry' | 'discontinued' | null;
    decidedAt: string | null;
    createdAt: string;
  } | null;
  day: number | null;
  dueDate: string | null;
  daysRemaining: number | null;
  decisionUnlocked: boolean;
  progress: { total: number; met: number; outstanding: number; notApplicable: number } | null;
  podRep: { userId: string | null; recommendation: 'join' | 'discontinue' | null };
  hubRep: { userId: string | null; recommendation: 'join' | 'discontinue' | null };
  jointResult: 'full_entry' | 'discontinued' | null;
  crossReference: { track: 'accountability' | 'none'; label: string; href: string | null };
  canRecord: { pod: boolean; hub: boolean };
  totalDays: number;
}

export const ENTRY_RESULT_COPY: Record<'full_entry' | 'discontinued', string> = {
  full_entry: 'RESULT: Full entry — this unit joins the ecosystem on the standard terms.',
  discontinued: 'RESULT: Discontinued — no correction period applies (Entry Rule).',
};

export const RECOMMENDATION_COPY: Record<'join' | 'discontinue', string> = {
  join: 'Join fully',
  discontinue: 'Do not continue',
};

// ---------------------------------------------------------------------------
// Track 2 — Accountability Path
// ---------------------------------------------------------------------------

export interface AccountabilityCaseView {
  id: string;
  stage2TriggeredAt: string | null;
  reductionApplied: boolean;
  correctionStartDate: string | null;
  correctionEndDate: string | null;
  correctionDaysRemaining: number | null;
  finalResult: 'continue' | 'dissolve' | null;
  decidedAt: string | null;
  openedAt: string;
}

export interface PanelMemberView {
  memberId: string;
  userId: string;
  name: string;
  roleLabel: string;
  vote: 'continue' | 'dissolve' | null;
  comment: string | null;
  votedAt: string | null;
}

export interface AccountabilityView {
  podId: string;
  podName: string;
  track: 'accountability';
  stage: AccountabilityStage;
  stages: Array<{
    key: AccountabilityStage;
    label: string;
    summary: string;
    state: 'done' | 'current' | 'upcoming';
  }>;
  currentStageLabel: string;
  currentStageSummary: string;
  case_: AccountabilityCaseView | null;
  panel: PanelMemberView[];
  tally: {
    panelSize: number;
    cast: number;
    remaining: number;
    quorum: number;
    continueVotes: number;
    dissolveVotes: number;
    canFinalize: boolean;
    result: 'continue' | 'dissolve' | null;
  } | null;
  panelWarning: string | null;
  canAdvance: boolean;
  nextStage: AccountabilityStage | null;
  correctionPeriodOver: boolean;
  crossReference: { track: 'entry_trial' | 'none'; label: string; href: string | null };
  settings: {
    accountabilityStage2ScoreThreshold: number | null;
    accountabilityPanelSize: number;
    accountabilityCorrectionDays: number;
    reviewReviewersPerPitch: number;
    reviewCommentMinLength: number;
  };
}

export const STAGE_TONES: Record<'done' | 'current' | 'upcoming', StatusTone> = {
  done: 'good',
  current: 'active',
  upcoming: 'neutral',
};

export const ACCOUNTABILITY_RESULT_COPY: Record<'continue' | 'dissolve', string> = {
  continue: 'RESULT: The panel voted to continue — the pod stays and the case closes.',
  dissolve: 'RESULT: The panel voted to dissolve — the unit is wound down with its record intact.',
};

// ---------------------------------------------------------------------------
// Rule versioning
// ---------------------------------------------------------------------------

export interface RuleChangeView {
  id: string;
  orgId: string;
  ruleName: string;
  oldValue: unknown;
  newValue: unknown;
  proposedBy: string | null;
  justification: string;
  effectiveCycleId: string | null;
  effectiveCycleNumber: number;
  approvedAt: string | null;
  createdAt: string;
}

export interface RuleRegistryView {
  key: string;
  label: string;
  source: 'cycle_config' | 'org_governance_config' | 'recorded';
  defaultValue: unknown;
  currentValue: unknown;
  history: RuleChangeView[];
}

export const RULE_SOURCE_LABELS: Record<RuleRegistryView['source'], string> = {
  cycle_config: 'Sprint cycle configuration',
  org_governance_config: 'Organisation governance settings',
  recorded: 'Recorded for the record — applied by the Budget module',
};
