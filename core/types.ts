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
