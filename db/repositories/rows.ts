/** Row <-> domain mapping helpers (snake_case columns, camelCase domain types). */

import type {
  AuditLogEntry,
  Holding,
  Org,
  Pod,
  PodMembership,
  RoleAssignment,
  User,
} from '../../core/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toOrg(row: any): Org {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toHolding(row: any): Holding {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    code: row.code ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toUser(row: any): User {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url ?? null,
    authSubject: row.auth_subject ?? null,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

export function toRoleAssignment(row: any): RoleAssignment {
  return {
    id: row.id,
    userId: row.user_id,
    roleType: row.role_type,
    scopeType: row.scope_type,
    scopeId: row.scope_id ?? null,
    startDate: toDateString(row.start_date),
    endDate: row.end_date === null || row.end_date === undefined ? null : toDateString(row.end_date),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    revokedAt: row.revoked_at ? (row.revoked_at.toISOString?.() ?? row.revoked_at) : null,
  };
}

export function toPod(row: any): Pod {
  return {
    id: row.id,
    holdingId: row.holding_id,
    name: row.name,
    categoryTag: row.category_tag ?? null,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    trialEndDate: row.trial_end_date === null || row.trial_end_date === undefined
      ? null
      : toDateString(row.trial_end_date),
    monthlyFixedCosts: num(row.monthly_fixed_costs, 0),
  };
}

export function toPodMembership(row: any): PodMembership {
  return {
    id: row.id,
    podId: row.pod_id,
    userId: row.user_id,
    joinedAt: toDateString(row.joined_at),
    leftAt: row.left_at === null || row.left_at === undefined ? null : toDateString(row.left_at),
  };
}

export function toAuditLogEntry(row: any): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    action: row.action,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    metadata: row.metadata ?? {},
    requestId: row.request_id ?? null,
    ip: row.ip ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toCloudAgreement(row: any): import('../../core/types').CloudAgreement {
  return {
    id: row.id,
    orgId: row.org_id,
    podAId: row.pod_a_id,
    podBId: row.pod_b_id,
    name: row.name,
    serviceDescription: row.service_description,
    direction: row.direction,
    cadence: row.cadence,
    frequency: row.frequency ?? null,
    pricingTerms: (row.pricing_terms ?? {}) as import('../../core/types').CloudPricingTerms,
    status: row.status,
    awaitingPodId: row.awaiting_pod_id ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    startDate: optionalDate(row.start_date),
    renewalDate: optionalDate(row.renewal_date),
    activatedAt: row.activated_at ? (row.activated_at.toISOString?.() ?? row.activated_at) : null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.last_updated_at?.toISOString?.() ?? row.last_updated_at,
  };
}

