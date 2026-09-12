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
