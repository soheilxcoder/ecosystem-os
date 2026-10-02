/**
 * Payload shapes for the Strategic Hub Console (Module 09).
 *
 * Mirrors the API envelope of `server/routes/hub.ts`. Kept separate from
 * `core/types` on purpose: these are transport shapes the UI renders, not the
 * source-of-truth domain model.
 */

import type { ISODate } from '../core/time';
import type { RosterPayload } from './types-coaching';

export interface TrialStatusRow {
  podId: string;
  podName: string;
  holdingName: string | null;
  trialId: string | null;
  decisionDueDate: ISODate | null;
  daysRemaining: number | null;
  criteriaMet: number;
  criteriaTotal: number;
  completionPercent: number;
}

export type PilotPhase =
  | 'selection_diagnostic'
  | 'pod_split_charter'
  | 'platform_setup'
  | 'rules_training'
  | 'sprint'
  | 'evaluation';

export const PILOT_PHASE_ORDER: PilotPhase[] = [
  'selection_diagnostic',
  'pod_split_charter',
  'platform_setup',
  'rules_training',
  'sprint',
  'evaluation',
];

export const PILOT_PHASE_LABELS: Record<PilotPhase, string> = {
  selection_diagnostic: 'Weeks 1–2 — Selection & diagnostic interviews',
  pod_split_charter: 'Weeks 3–4 — Pod split, coach assignment, charter',
  platform_setup: 'Weeks 5–6 — Lightweight platform setup',
  rules_training: 'Weeks 7–8 — Team training on rules',
  sprint: 'Sprint Days 1–90',
  evaluation: 'Post-Day-90 — Evaluation & decision',
};

export interface PilotPhaseState {
  status: 'not_started' | 'in_progress' | 'done';
  owner: string | null;
}

export interface PilotSuccessCriteria {
  decisionTimeBaseline?: number | null;
  decisionTimeCurrent?: number | null;
  satisfactionScore?: number | null;
  profitBudgetRatioBaseline?: number | null;
  profitBudgetRatioCurrent?: number | null;
}

export interface PilotProgram {
  id: string;
  orgId: string;
  name: string;
  holdingId: string | null;
  pilotPodId: string | null;
  currentPhase: PilotPhase;
  phaseStatus: Partial<Record<PilotPhase, PilotPhaseState>>;
  successCriteria: PilotSuccessCriteria;
  decision: 'stop' | 'repeat' | 'expand' | null;
  decidedAt: string | null;
  lessonsLearned: string | null;
  createdAt: string;
}

export interface InvestorReportMetrics {
  totalBudgetDistributed?: number;
  activePodCount?: number;
  podsPastTrial?: number;
  podsDiscontinued?: number;
  aggregateFinancialTrend?: number | null;
  podCountInScope?: number;
}

export interface InvestorReport {
  id: string;
  orgId: string;
  generatedBy: string;
  dateFrom: ISODate;
  dateTo: ISODate;
  scope: { holdingIds: string[]; podIds: string[] };
  metrics: InvestorReportMetrics;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface ExternalContact {
  id: string;
  orgId: string;
  name: string;
  relationshipType: 'investor' | 'partner' | 'media' | 'institution';
  lastInteractionAt: ISODate | null;
  notes: string | null;
  createdAt: string;
}

export interface ModelHealth {
  activeRuleCount: number;
  pendingChangeCount: number;
  changelog: Array<{
    id: string;
    ruleName: string;
    oldValue: unknown;
    newValue: unknown;
    justification: string;
    effectiveCycleNumber: number;
    approvedAt: string | null;
    createdAt: string;
  }>;
}

export interface SetupUser {
  id: string;
  fullName: string;
  email: string;
}

export interface SetupData {
  users: SetupUser[];
  roster: RosterPayload;
}

export interface ExpansionPrefill {
  pilotId: string;
  pilotName: string;
  holdingId: string | null;
  suggestedName: string;
  lessonsLearned: string | null;
}

export interface LaunchResult {
  podId: string;
  trialId: string | null;
  memberCount: number;
  coachUserId: string | null;
  dataSourceConnected: boolean;
}

export type CorrectionEntityType =
  | 'budget_result'
  | 'financial_sync'
  | 'entry_trial'
  | 'accountability_case'
  | 'peer_review_score';

export interface CorrectionRecord {
  id: string;
  orgId: string;
  originalEntityType: CorrectionEntityType;
  originalEntityId: string;
  fieldCorrected: string;
  originalValue: unknown;
  correctedValue: unknown;
  reason: string;
  proposedBy: string;
  proposedByName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt: string | null;
  createdAt: string;
  /** The pod the corrected record belongs to (resolved in listings). */
  podId?: string | null;
  podName?: string | null;
}
