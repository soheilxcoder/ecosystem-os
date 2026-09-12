/**
 * Permission matrix tests — 13-TECHNICAL-ARCHITECTURE.md §9 priority 4:
 * "every permission-matrix row from 01-INFORMATION-ARCHITECTURE.md §3 should
 * have a corresponding automated authorization test."
 *
 * These tests are the thing standing between the product and a silent slide back
 * into hierarchy: a role that outlives its end date, or a pod lead who can act
 * on a different pod, is exactly the failure mode the whole model is designed
 * to prevent.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACTIONS,
  AuthorizationError,
  PERMISSION_MATRIX,
  ROLE_SCOPES,
  assertAuthorized,
  authorize,
  getActiveRoleAssignments,
  isRoleActiveOn,
  type Action,
} from '../../core/permissions';
import { ROLE_TYPES, type RoleAssignment, type RoleType } from '../../core/types';
import { daysBetween } from '../../core/time';
import { IDS, role } from '../helpers/factories';

const principal = { id: IDS.user, orgId: IDS.org };
const TODAY = '2026-06-15';

function can(
  roles: RoleAssignment[],
  action: Action,
  resource: Parameters<typeof authorize>[3] = {},
) {
  // Every decision is pinned to a fixed date so tests never depend on the
  // wall clock, and expired seats are evaluated realistically.
  return authorize(principal, roles, action, resource, { onDate: TODAY });
}

describe('permission matrix integrity', () => {
  it('covers every declared action', () => {
    for (const action of ACTIONS) {
      expect(PERMISSION_MATRIX[action], `missing matrix row for ${action}`).toBeDefined();
    }
  });

  it('only references real role types and provides at least one grant path', () => {
    for (const action of ACTIONS) {
      const rule = PERMISSION_MATRIX[action];
      for (const roleType of rule.roles) {
        expect(ROLE_TYPES, `unknown role ${roleType} in ${action}`).toContain(roleType);
      }
      expect(
        rule.roles.length > 0 || rule.orgWide === true,
        `${action} grants nothing to anyone`,
      ).toBe(true);
    }
  });

  it('gives every role a scope definition', () => {
    for (const roleType of ROLE_TYPES) {
      expect(ROLE_SCOPES[roleType], `missing scopes for ${roleType}`).toBeDefined();
      expect(ROLE_SCOPES[roleType].length).toBeGreaterThan(0);
    }
  });

  it('enumerates the eleven roles from 01-INFORMATION-ARCHITECTURE.md §3', () => {
    expect([...ROLE_TYPES].sort()).toEqual(
      [
        'coach',
        'conflict_resolver',
        'holding_executive',
        'hub_architecture',
        'hub_coaching',
        'hub_deployment',
        'hub_strategic',
        'investor',
        'peer_validator',
        'pod_lead',
        'pod_member',
      ].sort(),
    );
  });
});

describe('role activation window', () => {
  it('is inactive the day before start_date', () => {
    const r = role({ roleType: 'pod_member', startDate: '2026-06-16' });
    expect(isRoleActiveOn(r, TODAY)).toBe(false);
  });

  it('is active on start_date and on end_date (inclusive both ends)', () => {
    const started = role({ roleType: 'pod_member', startDate: TODAY });
    const ending = role({ roleType: 'pod_lead', startDate: '2026-01-01', endDate: TODAY });
    expect(isRoleActiveOn(started, TODAY)).toBe(true);
    expect(isRoleActiveOn(ending, TODAY)).toBe(true);
  });

  it('expires the day after end_date', () => {
    const r = role({ roleType: 'pod_lead', startDate: '2026-01-01', endDate: '2026-06-14' });
    expect(isRoleActiveOn(r, TODAY)).toBe(false);
  });

  it('stays active forever when end_date is null (open-ended)', () => {
    const r = role({ roleType: 'pod_member', startDate: '2020-01-01', endDate: null });
    expect(isRoleActiveOn(r, '2099-12-31')).toBe(true);
  });

  it('is inactive once revoked, regardless of dates', () => {
    const r = role({
      roleType: 'pod_lead',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      revokedAt: '2026-02-01T00:00:00Z',
    });
    expect(isRoleActiveOn(r, TODAY)).toBe(false);
  });

  it('filters lists to active assignments only', () => {
    const roles = [
      role({ roleType: 'pod_member', startDate: '2026-01-01', endDate: null }),
      role({ roleType: 'pod_lead', startDate: '2026-01-01', endDate: '2026-03-31' }), // expired
      role({ roleType: 'coach', startDate: '2026-07-01' }), // not started
    ];
    const active = getActiveRoleAssignments(roles, TODAY);
    expect(active.map((r) => r.roleType)).toEqual(['pod_member']);
  });

  it('activation agrees with the inclusive day range for any random window', () => {
    fc.assert(
      fc.property(
        fc
          .integer({
            min: Date.UTC(2020, 0, 1),
            max: Date.UTC(2029, 11, 31),
          })
          .map((ms) => new Date(ms)),
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        (baseDate, startOffset, length) => {
          const start = new Date(baseDate);
          start.setUTCDate(start.getUTCDate() + startOffset);
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + length);
          const iso = (d: Date) => d.toISOString().slice(0, 10);

          const r = role({ roleType: 'pod_lead', startDate: iso(start), endDate: iso(end) });
          const inWindow =
            daysBetween(iso(start), TODAY) >= 0 && daysBetween(TODAY, iso(end)) >= 0;
          expect(isRoleActiveOn(r, TODAY)).toBe(inWindow);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('authorization decisions', () => {
  it('denies every action to a user with no active roles', () => {
    for (const action of ACTIONS) {
      expect(can([], action).allowed, `${action} allowed with no roles`).toBe(false);
      expect(can([], action).reason).toBe('no_active_role');
    }
  });

  it('ignores role assignments belonging to a different user', () => {
    const someoneElsesLead = role({
      userId: IDS.otherUser,
      roleType: 'pod_lead',
      scopeType: 'pod',
      scopeId: IDS.pod,
    });
    const result = can([someoneElsesLead], 'pod.submit_pitch', { podId: IDS.pod, orgId: IDS.org });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_active_role');
  });

  it('reports unknown_action for an action outside the matrix', () => {
    const result = can([role({ roleType: 'pod_member' })], 'pod.destroy_org' as Action);
    expect(result).toMatchObject({ allowed: false, reason: 'unknown_action' });
  });

  it('lets the pod lead submit the pitch for their own pod', () => {
    const result = can(
      [role({ roleType: 'pod_lead', scopeType: 'pod', scopeId: IDS.pod })],
      'pod.submit_pitch',
      { orgId: IDS.org, holdingId: IDS.holding, podId: IDS.pod },
    );
    expect(result.allowed).toBe(true);
    expect(result.matchedRoles[0]?.roleType).toBe('pod_lead');
  });

  it('refuses a pod lead acting on a different pod (scope mismatch)', () => {
    const result = can([role({ roleType: 'pod_lead', scopeType: 'pod', scopeId: IDS.pod })], 'pod.submit_pitch', {
      orgId: IDS.org,
      podId: IDS.otherPod,
    });
    expect(result).toMatchObject({ allowed: false, reason: 'scope_mismatch' });
  });

  it('refuses a plain pod member submitting the pitch (role not permitted)', () => {
    const result = can([role({ roleType: 'pod_member', scopeType: 'pod', scopeId: IDS.pod })], 'pod.submit_pitch', {
      podId: IDS.pod,
    });
    expect(result).toMatchObject({ allowed: false, reason: 'role_not_permitted' });
  });

  it('refuses an expired pod lead — rotation is enforced, not decorative', () => {
    const expiredLead = role({
      roleType: 'pod_lead',
      scopeType: 'pod',
      scopeId: IDS.pod,
      startDate: '2026-01-01',
      endDate: '2026-06-14',
    });
    const active = getActiveRoleAssignments([expiredLead], TODAY);
    expect(active.length).toBe(0);
    expect(can([expiredLead], 'pod.submit_pitch', { podId: IDS.pod }).allowed).toBe(false);
  });

  it('lets a pod member log a check-in for their pod', () => {
    const result = can([role({ roleType: 'pod_member', scopeType: 'pod', scopeId: IDS.pod })], 'pod.log_checkin', {
      podId: IDS.pod,
    });
    expect(result.allowed).toBe(true);
  });

  it('keeps cross-pod visibility on by default (transparency principle)', () => {
    const memberOfPodA = role({ roleType: 'pod_member', scopeType: 'pod', scopeId: IDS.pod });
    const result = can([memberOfPodA], 'pod.view', { orgId: IDS.org, podId: IDS.otherPod });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('restricts private coach notes to the assigned coach', () => {
    const coach = role({ roleType: 'coach', scopeType: 'pod', scopeId: IDS.pod });
    expect(can([coach], 'coach.view_private_notes', { podId: IDS.pod }).allowed).toBe(true);
    expect(can([coach], 'coach.view_private_notes', { podId: IDS.otherPod }).allowed).toBe(false);
  });

  it('lets a peer validator score only the pod they are assigned to', () => {
    const validator = role({
      roleType: 'peer_validator',
      scopeType: 'cycle',
      scopeId: IDS.cycle,
    });
    expect(can([validator], 'review.submit_score', { cycleId: IDS.cycle }).allowed).toBe(true);
    expect(
      can([validator], 'review.submit_score', { cycleId: 'cycle-other' }).allowed,
    ).toBe(false);
    // A cycle-scoped validator also acts on the pod under review.
    expect(can([validator], 'review.view_assigned', { podId: IDS.cycle }).allowed).toBe(true);
  });

  it('lets a conflict resolver work only their own case', () => {
    const resolver = role({ roleType: 'conflict_resolver', scopeType: 'case', scopeId: IDS.case });
    expect(can([resolver], 'case.log_mediation', { caseId: IDS.case }).allowed).toBe(true);
    expect(can([resolver], 'case.log_mediation', { caseId: 'case-other' }).allowed).toBe(false);
  });

  it('grants Company X hub roles org-wide powers but no pod-level powers', () => {
    const architect = role({ roleType: 'hub_architecture', scopeType: 'org', scopeId: null });
    expect(can([architect], 'hub.configure_rules', { orgId: IDS.org }).allowed).toBe(true);
    expect(can([architect], 'calendar.configure', { orgId: IDS.org }).allowed).toBe(true);
    expect(
      can([architect], 'pod.submit_pitch', { orgId: IDS.org, podId: IDS.pod }).allowed,
    ).toBe(false);
  });

  it('refuses a hub role acting outside its own org', () => {
    const architect = role({ roleType: 'hub_architecture', scopeType: 'org', scopeId: null });
    const result = can([architect], 'hub.configure_rules', { orgId: IDS.otherOrg });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('org_mismatch');
  });

  it('keeps investors inside their assigned holding', () => {
    const investor = role({
      roleType: 'investor',
      scopeType: 'holding',
      scopeId: IDS.holding,
    });
    expect(can([investor], 'investor.view_report', { holdingId: IDS.holding }).allowed).toBe(true);
    expect(can([investor], 'investor.view_report', { holdingId: IDS.otherHolding }).allowed).toBe(
      false,
    );
  });

  it('lets a holding executive compare units within their holding only', () => {
    const exec = role({
      roleType: 'holding_executive',
      scopeType: 'holding',
      scopeId: IDS.holding,
    });
    expect(can([exec], 'holding.view_comparison', { holdingId: IDS.holding }).allowed).toBe(true);
    expect(can([exec], 'pilot.approve_expansion', { holdingId: IDS.otherHolding }).allowed).toBe(
      false,
    );
  });

  it('supports one person holding several roles at once, each in its own scope', () => {
    // 01-INFORMATION-ARCHITECTURE.md §3 design rule: Pod Member of A +
    // Peer Validator of B + Coach of C/D/E must all coexist.
    const roles = [
      role({ roleType: 'pod_member', scopeType: 'pod', scopeId: IDS.pod }),
      role({ roleType: 'peer_validator', scopeType: 'cycle', scopeId: IDS.cycle }),
      role({ roleType: 'coach', scopeType: 'pod', scopeId: IDS.otherPod }),
    ];
    expect(can(roles, 'pod.log_checkin', { podId: IDS.pod }).allowed).toBe(true);
    expect(can(roles, 'review.submit_score', { cycleId: IDS.cycle }).allowed).toBe(true);
    expect(can(roles, 'coach.log_session', { podId: IDS.otherPod }).allowed).toBe(true);
    // ...and it does not leak into an unrelated pod.
    expect(can(roles, 'coach.log_session', { podId: 'pod-Z' }).allowed).toBe(false);
  });

  it('throws an AuthorizationError carrying the reason when asserted', () => {
    expect(() =>
      assertAuthorized(principal, [role({ roleType: 'pod_member', scopeId: IDS.pod })], 'pod.submit_pitch', {
        podId: IDS.pod,
      }),
    ).toThrow(AuthorizationError);
    try {
      assertAuthorized(principal, [role({ roleType: 'pod_member', scopeId: IDS.pod })], 'pod.submit_pitch', {
        podId: IDS.pod,
      });
    } catch (error) {
      expect((error as AuthorizationError).reason).toBe('role_not_permitted');
      expect((error as AuthorizationError).action).toBe('pod.submit_pitch');
    }
  });

  it('never grants an action when the only role is inactive, for any matrix row', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACTIONS),
        fc.constantFrom(...ROLE_TYPES),
        (action, roleType) => {
          const expired = role({
            roleType,
            startDate: '2020-01-01',
            endDate: '2020-01-02',
          });
          const result = authorize(principal, getActiveRoleAssignments([expired], TODAY), action, {
            orgId: IDS.org,
            holdingId: IDS.holding,
            podId: IDS.pod,
            cycleId: IDS.cycle,
            caseId: IDS.case,
          });
          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('no_active_role');
        },
      ),
      { numRuns: 200 },
    );
  });
});