export function toCloudAgreementEvent(row: any): import('../../core/types').CloudAgreementEvent {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id ?? null,
    terms: (row.terms ?? null) as import('../../core/types').CloudTerms | null,
    note: row.note ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toCloudArchiveConfirmation(
  row: any,
): import('../../core/types').CloudArchiveConfirmation {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    podId: row.pod_id,
    confirmedByUserId: row.confirmed_by_user_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toPeerReview(row: any): import('../../core/types').PeerReview {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    pitchId: row.pitch_id,
    reviewerUserId: row.reviewer_user_id,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    rubricAnswers: (row.rubric_answers ?? {}) as Record<string, string | number>,
    comments: row.comments ?? null,
    submittedAt: row.submitted_at ? (row.submitted_at.toISOString?.() ?? row.submitted_at) : null,
    assignedAt: row.assigned_at?.toISOString?.() ?? row.assigned_at,
  };
}

export function toConflictCase(row: any): import('../../core/types').ConflictCase {
  return {
    id: row.id,
    orgId: row.org_id,
    podAId: row.pod_a_id,
    podBId: row.pod_b_id,
    resolverUserId: row.resolver_user_id,
    subject: row.subject,
    status: row.status,
    recommendationText: row.recommendation_text ?? null,
    escalatedToRuleReview: Boolean(row.escalated_to_rule_review),
    openedAt: row.opened_at?.toISOString?.() ?? row.opened_at,
    closedAt: row.closed_at ? (row.closed_at.toISOString?.() ?? row.closed_at) : null,
  };
}

export function toConflictCaseEvent(row: any): import('../../core/types').ConflictCaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    authorUserId: row.author_user_id ?? null,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toEntryTrial(row: any): import('../../core/types').EntryTrial {
  return {
    id: row.id,
    orgId: row.org_id,
    podId: row.pod_id,
    startDate: toDateString(row.start_date),
    decisionDueDate: toDateString(row.decision_due_date),
    criteria: (row.criteria ?? []) as import('../../core/types').TrialCriterionRow[],
    podRepUserId: row.pod_rep_user_id ?? null,
    podRepRecommendation: row.pod_rep_recommendation ?? null,
    deploymentHubUserId: row.deployment_hub_user_id ?? null,
    deploymentHubRecommendation: row.deployment_hub_recommendation ?? null,
    finalResult: row.final_result ?? null,
    decidedAt: row.decided_at ? (row.decided_at.toISOString?.() ?? row.decided_at) : null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toAccountabilityCase(
  row: any,
): import('../../core/types').AccountabilityCase {
  return {
    id: row.id,
    orgId: row.org_id,
    podId: row.pod_id,
    currentStage: row.current_stage,
    stage2TriggeredAt: row.stage_2_triggered_at
      ? (row.stage_2_triggered_at.toISOString?.() ?? row.stage_2_triggered_at)
      : null,
    reductionApplied: Boolean(row.reduction_applied),
    correctionStartDate: optionalDate(row.correction_start_date),
    correctionEndDate: optionalDate(row.correction_end_date),
    assignedCoachUserId: row.assigned_coach_user_id ?? null,
    conflictCaseId: row.conflict_case_id ?? null,
    finalResult: row.final_result ?? null,
    decidedAt: row.decided_at ? (row.decided_at.toISOString?.() ?? row.decided_at) : null,
    openedAt: row.opened_at?.toISOString?.() ?? row.opened_at,
  };
}

export function toPanelMember(row: any): import('../../core/types').PanelMember {
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    roleLabel: row.role_label ?? 'Panel member',
    vote: row.vote ?? null,
    comment: row.comment ?? null,
    votedAt: row.voted_at ? (row.voted_at.toISOString?.() ?? row.voted_at) : null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export function toRuleChange(row: any): import('../../core/types').RuleChange {
  return {
    id: row.id,
    orgId: row.org_id,
    ruleName: row.rule_name,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    proposedBy: row.proposed_by ?? null,
    justification: row.justification,
    effectiveCycleId: row.effective_cycle_id ?? null,
    effectiveCycleNumber: Number(row.effective_cycle_number ?? 1),
    approvedAt: row.approved_at ? (row.approved_at.toISOString?.() ?? row.approved_at) : null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toDateString(value);
}

/** Postgres DATE columns arrive as a Date (pg) or an ISO string (PGlite). */
export function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  throw new TypeError(`Cannot convert ${String(value)} to an ISO date`);
}

// ---------------------------------------------------------------------------
// Budget market (Module 05)
// ---------------------------------------------------------------------------

/**
 * Postgres NUMERIC columns arrive as strings from `pg` and as numbers from
 * PGlite. Every money and score field goes through here so the two drivers stay
 * interchangeable — a mismatch shows up as NaN in a formula, not as an error.
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stamp(value: unknown): string | null {
  if (!value) return null;
  return (value as any).toISOString?.() ?? String(value);
}

export function toBudgetCycle(row: any): import('../../core/types').BudgetCycle {
  return {
    id: row.id,
    orgId: row.org_id,
    cycleId: row.cycle_id,
    cycleNumber: Number(row.cycle_number),
    status: row.status,
    totalPool: num(row.total_pool),
    formulaWeights: (row.formula_weights ?? {}) as Record<string, number>,
    capFraction: num(row.cap_fraction, 0.3),
    reservedForSurvival: nullableNum(row.reserved_for_survival),
    distributablePool: nullableNum(row.distributable_pool),
    capAmount: nullableNum(row.cap_amount),
    totalCapped: nullableNum(row.total_capped),
    totalRedistributed: nullableNum(row.total_redistributed),
    unallocated: nullableNum(row.unallocated),
    shortfall: nullableNum(row.shortfall),
    survivalScaled: Boolean(row.survival_scaled),
    calculatedAt: stamp(row.calculated_at),
    lockedAt: stamp(row.locked_at),
    lockedBy: row.locked_by ?? null,
    auditHash: row.audit_hash ?? null,
    createdAt: stamp(row.created_at) ?? '',
    updatedAt: stamp(row.updated_at) ?? '',
  };
}

export function toPodScoreComponent(row: any): import('../../core/types').PodScoreComponent {
  return {
    id: row.id,
    budgetCycleId: row.budget_cycle_id,
    cycleId: row.cycle_id,
    podId: row.pod_id,
    componentType: row.component_type,
    rawInputs: (row.raw_inputs ?? {}) as Record<string, unknown>,
    normalizationMethod: row.normalization_method,
    score: num(row.score),
    explanation: row.explanation ?? null,
    calculatedAt: stamp(row.calculated_at) ?? '',
  };
}

export function toPodBudgetResult(row: any): import('../../core/types').PodBudgetResult {
  return {
    id: row.id,
    budgetCycleId: row.budget_cycle_id,
    cycleId: row.cycle_id,
    podId: row.pod_id,
    unitScore: num(row.unit_score),
    monthlyFixedCosts: num(row.monthly_fixed_costs),
    survivalBudget: num(row.survival_budget),
    survivalBudgetApplied: Boolean(row.survival_budget_applied),
    rawBudgetShare: num(row.raw_budget_share),
    formulaShare: num(row.formula_share),
    capApplied: Boolean(row.cap_applied),
    capReduction: num(row.cap_reduction),
    redistributedAmount: num(row.redistributed_amount),
    finalBudget: num(row.final_budget),
    shareOfPoolPercent: num(row.share_of_pool_percent),
    locked: Boolean(row.locked),
    createdAt: stamp(row.created_at) ?? '',
    updatedAt: stamp(row.updated_at) ?? '',
  };
}

export function toFinancialSyncRecord(row: any): import('../../core/types').FinancialSyncRecord {
  return {
    id: row.id,
    podId: row.pod_id,
    cycleId: row.cycle_id ?? null,
    sourceSystem: row.source_system,
    periodStart: toDateString(row.period_start),
    periodEnd: toDateString(row.period_end),
    status: row.status,
    revenue: nullableNum(row.revenue),
    costs: nullableNum(row.costs),
    profit: nullableNum(row.profit),
    currency: row.currency,
    fetchedAt: stamp(row.fetched_at),
    error: row.error ?? null,
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toStrategicGoal(row: any): import('../../core/types').StrategicGoal {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    description: row.description ?? null,
    active: Boolean(row.active),
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toPodGoalAlignment(row: any): import('../../core/types').PodGoalAlignment {
  return {
    id: row.id,
    orgId: row.org_id,
    cycleId: row.cycle_id,
    podId: row.pod_id,
    goalId: row.goal_id,
    score: num(row.score),
    weight: num(row.weight, 1),
    scoredBy: row.scored_by ?? null,
    rationale: row.rationale ?? null,
    createdAt: stamp(row.created_at) ?? '',
  };
}

// ---------------------------------------------------------------------------
// Coaching (Module 07)
// ---------------------------------------------------------------------------

/**
 * The pod-facing session shape.
 *
 * Note what is *absent*: no `privateNotes`. Rows read through the
 * `coaching_session_pod_visible` view do not carry the column at all, and this
 * mapper does not invent it. That is the query-layer guarantee 07 asks for —
 * there is no field here to leak, rather than a field that is filtered out.
 */
export function toPodVisibleSession(row: any): import('../../core/types').PodVisibleSession {
  return {
    id: row.id,
    coachUserId: row.coach_user_id,
    podId: row.pod_id,
    occurredAt: stamp(row.occurred_at) ?? '',
    sessionType: row.session_type,
    podVisibleSummary: row.pod_visible_summary ?? null,
    sharedWithPod: Boolean(row.shared_with_pod),
    createdAt: stamp(row.created_at) ?? '',
  };
}

/**
 * The full session, private notes included.
 *
 * Only ever called on rows selected from `coaching_session` by a path that has
 * already established the caller is the assigned coach or the Coaching Hub —
 * see `db/repositories/coaching.ts`, which keeps the two read paths in
 * differently named functions so the choice is visible at every call site.
 */
export function toCoachingSession(row: any): import('../../core/types').CoachingSession {
  return {
    ...toPodVisibleSession(row),
    orgId: row.org_id,
    privateNotes: row.private_notes ?? '',
    requestId: row.request_id ?? null,
    updatedAt: stamp(row.updated_at) ?? '',
  };
}

export function toCoachAssignment(row: any): import('../../core/types').CoachAssignment {
  return {
    id: row.id,
    orgId: row.org_id,
    coachUserId: row.coach_user_id,
    podId: row.pod_id,
    startCycleId: row.start_cycle_id,
    endCycleId: row.end_cycle_id ?? null,
    status: row.status,
    reasonForChange: row.reason_for_change ?? null,
    createdBy: row.created_by ?? null,
    createdAt: stamp(row.created_at) ?? '',
    updatedAt: stamp(row.updated_at) ?? '',
  };
}

export function toCoachProfile(row: any): import('../../core/types').CoachProfile {
  return {
    id: row.id,
    orgId: row.org_id,
    coachUserId: row.coach_user_id,
    schedulingUrl: row.scheduling_url ?? null,
    capacity: row.capacity ?? 'comfortable',
    capacityStatedAt: stamp(row.capacity_stated_at),
    createdAt: stamp(row.created_at) ?? '',
    updatedAt: stamp(row.updated_at) ?? '',
  };
}

export function toCoachingSessionRequest(
  row: any,
): import('../../core/types').CoachingSessionRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    podId: row.pod_id,
    coachUserId: row.coach_user_id,
    requestedBy: row.requested_by,
    topic: row.topic,
    urgency: row.urgency ?? 'normal',
    preferredTimes: row.preferred_times ?? null,
    status: row.status ?? 'open',
    sessionId: row.session_id ?? null,
    respondedAt: stamp(row.responded_at),
    createdAt: stamp(row.created_at) ?? '',
  };
}

/**
 * A stored health signal.
 *
 * The JSON columns are read defensively: `contributing_factors` is written by
 * `core/health.ts` and read back verbatim, but an older row (or one written by
 * a previous `formula_version`) may be missing a key. Anything absent falls
 * back to the same default the formula itself would have used, so a signal
 * never renders as `undefined` on the console.
 */
export function toPodHealthSignal(row: any): import('../../core/types').PodHealthSignal {
  const factors = (row.contributing_factors ?? {}) as Record<string, unknown>;
  const parts = (row.score_parts ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    orgId: row.org_id,
    podId: row.pod_id,
    cycleId: row.cycle_id,
    signalColor: row.signal_color,
    signalScore: num(row.signal_score),
    scoreParts: {
      checkinReliability: num(parts.checkinReliability),
      peerReviewSentiment: num(parts.peerReviewSentiment),
      budgetScoreTrend: num(parts.budgetScoreTrend),
    },
    contributingFactors: {
      atRiskCheckins: num(factors.atRiskCheckins),
      checkins: num(factors.checkins),
      atRiskRate: num(factors.atRiskRate),
      scoreTrend:
        factors.scoreTrend === null || factors.scoreTrend === undefined
          ? null
          : num(factors.scoreTrend),
      reviewSentiment: num(factors.reviewSentiment),
      sentimentAssumed: Boolean(factors.sentimentAssumed),
      trendAssumed: Boolean(factors.trendAssumed),
    },
    // Provenance is written by the service, not derived by the formula, and a
    // row computed before it existed simply has none. Read it as given.
    provenance: (row.provenance ?? null) as import('../../core/types').PodHealthSignal['provenance'],
    formulaVersion: row.formula_version ?? 'health.v1',
    computedAt: stamp(row.computed_at) ?? '',
  };
}

// ---------------------------------------------------------------------------
// Notifications (Module 11)
// ---------------------------------------------------------------------------

export function toNotification(row: any): import('../../core/types').Notification {
  return {
    id: row.id,
    orgId: row.org_id,
    recipientUserId: row.recipient_user_id,
    triggerType: row.trigger_type,
    urgency: row.urgency,
    title: row.title,
    contextText: row.context_text ?? null,
    deepLink: row.deep_link ?? null,
    relatedEntityType: row.related_entity_type ?? null,
    relatedEntityId: row.related_entity_id ?? null,
    sourceEventId: row.source_event_id ?? null,
    readAt: stamp(row.read_at),
    actionedAt: stamp(row.actioned_at),
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toNotificationPreference(row: any): import('../../core/types').NotificationPreference {
  return {
    id: row.id,
    userId: row.user_id,
    urgencyLevel: row.urgency_level,
    channel: row.channel,
    enabled: Boolean(row.enabled),
  };
}

// ---------------------------------------------------------------------------
// Archive & organizational memory (Module 10)
// ---------------------------------------------------------------------------

export function toArchiveIndexEntry(row: any): import('../../core/types').ArchiveIndexEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    title: row.title,
    summary: row.summary ?? null,
    podIds: Array.isArray(row.pod_ids) ? row.pod_ids : [],
    holdingId: row.holding_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    occurredAt: stamp(row.occurred_at) ?? '',
    indexedAt: stamp(row.indexed_at) ?? '',
    sourceEventId: row.source_event_id ?? null,
  };
}

export function toLessonLearned(row: any): import('../../core/types').LessonLearned {
  return {
    id: row.id,
    orgId: row.org_id,
    relatedEntityType: row.related_entity_type ?? null,
    relatedEntityId: row.related_entity_id ?? null,
    whatHappened: row.what_happened,
    whatWedDoDifferently: row.what_wed_do_differently ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdBy: row.created_by ?? null,
    createdAt: stamp(row.created_at) ?? '',
  };
}

// ---------------------------------------------------------------------------
// Strategic Hub (Module 09)
// ---------------------------------------------------------------------------

export function jsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toPilotProgram(row: any): import('../../core/types').PilotProgram {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    holdingId: row.holding_id ?? null,
    pilotPodId: row.pilot_pod_id ?? null,
    currentPhase: row.current_phase,
    phaseStatus: jsonField(row.phase_status, {}),
    successCriteria: jsonField(row.success_criteria, {}),
    decision: row.decision ?? null,
    decidedAt: stamp(row.decided_at),
    lessonsLearned: row.lessons_learned ?? null,
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toInvestorReport(row: any): import('../../core/types').InvestorReport {
  const scope = jsonField<{ holdingIds?: string[]; podIds?: string[] }>(row.scope, {});
  return {
    id: row.id,
    orgId: row.org_id,
    generatedBy: row.generated_by ?? null,
    dateFrom: toDateString(row.date_from),
    dateTo: toDateString(row.date_to),
    scope: { holdingIds: scope.holdingIds ?? [], podIds: scope.podIds ?? [] },
    metrics: jsonField(row.metrics, {}),
    published: Boolean(row.published),
    publishedAt: stamp(row.published_at),
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toExternalContact(row: any): import('../../core/types').ExternalContact {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    relationshipType: row.relationship_type,
    lastInteractionAt: row.last_interaction_at ? toDateString(row.last_interaction_at) : null,
    notes: row.notes ?? null,
    createdAt: stamp(row.created_at) ?? '',
  };
}

export function toCorrectionRecord(
  row: any,
  proposedByName?: string | null,
  approvedByName?: string | null,
): import('../../core/types').CorrectionRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    originalEntityType: row.original_entity_type,
    originalEntityId: row.original_entity_id,
    fieldCorrected: row.field_corrected,
    originalValue: jsonField(row.original_value, null),
    correctedValue: jsonField(row.corrected_value, null),
    reason: row.reason,
    proposedBy: row.proposed_by,
    proposedByName: proposedByName ?? null,
    approvedBy: row.approved_by ?? null,
    approvedByName: approvedByName ?? null,
    status: row.status,
    decidedAt: stamp(row.decided_at),
    createdAt: stamp(row.created_at) ?? '',
    // Present when the listing resolves the owning pod (see listCorrectionRecords).
    ...(row.pod_id ? { podId: row.pod_id as string, podName: (row.pod_name as string | null) ?? null } : {}),
  };
}
