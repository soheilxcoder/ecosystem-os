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
