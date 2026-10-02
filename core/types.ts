/**
 * Shared domain types (Phase 0 slice).
 *
 * These mirror the database schema in `db/migrations/` one-to-one and are safe
 * to import from both the API server and the Next.js app (no Node-only
 * dependencies, no database drivers).
 */

import type { ISODate } from './time';

export type UUID = string;

/** 01-INFORMATION-ARCHITECTURE.md §3 — roles are assignments, not identities. */
export const ROLE_TYPES = [
  'pod_member',
  'pod_lead',
  'peer_validator',
  'conflict_resolver',
  'coach',
  'hub_architecture',
  'hub_deployment',
  'hub_coaching',
  'hub_strategic',
  'investor',
  'holding_executive',
] as const;

export type RoleType = (typeof ROLE_TYPES)[number];

/** 13-TECHNICAL-ARCHITECTURE.md §4 — scope of a role assignment. */
export const SCOPE_TYPES = ['pod', 'cycle', 'case', 'holding', 'org'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const POD_STATUSES = ['trial', 'active', 'accountability', 'dissolved'] as const;
export type PodStatus = (typeof POD_STATUSES)[number];

export const USER_STATUSES = ['active', 'invited', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface Org {
  id: UUID;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Holding {
  id: UUID;
  orgId: UUID;
  name: string;
  code: string | null;
  createdAt: string;
}

export interface User {
  id: UUID;
  orgId: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  authSubject: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * A time-boxed role held by a user (13-TECHNICAL-ARCHITECTURE.md §4).
 * `endDate === null` means open-ended (e.g. plain pod membership).
 */
export interface RoleAssignment {
  id: UUID;
  userId: UUID;
  roleType: RoleType;
  scopeType: ScopeType;
  scopeId: UUID | null;
  startDate: ISODate;
  endDate: ISODate | null;
  createdBy: UUID | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface Pod {
  id: UUID;
  holdingId: UUID;
  name: string;
  categoryTag: string | null;
  status: PodStatus;
  createdAt: string;
  trialEndDate: ISODate | null;
  /**
   * One month of fixed costs — the Survival Budget floor's input
   * (15-BUSINESS-RULES-APPENDIX). Every calculation snapshots this into
   * `PodBudgetResult`, so a later change here never rewrites an announced budget.
   */
  monthlyFixedCosts: number;
}

export interface PodMembership {
  id: UUID;
  podId: UUID;
  userId: UUID;
  joinedAt: ISODate;
  leftAt: ISODate | null;
}

// --- CLOU agreements (Module 04) -------------------------------------------

export const CLOUD_STATUSES = [
  'proposed',
  'countered',
  'declined',
  'active',
  'renegotiating',
  'archived',
] as const;
export type CloudAgreementStatus = (typeof CLOUD_STATUSES)[number];

export const CLOUD_DIRECTIONS = ['a_to_b', 'b_to_a', 'bidirectional'] as const;
export type CloudDirection = (typeof CLOUD_DIRECTIONS)[number];

export const CLOUD_CADENCES = ['one_time', 'recurring'] as const;
export type CloudCadence = (typeof CLOUD_CADENCES)[number];

export const CLOUD_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
] as const;
export type CloudFrequency = (typeof CLOUD_FREQUENCIES)[number];

export const CLOUD_PRICING_MODELS = ['fixed_fee', 'per_unit', 'revenue_share', 'other'] as const;
export type CloudPricingModel = (typeof CLOUD_PRICING_MODELS)[number];

/** Structured pricing terms; `model: 'other'` carries a free-text `notes`. */
export interface CloudPricingTerms {
  model?: CloudPricingModel | null;
  amount?: string | null;
  unit?: string | null;
  notes?: string | null;
}

/** The negotiable part of an agreement — everything Step 2 of the wizard edits. */
export interface CloudTerms {
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  cadence: CloudCadence;
  frequency: CloudFrequency | null;
  pricingTerms: CloudPricingTerms;
}

export interface CloudAgreement {
  id: UUID;
  orgId: UUID;
  podAId: UUID;
  podBId: UUID;
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  cadence: CloudCadence;
  frequency: CloudFrequency | null;
  pricingTerms: CloudPricingTerms;
  status: CloudAgreementStatus;
  awaitingPodId: UUID | null;
  createdByUserId: UUID | null;
  startDate: ISODate | null;
  renewalDate: ISODate | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CLOUD_EVENT_TYPES = [
  'proposed',
  'countered',
  'accepted',
  'declined',
  'renegotiated',
  'renewed',
  'archived',
] as const;
export type CloudEventType = (typeof CLOUD_EVENT_TYPES)[number];

export interface CloudAgreementEvent {
  id: UUID;
  agreementId: UUID;
  eventType: CloudEventType;
  actorUserId: UUID | null;
  /** Snapshot of the terms at the time of the event (auditable history). */
  terms: Partial<CloudTerms> | null;
  note: string | null;
  createdAt: string;
}

export interface CloudArchiveConfirmation {
  id: UUID;
  agreementId: UUID;
  podId: UUID;
  confirmedByUserId: UUID | null;
  note: string | null;
  createdAt: string;
}

// --- Peer review & governance (Module 08) -----------------------------------

export type ReviewStatus = 'not_started' | 'in_progress' | 'submitted';

export interface PeerReview {
  id: UUID;
  cycleId: UUID;
  pitchId: UUID;
  reviewerUserId: UUID;
  score: number | null;
  rubricAnswers: Record<string, string | number>;
  comments: string | null;
  submittedAt: string | null;
  assignedAt: string;
}

export const CONFLICT_CASE_STATUSES = ['open', 'resolved', 'escalated'] as const;
export type ConflictCaseStatus = (typeof CONFLICT_CASE_STATUSES)[number];

export const CASE_AUTHOR_ROLES = ['resolver', 'pod_a', 'pod_b', 'system'] as const;
export type CaseAuthorRole = (typeof CASE_AUTHOR_ROLES)[number];

export interface ConflictCase {
  id: UUID;
  orgId: UUID;
  podAId: UUID;
  podBId: UUID;
  resolverUserId: UUID;
  subject: string;
  status: ConflictCaseStatus;
  recommendationText: string | null;
  escalatedToRuleReview: boolean;
  openedAt: string;
  closedAt: string | null;
}

export interface ConflictCaseEvent {
  id: UUID;
  caseId: UUID;
  authorUserId: UUID | null;
  authorRole: CaseAuthorRole;
  body: string;
  createdAt: string;
}

// --- Track 1: 90-Day Entry Rule ---------------------------------------------

export interface TrialCriterionRow {
  label: string;
  met: boolean | null;
}

export const ENTRY_RESULTS = ['full_entry', 'discontinued'] as const;
export type EntryResult = (typeof ENTRY_RESULTS)[number];

export const ENTRY_RECOMMENDATIONS = ['join', 'discontinue'] as const;
export type EntryRecommendation = (typeof ENTRY_RECOMMENDATIONS)[number];

export interface EntryTrial {
  id: UUID;
  orgId: UUID;
  podId: UUID;
  startDate: ISODate;
  decisionDueDate: ISODate;
  criteria: TrialCriterionRow[];
  podRepUserId: UUID | null;
  podRepRecommendation: EntryRecommendation | null;
  deploymentHubUserId: UUID | null;
  deploymentHubRecommendation: EntryRecommendation | null;
  finalResult: EntryResult | null;
  decidedAt: string | null;
  createdAt: string;
}

// --- Track 2: Accountability & Dissolution Path ------------------------------

export const ACCOUNTABILITY_STAGE_VALUES = [
  'transparency',
  'reduced_share',
  'mediation',
  'correction_period',
] as const;
export type AccountabilityStageValue = (typeof ACCOUNTABILITY_STAGE_VALUES)[number];

export const PANEL_VOTES = ['continue', 'dissolve'] as const;
export type PanelVoteValue = (typeof PANEL_VOTES)[number];

export const ACCOUNTABILITY_RESULTS = ['continue', 'dissolve'] as const;
export type AccountabilityResult = (typeof ACCOUNTABILITY_RESULTS)[number];

export interface AccountabilityCase {
  id: UUID;
  orgId: UUID;
  podId: UUID;
  currentStage: AccountabilityStageValue;
  stage2TriggeredAt: string | null;
  reductionApplied: boolean;
  correctionStartDate: ISODate | null;
  correctionEndDate: ISODate | null;
  assignedCoachUserId: UUID | null;
  conflictCaseId: UUID | null;
  finalResult: AccountabilityResult | null;
  decidedAt: string | null;
  openedAt: string;
}

export interface PanelMember {
  id: UUID;
  caseId: UUID;
  userId: UUID;
  roleLabel: string;
  vote: PanelVoteValue | null;
  comment: string | null;
  votedAt: string | null;
  createdAt: string;
}

export interface RuleChange {
  id: UUID;
  orgId: UUID;
  ruleName: string;
  oldValue: unknown;
  newValue: unknown;
  proposedBy: UUID | null;
  justification: string;
  effectiveCycleId: UUID | null;
  effectiveCycleNumber: number;
  approvedAt: string | null;
  createdAt: string;
}

/** Append-only security/technical audit trail (13-TECHNICAL-ARCHITECTURE.md §6). */
export interface AuditLogEntry {
  id: UUID;
  actorUserId: UUID | null;
  action: string;
  entityType: string | null;
  entityId: UUID | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  ip: string | null;
  createdAt: string;
}

/** Minimal identity of the acting principal, resolved from a verified session. */
export interface Principal {
  id: UUID;
  orgId: UUID;
  email: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// Internal Budget Market (Module 05)
// ---------------------------------------------------------------------------

/**
 * The budget cycle is a *view over* a sprint cycle, never a second calendar.
 * Start and end dates are deliberately absent from this type: phase math lives
 * in core/calendar.ts so the Day 89–90 lock window is the same answer every
 * module already agrees on (06-MODULE-SPRINT-CALENDAR.md).
 */
export type BudgetCycleStatus = 'provisional' | 'locked';

export interface BudgetCycleTotals {
  /** Survival budgets reserved before the formula ran. */
  reservedForSurvival: number | null;
  /** What was left for the proportional formula. */
  distributablePool: number | null;
  /** The hard ceiling per pod, in money units. */
  capAmount: number | null;
  totalCapped: number | null;
  totalRedistributed: number | null;
  /**
   * Pool nobody can receive because every pod already sits at the ceiling.
   * With fewer than four pods the caps sum to less than the whole pool, so this
   * is a legitimate outcome — reported, never spent silently.
   */
  unallocated: number | null;
  /** Positive when the pool cannot even cover the survival budgets. */
  shortfall: number | null;
  survivalScaled: boolean;
}

export interface BudgetCycle extends BudgetCycleTotals {
  id: UUID;
  orgId: UUID;
  cycleId: UUID;
  cycleNumber: number;
  status: BudgetCycleStatus;
  totalPool: number;
  /** Snapshot of the weights in force when this cycle was computed. */
  formulaWeights: Record<string, number>;
  capFraction: number;
  calculatedAt: string | null;
  lockedAt: string | null;
  lockedBy: UUID | null;
  auditHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BudgetComponentType = 'financial' | 'peer_review' | 'strategic';

/**
 * One of the three weighted inputs, kept with its provenance: the raw values it
 * was derived from, the normalization method, and a one-line "why". Without
 * these the breakdown screen could only show a bare number, which is exactly
 * what 05-MODULE-BUDGET-MARKET.md forbids.
 */
export interface PodScoreComponent {
  id: UUID;
  budgetCycleId: UUID;
  cycleId: UUID;
  podId: UUID;
  componentType: BudgetComponentType;
  rawInputs: Record<string, unknown>;
  normalizationMethod: string;
  score: number;
  explanation: string | null;
  calculatedAt: string;
}

export interface PodBudgetResult {
  id: UUID;
  budgetCycleId: UUID;
  cycleId: UUID;
  podId: UUID;
  unitScore: number;
  /** Snapshot of the pod's fixed costs at calculation time. */
  monthlyFixedCosts: number;
  survivalBudget: number;
  survivalBudgetApplied: boolean;
  /** What the proportional formula wanted before the ceiling intervened. */
  rawBudgetShare: number;
  formulaShare: number;
  capApplied: boolean;
  capReduction: number;
  redistributedAmount: number;
  finalBudget: number;
  shareOfPoolPercent: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Read model for the connector status banner (13-TECHNICAL-ARCHITECTURE.md §5). */
export type FinancialSyncStatus = 'ok' | 'failed' | 'stale';

export interface FinancialSyncRecord {
  id: UUID;
  podId: UUID;
  cycleId: UUID | null;
  sourceSystem: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  status: FinancialSyncStatus;
  revenue: number | null;
  costs: number | null;
  profit: number | null;
  currency: string;
  fetchedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface StrategicGoal {
  id: UUID;
  orgId: UUID;
  label: string;
  description: string | null;
  active: boolean;
  createdAt: string;
}

export interface PodGoalAlignment {
  id: UUID;
  orgId: UUID;
  cycleId: UUID;
  podId: UUID;
  goalId: UUID;
  score: number;
  weight: number;
  scoredBy: UUID | null;
  rationale: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Coaching (Module 07)
// ---------------------------------------------------------------------------

/**
 * The pod-facing half of a coaching session.
 *
 * This is the *only* session shape a pod member or pod lead ever receives. It
 * is a distinct type rather than `CoachingSession` with an optional field so
 * that a handler which has not checked `coach.view_private_notes` cannot even
 * name the private one — the compiler rejects it. Backed by the
 * `coaching_session_pod_visible` view, whose column list omits `private_notes`
 * entirely (07 §business logic: row-level access control, not UI hiding).
 */
export interface PodVisibleSession {
  id: UUID;
  coachUserId: UUID;
  podId: UUID;
  occurredAt: string;
  sessionType: CoachingSessionType;
  /** `null` means the coach saved privately and shared nothing. */
  podVisibleSummary: string | null;
  sharedWithPod: boolean;
  createdAt: string;
}

/** The coach-and-Coaching-Hub-only shape. Never returned to any other role. */
export interface CoachingSession extends PodVisibleSession {
  orgId: UUID;
  privateNotes: string;
  requestId: UUID | null;
  updatedAt: string;
}

export const COACHING_SESSION_TYPES = [
  'check_in',
  'conflict_support',
  'skill_development',
  'other',
] as const;

export type CoachingSessionType = (typeof COACHING_SESSION_TYPES)[number];

export type CoachAssignmentStatus = 'active' | 'ended';

export interface CoachAssignment {
  id: UUID;
  orgId: UUID;
  coachUserId: UUID;
  podId: UUID;
  startCycleId: UUID;
  endCycleId: UUID | null;
  status: CoachAssignmentStatus;
  reasonForChange: string | null;
  createdBy: UUID | null;
  createdAt: string;
  updatedAt: string;
}

/** Self-reported, never inferred (07 §roster). */
export type CoachCapacity = 'comfortable' | 'stretched';

export interface CoachProfile {
  id: UUID;
  orgId: UUID;
  coachUserId: UUID;
  schedulingUrl: string | null;
  capacity: CoachCapacity;
  capacityStatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SessionRequestStatus = 'open' | 'scheduled' | 'declined';

export type SessionRequestUrgency = 'low' | 'normal' | 'high';

export interface CoachingSessionRequest {
  id: UUID;
  orgId: UUID;
  podId: UUID;
  coachUserId: UUID;
  requestedBy: UUID;
  topic: string;
  urgency: SessionRequestUrgency;
  preferredTimes: string | null;
  status: SessionRequestStatus;
  sessionId: UUID | null;
  respondedAt: string | null;
  createdAt: string;
}

/**
 * A stored health signal for one pod in one cycle.
 *
 * Derived, never authored: `signalScore` and `signalColor` come from the pure
 * formula in `core/health.ts`, and `contributingFactors` is the snapshot of the
 * inputs it used. The database rejects a row whose colour contradicts its
 * score, so the two can never disagree on the coach console.
 */
export interface PodHealthSignal {
  id: UUID;
  orgId: UUID;
  podId: UUID;
  cycleId: UUID;
  signalColor: import('./health').HealthColor;
  signalScore: number;
  scoreParts: import('./health').HealthScoreParts;
  contributingFactors: import('./health').HealthSignal['factors'];
  /**
   * Which cycle each input came from. Peer-review sentiment in particular is
   * usually one cycle behind, because reviews land on Days 86–88 — so a signal
   * that could not name its sources would be unanswerable when a coach asks why
   * a pod is red.
   */
  provenance: import('./health').HealthSignalProvenance | null;
  formulaVersion: string;
  computedAt: string;
}

// ===========================================================================
// Notifications (Module 11)
// ===========================================================================

export type NotificationUrgency = 'informational' | 'action_required' | 'urgent';

export type NotificationChannel = 'in_app' | 'email' | 'digest';

export interface Notification {
  id: UUID;
  orgId: UUID;
  recipientUserId: UUID;
  /** The canonical trigger, e.g. 'pitch_window_opened'. */
  triggerType: string;
  urgency: NotificationUrgency;
  title: string;
  contextText: string | null;
  deepLink: string | null;
  relatedEntityType: string | null;
  relatedEntityId: UUID | null;
  sourceEventId: UUID | null;
  readAt: string | null;
  actionedAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  id: UUID;
  userId: UUID;
  urgencyLevel: NotificationUrgency;
  channel: NotificationChannel;
  enabled: boolean;
}

// ===========================================================================
// Archive & organizational memory (Module 10)
// ===========================================================================

export type ArchiveEntityType =
  | 'pitch'
  | 'cloud'
  | 'budget_cycle'
  | 'accountability_case'
  | 'entry_trial'
  | 'rule_change'
  | 'lesson'
  | 'pod'
  | 'correction';

/**
 * A search-and-index pointer, never a copy of the source record. `entityType`
 * + `entityId` deep-link back to the module of origin; the archive holds just
 * enough (title, summary, tags) to list and filter results.
 */
export interface ArchiveIndexEntry {
  id: UUID;
  orgId: UUID;
  entityType: ArchiveEntityType;
  entityId: UUID | null;
  title: string;
  summary: string | null;
  podIds: UUID[];
  holdingId: UUID | null;
  tags: string[];
  occurredAt: string;
  indexedAt: string;
  sourceEventId: UUID | null;
}

export interface LessonLearned {
  id: UUID;
  orgId: UUID;
  relatedEntityType: string | null;
  relatedEntityId: UUID | null;
  whatHappened: string;
  whatWedDoDifferently: string | null;
  tags: string[];
  createdBy: UUID | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Strategic Hub (Module 09)
// ---------------------------------------------------------------------------

/**
 * The pilot timeline from the source model, mapped 1:1 (15: "Reference pilot
 * example"): 8 preparation weeks, one 90-day sprint, then the decision.
 */
export const PILOT_PHASES = [
  'selection_diagnostic', // Weeks 1–2: selection + diagnostic interviews
  'pod_split_charter', // Weeks 3–4: pod split, coach assignment, charter
  'platform_setup', // Weeks 5–6: lightweight platform setup
  'rules_training', // Weeks 7–8: team training on rules
  'sprint', // Sprint Days 1–90
  'evaluation', // Post-Day-90 decision
] as const;
export type PilotPhase = (typeof PILOT_PHASES)[number];

export const PILOT_PHASE_STATUSES = ['not_started', 'in_progress', 'done'] as const;
export type PilotPhaseStatus = (typeof PILOT_PHASE_STATUSES)[number];

export const PILOT_DECISIONS = ['stop', 'repeat', 'expand'] as const;
export type PilotDecision = (typeof PILOT_DECISIONS)[number];

export interface PilotPhaseState {
  status: PilotPhaseStatus;
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
  id: UUID;
  orgId: UUID;
  name: string;
  holdingId: UUID | null;
  pilotPodId: UUID | null;
  currentPhase: PilotPhase;
  phaseStatus: Partial<Record<PilotPhase, PilotPhaseState>>;
  successCriteria: PilotSuccessCriteria;
  decision: PilotDecision | null;
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
  [key: string]: unknown;
}

export interface InvestorReport {
  id: UUID;
  orgId: UUID;
  generatedBy: UUID | null;
  dateFrom: ISODate;
  dateTo: ISODate;
  scope: { holdingIds: UUID[]; podIds: UUID[] };
  metrics: InvestorReportMetrics;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export const CONTACT_RELATIONSHIP_TYPES = ['investor', 'partner', 'media', 'institution'] as const;
export type ContactRelationshipType = (typeof CONTACT_RELATIONSHIP_TYPES)[number];

export interface ExternalContact {
  id: UUID;
  orgId: UUID;
  name: string;
  relationshipType: ContactRelationshipType;
  lastInteractionAt: ISODate | null;
  notes: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Correction Records (13-TECHNICAL-ARCHITECTURE.md §7, Phase 8)
// ---------------------------------------------------------------------------

export const CORRECTION_ENTITY_TYPES = [
  'budget_result',
  'financial_sync',
  'entry_trial',
  'accountability_case',
  'peer_review_score',
] as const;
export type CorrectionEntityType = (typeof CORRECTION_ENTITY_TYPES)[number];

export const CORRECTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/**
 * The system's ONE path for fixing a locked record. Never overwrites the
 * original row — the record stores frozen snapshots of both values, and the
 * two-person rule (propose then a *different* Architecture Hub user approves)
 * is enforced structurally (`approved_by <> proposed_by`) and in the service.
 */
export interface CorrectionRecord {
  id: UUID;
  orgId: UUID;
  originalEntityType: CorrectionEntityType;
  originalEntityId: UUID;
  fieldCorrected: string;
  originalValue: unknown;
  correctedValue: unknown;
  reason: string;
  proposedBy: UUID;
  proposedByName: string | null;
  approvedBy: UUID | null;
  approvedByName: string | null;
  status: CorrectionStatus;
  decidedAt: string | null;
  createdAt: string;
  /** The pod the corrected record belongs to (resolved in listings). */
  podId?: UUID | null;
  podName?: string | null;
}
