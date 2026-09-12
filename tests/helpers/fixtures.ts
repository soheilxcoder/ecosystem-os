/** Reusable data fixtures for integration tests. */

import type { Database } from '../../db/client';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import type { PodStatus, RoleType, ScopeType } from '../../core/types';
import type { ISODate } from '../../core/time';

export interface FixtureWorld {
  orgId: string;
  holdingId: string;
  otherHoldingId: string;
  podAId: string;
  podBId: string;
  users: Record<string, string>;
}

/**
 * A small but realistic organisation:
 *   - one org, two holdings
 *   - two pods in holding 1, one in holding 2
 *   - one user per interesting role
 */
export async function seedFixtureWorld(db: Database): Promise<FixtureWorld> {
  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  const holding = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });
  const otherHolding = await createHolding(db, { orgId: org.id, name: 'Holding Dena', code: 'DENA' });

  const podA = await createPod(db, { holdingId: holding.id, name: 'Pod Atlas', categoryTag: 'Sales', status: 'active' });
  const podB = await createPod(db, { holdingId: holding.id, name: 'Pod Basalt', categoryTag: 'Production', status: 'active' });
  await createPod(db, { holdingId: otherHolding.id, name: 'Pod Cinder', categoryTag: 'R&D', status: 'trial' });

  // Returns the user id, ready to use as a foreign key.
  const makeUser = async (name: string, email: string): Promise<string> =>
    (await createUser(db, { orgId: org.id, email, fullName: name })).id;

  const lead = await makeUser('Lena Lead', 'lena@example.org');
  const member = await makeUser('Mo Member', 'mo@example.org');
  const coach = await makeUser('Cora Coach', 'cora@example.org');
  const architect = await makeUser('Ari Architect', 'ari@example.org');
  const outsider = await makeUser('No Role Yet', 'noroles@example.org');

  await addPodMember(db, { podId: podA.id, userId: lead, joinedAt: '2026-01-01' });
  await addPodMember(db, { podId: podA.id, userId: member, joinedAt: '2026-01-01' });

  const role = (
    userId: string,
    roleType: RoleType,
    scopeType: ScopeType,
    scopeId: string | null,
    startDate: ISODate = '2026-01-01',
    endDate: ISODate | null = null,
  ) => assignRole(db, { userId, roleType, scopeType, scopeId, startDate, endDate });

  await role(lead, 'pod_member', 'pod', podA.id);
  await role(lead, 'pod_lead', 'pod', podA.id, '2026-01-01', '2026-12-31');
  await role(member, 'pod_member', 'pod', podA.id);
  await role(coach, 'coach', 'pod', podA.id, '2026-01-01', '2026-06-30');
  await role(coach, 'coach', 'pod', podB.id, '2026-01-01', '2026-06-30');
  await role(architect, 'hub_architecture', 'org', null);

  return {
    orgId: org.id,
    holdingId: holding.id,
    otherHoldingId: otherHolding.id,
    podAId: podA.id,
    podBId: podB.id,
    users: { lead, member, coach, architect, outsider },
  };
}

export async function seedPod(
  db: Database,
  input: { holdingId: string; name: string; status?: PodStatus },
): Promise<string> {
  const pod = await createPod(db, {
    holdingId: input.holdingId,
    name: input.name,
    status: input.status ?? 'active',
  });
  return pod.id;
}
