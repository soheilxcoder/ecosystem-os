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
