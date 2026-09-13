/**
 * Role / permission system — the single most important architectural decision
 * in the product (13-TECHNICAL-ARCHITECTURE.md §4).
 *
 * Rules enforced here:
 *  1. Permission is always derived from *active role assignments*, never from a
 *     static field on the user record. Roles are temporary by construction.
 *  2. A role is active on date D when startDate <= D <= endDate (inclusive) and
 *     it has not been revoked. Open-ended roles have endDate === null.
 *  3. Scope must match: pod roles match a pod, holding roles a holding, etc.
 *  4. Cross-pod visibility is default-on for every member of the org
 *     (00-OVERVIEW.md §5.5) — expressed below as `orgWide: true`.
 *
 * Every row of the matrix has a corresponding test in
 * tests/unit/permissions.test.ts (13-TECHNICAL-ARCHITECTURE.md §9.4).
 */

import type { RoleAssignment, RoleType, ScopeType, UUID } from './types';
import { daysBetween, isISODate, todayISO, type ISODate } from './time';

/** Actions are namespaced `<module>.<verb>`, mirroring the module boundaries. */
export const ACTIONS = [
  // Pods & Teams (03)
  'pod.view',
  'pod.view_members',
  'pod.log_checkin',
  'pod.set_priorities',
  'pod.submit_pitch',
  'pod.edit_pitch',
  'pod.vote_pod_lead',
  'pod.view_history',
  'pod.export_history',
  // CLOU agreements (04)
  'cloud.view',
  'cloud.propose',
  'cloud.respond',
  // Budget market (05)
  'budget.view',
  'budget.view_breakdown',
  'budget.simulate',
  'budget.configure_pool',
  'budget.lock_cycle',
  // Sprint calendar (06)
  'calendar.view',
  'calendar.configure',
  // Coaching (07)
  'coach.view_pods',
  'coach.log_session',
  'coach.view_private_notes',
  'coach.flag_accountability',
  // Peer review & governance (08)
  'review.view_assigned',
  'review.submit_score',
  'case.view',
  'case.log_mediation',
  'case.recommend',
  'governance.view_track',
  'governance.advance_stage',
  'governance.panel_vote',
  'governance.entry_decision',
  // Strategic hub / admin (09)
  'hub.configure_rules',
  'hub.deploy_unit',
  'hub.manage_coaches',
  'hub.publish_investor_update',
  'hub.view_trials',
  'pilot.approve_expansion',
  // Archive & notifications (10, 11)
  'archive.search',
  'notification.read_own',
  // Investor portal
  'investor.view_report',
  'holding.view_comparison',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * The resource an action is attempted against. Callers must resolve the owning
 * `holdingId` for pod-scoped resources (one query in the repository layer) so
 * holding-level roles can be matched.
 */
export interface ResourceRef {
  orgId?: UUID | null;
  holdingId?: UUID | null;
  podId?: UUID | null;
  cycleId?: UUID | null;
  caseId?: UUID | null;
}

export interface PrincipalRef {
  id: UUID;
  orgId: UUID;
}

export type AuthzReason =
  | 'ok'
  | 'unknown_action'
  | 'no_active_role'
  | 'role_not_permitted'
  | 'scope_mismatch'
  | 'org_mismatch';

export interface AuthzResult {
  allowed: boolean;
  action: Action;
  reason: AuthzReason;
  /** Role assignments that satisfied the check (for audit / debugging). */
  matchedRoles: RoleAssignment[];
}

interface PermissionRule {
  /** Roles that grant this action when their scope matches. */
  roles: readonly RoleType[];
  /** Any authenticated member of the org may perform this (transparency default). */
  orgWide?: boolean;
  /**
   * Extra scope types the rule accepts beyond the role's default scope.
   * Used where a role is scoped to a cycle but acts on a pod (peer validator).
   */
  extraScopes?: readonly ScopeType[];
}

/**
 * Which scope types each role uses to satisfy an action.
 * Derived from 01-INFORMATION-ARCHITECTURE.md §3.
 */
export const ROLE_SCOPES: Record<RoleType, readonly ScopeType[]> = {
  pod_member: ['pod'],
  pod_lead: ['pod'],
  peer_validator: ['cycle', 'pod'],
  // A resolver is appointed per case, but the seat itself is granted for the
  // organisation: a case cannot exist before someone opens it, so "may act on
  // this specific case" is enforced by `conflict_case.resolver_user_id` rather
  // than by a case-scoped role row.
  conflict_resolver: ['case', 'org'],
  coach: ['pod'],
  hub_architecture: ['org'],
  hub_deployment: ['org'],
  hub_coaching: ['org'],
  hub_strategic: ['org'],
  investor: ['holding'],
  holding_executive: ['holding'],
};

/**
 * PERMISSION_MATRIX — the machine-readable form of 01-INFORMATION-ARCHITECTURE.md §3.
 * `orgWide: true` encodes that row's "all other pods' public dashboards" clause.
 */
export const PERMISSION_MATRIX: Record<Action, PermissionRule> = {
  // --- Pods & Teams (03) ---
  'pod.view': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'pod.view_members': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'pod.log_checkin': { roles: ['pod_member', 'pod_lead'] },
  'pod.set_priorities': { roles: ['pod_lead'] },
  'pod.submit_pitch': { roles: ['pod_lead'] },
  'pod.edit_pitch': { roles: ['pod_lead'] },
  'pod.vote_pod_lead': { roles: ['pod_member', 'pod_lead'] },
  'pod.view_history': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'pod.export_history': { roles: ['pod_member', 'pod_lead', 'hub_architecture', 'hub_deployment'] },

  // --- CLOU (04) ---
  'cloud.view': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'cloud.propose': { roles: ['pod_lead'] },
  'cloud.respond': { roles: ['pod_lead'] },

  // --- Budget (05) ---
  'budget.view': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'budget.view_breakdown': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'budget.simulate': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'budget.configure_pool': { roles: ['hub_architecture'] },
  'budget.lock_cycle': { roles: ['hub_architecture'] },

  // --- Calendar (06) ---
  'calendar.view': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'calendar.configure': { roles: ['hub_architecture'] },

  // --- Coaching (07) ---
  'coach.view_pods': { roles: ['coach'] },
  'coach.log_session': { roles: ['coach'] },
  'coach.view_private_notes': { roles: ['coach'] },
  'coach.flag_accountability': { roles: ['coach'] },

  // --- Peer review & governance (08) ---
  'review.view_assigned': { roles: ['peer_validator'] },
  'review.submit_score': { roles: ['peer_validator'] },
  'case.view': { roles: ['conflict_resolver'] },
  'case.log_mediation': { roles: ['conflict_resolver'] },
  'case.recommend': { roles: ['conflict_resolver'] },
  // Reading a pod's governance track is org-wide: the dashboards already are,
  // and a pod is entitled to see the clock that decides its own future.
  'governance.view_track': {
    roles: ['pod_member', 'pod_lead', 'coach', 'hub_deployment', 'hub_architecture'],
    orgWide: true,
  },
  'governance.advance_stage': { roles: ['coach', 'hub_deployment'] },
  'governance.panel_vote': { roles: ['pod_member', 'pod_lead'] },
  'governance.entry_decision': { roles: ['hub_deployment', 'pod_lead'] },

  // --- Strategic hub (09) ---
  'hub.configure_rules': { roles: ['hub_architecture'] },
  'hub.deploy_unit': { roles: ['hub_deployment'] },
  'hub.manage_coaches': { roles: ['hub_coaching'] },
  'hub.publish_investor_update': { roles: ['hub_strategic'] },
  'hub.view_trials': { roles: ['hub_deployment', 'hub_architecture'] },
  'pilot.approve_expansion': { roles: ['holding_executive'] },

  // --- Archive & notifications (10, 11) ---
  'archive.search': { roles: ['pod_member', 'pod_lead'], orgWide: true },
  'notification.read_own': { roles: ['pod_member', 'pod_lead'], orgWide: true },

  // --- Investor / holding ---
  'investor.view_report': { roles: ['investor', 'hub_strategic'] },
  'holding.view_comparison': { roles: ['holding_executive'] },
};

export class AuthorizationError extends Error {
  readonly action: Action;
  readonly reason: AuthzReason;

  constructor(action: Action, reason: AuthzReason) {
    super(`Not authorized to perform "${action}" (${reason})`);
    this.name = 'AuthorizationError';
    this.action = action;
    this.reason = reason;
  }
}

/**
 * Is this assignment active on `date`?
 * Inclusive on both ends and not revoked. An open-ended role (endDate === null)
 * stays active forever.
 */
export function isRoleActiveOn(assignment: RoleAssignment, date: ISODate): boolean {
  if (assignment.revokedAt) return false;
  if (!isISODate(assignment.startDate)) return false;
  if (daysBetween(assignment.startDate, date) < 0) return false;
  if (assignment.endDate !== null) {
    if (!isISODate(assignment.endDate)) return false;
    if (daysBetween(date, assignment.endDate) < 0) return false;
  }
  return true;
}

/** All assignments of a user that are active on `date`. */
export function getActiveRoleAssignments(
  assignments: readonly RoleAssignment[],
  date: ISODate,
): RoleAssignment[] {
  return assignments.filter((assignment) => isRoleActiveOn(assignment, date));
}

/**
 * Org-scoped roles carry `scope_id = NULL` (§4), so the organisation they
 * govern is the principal's own — a hub role from one org must never act on
 * another org's resources, even in a single-database deployment.
 */
function orgScopeMatches(principal: PrincipalRef, resource: ResourceRef): boolean {
  return !resource.orgId || resource.orgId === principal.orgId;
}

function scopeMatches(
  role: RoleAssignment,
  resource: ResourceRef,
  extraScopes: readonly ScopeType[],
  principal: PrincipalRef,
): boolean {
  const allowedScopes = new Set<ScopeType>([...(ROLE_SCOPES[role.roleType] ?? []), ...extraScopes]);

  if (role.scopeType === 'org') {
    if (!allowedScopes.has('org')) return false;
    return orgScopeMatches(principal, resource);
  }

  if (!allowedScopes.has(role.scopeType)) return false;

  switch (role.scopeType) {
    case 'pod':
      return Boolean(role.scopeId) && role.scopeId === resource.podId;
    case 'cycle':
      // A cycle-scoped role also governs the pod it reviews in that cycle.
      return Boolean(role.scopeId) && (role.scopeId === resource.cycleId || role.scopeId === resource.podId);
    case 'case':
      return Boolean(role.scopeId) && role.scopeId === resource.caseId;
    case 'holding':
      return Boolean(role.scopeId) && role.scopeId === resource.holdingId;
    default:
      return false;
  }
}

export interface AuthorizeOptions {
  /**
   * The date the decision is made on (default: today, UTC). Expiry is evaluated
   * here rather than by the caller: a role that ended yesterday must never be
   * usable, no matter which code path asks.
   */
  onDate?: ISODate;
}

/**
 * The authorization decision function (13-TECHNICAL-ARCHITECTURE.md §4).
 *
 * Takes the principal's *complete* role history and filters to what is active on
 * `onDate` itself — callers cannot accidentally grant an expired seat by
 * forgetting to filter first. Pure and side-effect free, so it is equally
 * usable from the API middleware, background jobs and tests.
 */
export function authorize(
  principal: PrincipalRef,
  roles: readonly RoleAssignment[],
  action: Action,
  resource: ResourceRef = {},
  options: AuthorizeOptions = {},
): AuthzResult {
  const rule = PERMISSION_MATRIX[action];
  if (!rule) {
    return { allowed: false, action, reason: 'unknown_action', matchedRoles: [] };
  }

  const activeRoles = getActiveRoleAssignments(roles, options.onDate ?? todayISO());
  if (activeRoles.length === 0) {
    return { allowed: false, action, reason: 'no_active_role', matchedRoles: [] };
  }

  // A role assignment only counts if it belongs to this principal.
  const ownRoles = activeRoles.filter((role) => role.userId === principal.id);
  if (ownRoles.length === 0) {
    return { allowed: false, action, reason: 'no_active_role', matchedRoles: [] };
  }

  // Cross-pod transparency: an org-wide row is satisfied simply by being an
  // active member of the org (00-OVERVIEW.md §5.5).
  const orgWideMatch = rule.orgWide
    ? ownRoles.filter((role) =>
        role.scopeType === 'org' ? orgScopeMatches(principal, resource) : true,
      )
    : [];

  if (orgWideMatch.length > 0) {
    return { allowed: true, action, reason: 'ok', matchedRoles: orgWideMatch };
  }

  const permitted = ownRoles.filter((role) => rule.roles.includes(role.roleType));
  if (permitted.length === 0) {
    return { allowed: false, action, reason: 'role_not_permitted', matchedRoles: [] };
  }

  const scoped = permitted.filter((role) =>
    scopeMatches(role, resource, rule.extraScopes ?? [], principal),
  );
  if (scoped.length === 0) {
    const crossedOrgs = permitted.some(
      (role) => role.scopeType === 'org' && !orgScopeMatches(principal, resource),
    );
    return {
      allowed: false,
      action,
      reason: crossedOrgs ? 'org_mismatch' : 'scope_mismatch',
      matchedRoles: [],
    };
  }

  return { allowed: true, action, reason: 'ok', matchedRoles: scoped };
}

/** Throwing variant for route handlers. */
export function assertAuthorized(
  principal: PrincipalRef,
  roles: readonly RoleAssignment[],
  action: Action,
  resource: ResourceRef = {},
  options: AuthorizeOptions = {},
): AuthzResult {
  const result = authorize(principal, roles, action, resource, options);
  if (!result.allowed) {
    throw new AuthorizationError(action, result.reason);
  }
  return result;
}

/** Convenience: which of a user's roles are hub (Company X) roles? */
export function hubRoleTypes(): RoleType[] {
  return ['hub_architecture', 'hub_deployment', 'hub_coaching', 'hub_strategic'];
}

export function hasHubRole(activeRoles: readonly RoleAssignment[]): boolean {
  const hub = new Set<RoleType>(hubRoleTypes());
  return activeRoles.some((role) => hub.has(role.roleType));
}
