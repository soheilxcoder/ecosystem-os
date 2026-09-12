/** Fixture builders for domain objects used across unit tests. */

import type { RoleAssignment, RoleType, ScopeType, UUID } from '../../core/types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(6, '0')}`;
}

export function resetFactoryIds(): void {
  counter = 0;
}

export interface RoleFixture {
  userId?: UUID;
  roleType: RoleType;
  scopeType?: ScopeType;
  scopeId?: UUID | null;
  startDate?: string;
  endDate?: string | null;
  revokedAt?: string | null;
}

export function role(fixture: RoleFixture): RoleAssignment {
  const scopeType = fixture.scopeType ?? defaultScopeFor(fixture.roleType);
  return {
    id: nextId('role'),
    userId: fixture.userId ?? 'user-1',
    roleType: fixture.roleType,
    scopeType,
    scopeId:
      fixture.scopeId === undefined
        ? scopeType === 'org'
          ? null
          : `scope-${scopeType}`
        : fixture.scopeId,
    startDate: fixture.startDate ?? '2026-01-01',
    endDate: fixture.endDate ?? null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    revokedAt: fixture.revokedAt ?? null,
  };
}

function defaultScopeFor(roleType: RoleType): ScopeType {
  switch (roleType) {
    case 'hub_architecture':
    case 'hub_deployment':
    case 'hub_coaching':
    case 'hub_strategic':
      return 'org';
    case 'investor':
    case 'holding_executive':
      return 'holding';
    case 'peer_validator':
      return 'cycle';
    case 'conflict_resolver':
      return 'case';
    default:
      return 'pod';
  }
}

export const IDS = {
  user: 'user-1',
  otherUser: 'user-2',
  org: 'org-1',
  otherOrg: 'org-2',
  holding: 'holding-1',
  otherHolding: 'holding-2',
  pod: 'pod-1',
  otherPod: 'pod-2',
  cycle: 'cycle-1',
  case: 'case-1',
} as const;
