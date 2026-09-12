/**
 * Pods & Teams service (Module 03).
 *
 * Every time-boxed rule in this module is enforced **here**, on the server, not
 * by a disabled button in the browser:
 *   - check-ins are accepted on Days 4–80 only
 *   - the pitch can be edited and submitted on Days 81–85 only
 *   - Pod Lead votes are accepted on Days 1–3 only
 *   - cycle priorities are editable by the Pod Lead on Days 1–3 only
 *
 * A client-side disabled button is a usability affordance; it is not a control.
 */

import type { Database } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { UUID } from '../../core/types';
import type { ISODate } from '../../core/time';
import {
  isCheckinWindow,
  isPitchWindow,
  isPodLeadRotationWindow,
} from '../../core/calendar';
import type { PhaseSnapshot } from './calendar';
import { getCurrentPhaseForScope } from './calendar';
import { badRequest, forbidden } from '../errors';
import {
  castPodLeadVote,
  createCheckin,
  createPodLeadTerm,
  getPitch,
  listCheckins,
  listPodLeadTerms,
  listPodLeadVotes,
  listPitches,
  submitPitch,
  upsertCyclePlan,
  upsertPitchDraft,
  type CheckinRow,
  type PitchRow,
  type PodLeadTermRow,
} from '../../db/repositories/pods';
import { listPodMembers } from '../../db/repositories/pods';
import { getGovernanceConfig } from '../../db/repositories/calendar';
import { recordAudit } from '../../db/repositories/audit';

export interface PodServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

/** Thrown when an action is attempted outside its calendar window. */
export class WindowClosedError extends Error {
  constructor(
    readonly action: string,
    readonly day: number,
    readonly allowedDays: [number, number],
  ) {
    super(
      `${action} is only allowed on days ${allowedDays[0]}–${allowedDays[1]} of the cycle (today is day ${day})`,
    );
    this.name = 'WindowClosedError';
  }
}

async function requirePhase(
  context: PodServiceContext,
  podId: UUID,
  orgId: UUID,
): Promise<PhaseSnapshot> {
  const phase = await getCurrentPhaseForScope(context.db, { orgId, podId }, context.today());
  if (!phase) {
    throw badRequest(`No active sprint cycle for this pod — the calendar has not been started`);
  }
  return phase;
}

/** Which cycle week a cycle day belongs to (week 1 starts on the first execution day). */
export function weekNumberForDay(day: number, firstExecutionDay: number): number {
  return Math.floor(Math.max(0, day - firstExecutionDay) / 7) + 1;
}

// ---------------------------------------------------------------------------
// Weekly check-ins (Days 4–80)
// ---------------------------------------------------------------------------

export interface LogCheckinInput {
  podId: UUID;
  orgId: UUID;
  authorUserId: UUID;
  body: string;
  atRiskFlag?: boolean;
}

export async function logCheckin(
  context: PodServiceContext,
  input: LogCheckinInput,
): Promise<CheckinRow> {
  const trimmed = input.body.trim();
  if (!trimmed) throw badRequest('A check-in needs a short note');
  if (trimmed.length > 500) throw badRequest('Check-ins are limited to 500 characters');

  const phase = await requirePhase(context, input.podId, input.orgId);
  const boundaries = phase.phaseBoundaries;
  if (!isCheckinWindow(phase.day, boundaries)) {
    throw new WindowClosedError('Logging a weekly check-in', phase.day, [
      boundaries.p1_end + 1,
      boundaries.p2_end,
    ]);
  }

  const weekNumber = weekNumberForDay(phase.day, boundaries.p1_end + 1);
  const checkin = await createCheckin(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    authorUserId: input.authorUserId,
    weekNumber,
    body: trimmed,
    atRiskFlag: input.atRiskFlag ?? false,
  });

  await recordAudit(context.db, {
    actorUserId: input.authorUserId,
    action: 'pod.checkin_logged',
    entityType: 'pod',
    entityId: input.podId,
    metadata: { weekNumber, atRisk: checkin.atRiskFlag, cycleDay: phase.day },
  });

  await context.bus.publish({
    type: 'pod.checkin_logged',
    aggregateType: 'pod',
    aggregateId: input.podId,
    orgId: input.orgId,
    actorUserId: input.authorUserId,
    payload: { weekNumber, atRisk: checkin.atRiskFlag, cycleDay: phase.day },
  });

  return checkin;
}

export async function getCheckins(
  context: PodServiceContext,
  podId: UUID,
  orgId: UUID,
): Promise<{ cycleId: UUID; checkins: CheckinRow[] } | null> {
  const phase = await getCurrentPhaseForScope(context.db, { orgId, podId }, context.today());
  if (!phase) return null;
  return {
    cycleId: phase.cycleId,
    checkins: await listCheckins(context.db, podId, phase.cycleId),
  };
}

// ---------------------------------------------------------------------------
// Cycle priorities (Days 1–3, Pod Lead only)
// ---------------------------------------------------------------------------

export async function setCyclePriorities(
  context: PodServiceContext,
  input: { podId: UUID; orgId: UUID; actorUserId: UUID; priorities: string[] },
): Promise<string[]> {
  const phase = await requirePhase(context, input.podId, input.orgId);
  if (!isPodLeadRotationWindow(phase.day, phase.phaseBoundaries)) {
    throw new WindowClosedError('Setting cycle priorities', phase.day, [1, phase.phaseBoundaries.p1_end]);
  }
  const cleaned = input.priorities.map((item) => item.trim()).filter(Boolean).slice(0, 5);
  if (cleaned.length === 0) throw badRequest('Add at least one priority for this cycle');

  const priorities = await upsertCyclePlan(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    priorities: cleaned,
    updatedBy: input.actorUserId,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'pod.priorities_set',
    entityType: 'pod',
    entityId: input.podId,
    metadata: { priorities: cleaned },
  });

  return priorities;
}

// ---------------------------------------------------------------------------
// Pitch (Days 81–85)
// ---------------------------------------------------------------------------

export interface SavePitchInput {
  podId: UUID;
  orgId: UUID;
  actorUserId: UUID;
  previousSummary?: string | null;
  keyResults?: unknown[];
  nextPlan?: string | null;
  budgetContext?: string | null;
  attachments?: unknown[];
}

export async function savePitch(
  context: PodServiceContext,
  input: SavePitchInput,
): Promise<PitchRow> {
  const phase = await requirePhase(context, input.podId, input.orgId);
  if (!isPitchWindow(phase.day, phase.phaseBoundaries)) {
    throw new WindowClosedError('Editing the pitch', phase.day, [
      phase.phaseBoundaries.p2_end + 1,
      phase.phaseBoundaries.p3_end,
    ]);
  }
  return upsertPitchDraft(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    previousSummary: input.previousSummary,
    keyResults: input.keyResults,
    nextPlan: input.nextPlan,
    budgetContext: input.budgetContext,
    attachments: input.attachments,
  });
}

export async function finalizePitch(
  context: PodServiceContext,
  input: { podId: UUID; orgId: UUID; actorUserId: UUID },
): Promise<PitchRow> {
  const phase = await requirePhase(context, input.podId, input.orgId);
  if (!isPitchWindow(phase.day, phase.phaseBoundaries)) {
    // The roadmap requires this to be tested explicitly: a submission attempt
    // outside Days 81–85 must be rejected by the server.
    throw new WindowClosedError('Submitting the pitch', phase.day, [
      phase.phaseBoundaries.p2_end + 1,
      phase.phaseBoundaries.p3_end,
    ]);
  }

  const existing = await getPitch(context.db, input.podId, phase.cycleId);
  if (!existing) {
    throw badRequest('There is no draft pitch to submit');
  }
  if (existing.status !== 'draft') {
    return existing; // already submitted — idempotent
  }

  const pitch = await submitPitch(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    submittedBy: input.actorUserId,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'pod.pitch_submitted',
    entityType: 'pitch',
    entityId: pitch!.id,
    metadata: { cycleDay: phase.day, cycleNumber: phase.cycleNumber, auto: false },
  });

  await context.bus.publish({
    type: 'pod.pitch_submitted',
    aggregateType: 'pitch',
    aggregateId: pitch!.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { podId: input.podId, cycleId: phase.cycleId, auto: false },
  });

  return pitch!;
}

/**
 * Auto-submit any draft whose Day-85 deadline has passed.
 *
 * Runs from the scheduler and lazily on read, because a pod that never clicks
 * Submit still has to be reviewed (03-MODULE-PODS-TEAMS.md).
 */
export async function autoSubmitExpiredPitches(
  context: PodServiceContext,
  orgIds: UUID[],
): Promise<number> {
  let submitted = 0;
  for (const orgId of orgIds) {
    const phase = await getCurrentPhaseForScope(context.db, { orgId }, context.today());
    if (!phase) continue;
    if (phase.day <= phase.phaseBoundaries.p3_end) continue;

    const { rows } = await context.db.query<{ id: string; pod_id: string }>(
      `SELECT id, pod_id FROM pitch
        WHERE cycle_id = $1 AND status = 'draft'`,
      [phase.cycleId],
    );

    for (const row of rows) {
      const pitch = await submitPitch(context.db, {
        podId: row.pod_id,
        cycleId: phase.cycleId,
        submittedBy: null,
        autoSubmitted: true,
      });
      if (!pitch) continue;
      submitted += 1;
      await context.bus.publish({
        type: 'pod.pitch_auto_submitted',
        aggregateType: 'pitch',
        aggregateId: pitch.id,
        orgId,
        actorUserId: null,
        payload: { podId: row.pod_id, cycleId: phase.cycleId, auto: true },
      });
    }
  }
  return submitted;
}

// ---------------------------------------------------------------------------
// Pod Lead election (Days 1–3)
// ---------------------------------------------------------------------------

export interface ElectionView {
  cycleId: UUID;
  candidates: Array<{ userId: UUID; fullName: string; joinedAt: ISODate; isOutgoingLead: boolean }>;
  votes: Array<{ voterUserId: UUID; candidateUserId: UUID }>;
  tieBreakRule: string;
  allowLeadReElection: boolean;
  winnerUserId: UUID | null;
  tally: Record<string, number>;
}

export async function getElection(
  context: PodServiceContext,
  input: { podId: UUID; orgId: UUID },
): Promise<ElectionView | null> {
  const phase = await getCurrentPhaseForScope(context.db, { orgId: input.orgId, podId: input.podId }, context.today());
  if (!phase) return null;

  const [members, votes, governance, terms] = await Promise.all([
    listPodMembers(context.db, input.podId),
    listPodLeadVotes(context.db, input.podId, phase.cycleId),
    getGovernanceConfig(context.db, input.orgId),
    listPodLeadTerms(context.db, input.podId),
  ]);

  const outgoingLead = terms.find((term) => term.cycleId === phase.cycleId)?.userId ?? null;

  const candidates = members
    .filter((member) => governance.allowLeadReElection || member.id !== outgoingLead)
    .map((member) => ({
      userId: member.id,
      fullName: member.fullName,
      joinedAt: member.joinedAt,
      isOutgoingLead: member.id === outgoingLead,
    }));

  const tally: Record<string, number> = {};
  for (const vote of votes) {
    tally[vote.candidateUserId] = (tally[vote.candidateUserId] ?? 0) + 1;
  }

  return {
    cycleId: phase.cycleId,
    candidates,
    votes: votes.map((vote) => ({
      voterUserId: vote.voterUserId,
      candidateUserId: vote.candidateUserId,
    })),
    tieBreakRule: governance.tieBreakRule,
    allowLeadReElection: governance.allowLeadReElection,
    winnerUserId: resolveWinner(tally, candidates, governance.tieBreakRule, outgoingLead),
    tally,
  };
}

export async function castVote(
  context: PodServiceContext,
  input: { podId: UUID; orgId: UUID; voterUserId: UUID; candidateUserId: UUID },
): Promise<{ cycleId: UUID; tally: Record<string, number>; complete: boolean }> {
  const phase = await requirePhase(context, input.podId, input.orgId);
  if (!isPodLeadRotationWindow(phase.day, phase.phaseBoundaries)) {
    throw new WindowClosedError('Voting for the next Pod Lead', phase.day, [1, phase.phaseBoundaries.p1_end]);
  }

  const members = await listPodMembers(context.db, input.podId);
  if (!members.some((member) => member.id === input.voterUserId)) {
    throw forbidden('Only members of this pod can vote for its Pod Lead', 'not_a_member');
  }
  if (!members.some((member) => member.id === input.candidateUserId)) {
    throw badRequest('That candidate is not a member of this pod');
  }

  await castPodLeadVote(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    voterUserId: input.voterUserId,
    candidateUserId: input.candidateUserId,
  });

  const votes = await listPodLeadVotes(context.db, input.podId, phase.cycleId);
  const tally: Record<string, number> = {};
  for (const vote of votes) tally[vote.candidateUserId] = (tally[vote.candidateUserId] ?? 0) + 1;

  await recordAudit(context.db, {
    actorUserId: input.voterUserId,
    action: 'pod.lead_vote_cast',
    entityType: 'pod',
    entityId: input.podId,
    metadata: { candidateUserId: input.candidateUserId, cycleDay: phase.day },
  });

  return { cycleId: phase.cycleId, tally, complete: votes.length >= members.length };
}

/**
 * Seat the winning candidate: writes the Pod Lead term record and the matching
 * time-boxed `pod_lead` role assignment, so the role expires automatically at
 * the end of the cycle rather than being a permanent title.
 */
export async function finalizeElection(
  context: PodServiceContext,
  input: { podId: UUID; orgId: UUID; actorUserId: UUID },
): Promise<{ term: PodLeadTermRow; winnerUserId: UUID; tally: Record<string, number> }> {
  const election = await getElection(context, input);
  if (!election) throw badRequest('No active cycle for this pod');
  if (!election.winnerUserId) throw badRequest('No votes have been cast yet');

  const phase = await requirePhase(context, input.podId, input.orgId);
  const termEnd = phase.cycleEndDate;

  const term = await createPodLeadTerm(context.db, {
    podId: input.podId,
    cycleId: phase.cycleId,
    userId: election.winnerUserId,
    startDate: phase.cycleStartDate,
    endDate: termEnd,
    voteTally: election.tally,
  });

  const { assignRole, listRolesByScope, revokeRole } = await import('../../db/repositories/roles');
  // Close the outgoing seat first: a pod must never hold two live Pod Leads,
  // and history is preserved because revocation stamps revoked_at.
  const podRoles = await listRolesByScope(context.db, 'pod', input.podId);
  for (const role of podRoles) {
    if (role.roleType === 'pod_lead' && !role.revokedAt) {
      await revokeRole(context.db, role.id, input.actorUserId);
    }
  }

  await assignRole(context.db, {
    userId: election.winnerUserId,
    roleType: 'pod_lead',
    scopeType: 'pod',
    scopeId: input.podId,
    startDate: phase.cycleStartDate,
    endDate: termEnd,
    createdBy: input.actorUserId,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'pod.lead_elected',
    entityType: 'pod',
    entityId: input.podId,
    metadata: { winnerUserId: election.winnerUserId, tally: election.tally },
  });

  await context.bus.publish({
    type: 'pod.lead_elected',
    aggregateType: 'pod',
    aggregateId: input.podId,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: {
      winnerUserId: election.winnerUserId,
      tally: election.tally,
      tieBreakRule: election.tieBreakRule,
    },
  });

  return { term, winnerUserId: election.winnerUserId, tally: election.tally };
}

/** Resolve the winner, applying the configured tie-break rule. */
export function resolveWinner(
  tally: Record<string, number>,
  candidates: Array<{ userId: UUID; joinedAt: ISODate; isOutgoingLead: boolean }>,
  rule: string,
  outgoingLeadId: UUID | null,
): UUID | null {
  const entries = Object.entries(tally);
  if (entries.length === 0) return null;

  const max = Math.max(...entries.map(([, count]) => count));
  const leaders = entries.filter(([, count]) => count === max).map(([userId]) => userId);
  if (leaders.length === 1) return leaders[0]!;

  switch (rule) {
    case 'lead_tiebreak': {
      if (outgoingLeadId && candidates.some((c) => c.userId === outgoingLeadId)) {
        return outgoingLeadId;
      }
      return leaders[0]!;
    }
    case 'random': {
      // Deterministic for a given tie: seeding from the candidate ids keeps the
      // outcome reproducible and testable instead of flaky.
      const sorted = [...leaders].sort();
      const seed = sorted.join('|');
      let hash = 0;
      for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
      return sorted[hash % sorted.length]!;
    }
    case 'longest_tenure':
    default: {
      const byTenure = [...leaders].sort((a, b) => {
        const aJoined = candidates.find((c) => c.userId === a)?.joinedAt ?? '';
        const bJoined = candidates.find((c) => c.userId === b)?.joinedAt ?? '';
        return aJoined < bJoined ? -1 : aJoined > bJoined ? 1 : a < b ? -1 : 1;
      });
      return byTenure[0]!;
    }
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function getPodHistory(context: PodServiceContext, podId: UUID): Promise<PitchRow[]> {
  return listPitches(context.db, podId);
}
