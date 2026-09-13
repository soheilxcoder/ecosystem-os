/**
 * Governance service (Module 08, workflow 3): the two tracks.
 *
 * The spec's most emphatic requirement for this module is that the 90-Day Entry
 * Rule and the Accountability & Dissolution Path "must never share a state
 * machine or UI component". They therefore share no code path below the level of
 * `whichTrack()`, which exists only to keep a pod off both at once:
 *
 *  - Track 1 (entry trial) is linear Day 0 → Day 90 with **no intermediate
 *    correction stages**, and ends in a bilateral decision.
 *  - Track 2 (accountability) has four sequential stages and ends in a **panel
 *    vote** — never a single decision-maker.
 *
 * Both final results are immutable once set: the database triggers refuse an
 * edit, and a correction has to be a new record (Phase 8).
 */

import type { Database } from '../../db/client';
import { queryMany } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type {
  AccountabilityResult,
  AccountabilityStageValue,
  EntryRecommendation,
  EntryTrial,
  PanelVoteValue,
  Pod,
  RuleChange,
  TrialCriterionRow,
  UUID,
} from '../../core/types';
import {
  ENTRY_TRIAL_DAYS,
  RECOMMENDATION_LABELS,
  combineEntryDecision,
  criteriaProgress,
  daysUntilEntryDecision,
  entryDecisionDueDate,
  isEntryDecisionUnlocked,
  trialDayOf,
} from '../../core/entry-trial';
import {
  ACCOUNTABILITY_STAGES,
  CORRECTION_PERIOD_DAYS,
  STAGE_LABELS,
  STAGE_SUMMARIES,
  correctionEndDate,
  isCorrectionPeriodOver,
  isStage2Triggered,
  minPanelWarning,
  tallyPanelVotes,
} from '../../core/accountability';
import {
  RULE_REGISTRY,
  assertFutureCycle,
  canOpenAccountabilityCase,
  canOpenTrial,
  isRuleKey,
  trackFor,
  violatesTrackInvariant,
  type GovernanceTrack,
  type RuleKey,
} from '../../core/governance';
import {
  addPanelMember,
  getLatestAccountabilityCase,
  castPanelVote as castPanelVoteRow,
  createAccountabilityCase,
  createEntryTrial,
  createRuleChange,
  finalizeAccountabilityCase,
  finalizeEntryTrial,
  getGovernanceSettings,
  getOpenAccountabilityCase,
  getOpenTrial,
  getTrial,
  latestRuleValue,
  listAccountabilityCases,
  listPanelMembers,
  listRuleChanges,
  markReductionApplied,
  loadGovernanceState,
  setAccountabilityStage,
  setEntryRecommendation,
  setTrialCriteria,
  setTrialRepresentative,
  type GovernanceSettings,
} from '../../db/repositories/governance';
import { listEscalationContacts } from '../../db/repositories/agreements';
import { listPods } from '../../db/repositories/pods';
import { recordAudit } from '../../db/repositories/audit';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { getCurrentPhaseForScope } from './calendar';

export interface GovernanceServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface TrackSnapshot {
  pod: Pod;
  orgId: UUID;
  track: GovernanceTrack;
}

async function resolveTrack(
  context: GovernanceServiceContext,
  podId: UUID,
): Promise<TrackSnapshot> {
  const state = await loadGovernanceState(context.db, podId);
  if (!state) throw notFound('Pod not found');

  const orgId = await orgIdForPod(context.db, podId);
  const track = trackFor({
    podId,
    status: state.pod.status,
    hasOpenTrial: state.openTrial !== null,
    hasOpenAccountability: state.openCase !== null,
  });

  // Belt and braces: the database triggers refuse this too, but the message
  // here is the one a person would actually read.
  if (
    violatesTrackInvariant({
      podId,
      status: state.pod.status,
      hasOpenTrial: state.openTrial !== null,
      hasOpenAccountability: state.openCase !== null,
    })
  ) {
    throw conflict(
      `${state.pod.name} is on both governance tracks at once — this is the one state the model forbids`,
    );
  }

  return { pod: state.pod, orgId, track };
}

async function orgIdForPod(db: Database, podId: UUID): Promise<UUID> {
  const rows = await queryMany<{ org_id: UUID }>(
    db,
    'SELECT h.org_id FROM pod p JOIN holding h ON h.id = p.holding_id WHERE p.id = $1',
    [podId],
  );
  const orgId = rows[0]?.org_id;
  if (!orgId) throw notFound('Pod not found');
  return orgId;
}

/** The pod's current Pod Lead, resolved live from the rotation — never cached. */
async function currentPodLeadId(
  context: GovernanceServiceContext,
  podId: UUID,
): Promise<UUID | null> {
  const contacts = await listEscalationContacts(context.db, [podId], context.today());
  return contacts[0]?.userId ?? null;
}

/** Members of the Deployment Hub (org-scoped role). */
async function hubMemberIds(context: GovernanceServiceContext, orgId: UUID): Promise<UUID[]> {
  const rows = await queryMany<{ user_id: UUID }>(
    context.db,
    // Org-scoped roles carry `scope_id = NULL` by design, so the org is the
    // principal's own rather than a value matched here.
    `SELECT user_id FROM role_assignment
      WHERE role_type = 'hub_deployment' AND scope_type = 'org'
        AND user_id IN (SELECT id FROM app_user WHERE org_id = $1)
        AND revoked_at IS NULL AND start_date <= $2::date
        AND (end_date IS NULL OR end_date >= $2::date)`,
    [orgId, context.today()],
  );
  return rows.map((row) => row.user_id);
}

// ===========================================================================
// Track 1 — 90-Day Entry Rule
// ===========================================================================

export interface EntryTrialView {
  podId: UUID;
  podName: string;
  track: 'entry_trial';
  trial: EntryTrial | null;
  day: number | null;
  dueDate: ISODate | null;
  daysRemaining: number | null;
  decisionUnlocked: boolean;
  progress: { total: number; met: number; outstanding: number; notApplicable: number } | null;
  podRep: { userId: UUID | null; recommendation: EntryRecommendation | null };
  hubRep: { userId: UUID | null; recommendation: EntryRecommendation | null };
  jointResult: 'full_entry' | 'discontinued' | null;
  /** The accountability track, for the cross-reference banner. */
  crossReference: { track: 'accountability' | 'none'; label: string; href: string | null };
  canRecord: { pod: boolean; hub: boolean };
  totalDays: number;
}

export async function getEntryTrialView(
  context: GovernanceServiceContext,
  podId: UUID,
): Promise<EntryTrialView> {
  const snapshot = await resolveTrack(context, podId);
  const trial = await getTrial(context.db, podId);
  const today = context.today();

  const openCase = await getOpenAccountabilityCase(context.db, podId);

  return {
    podId,
    podName: snapshot.pod.name,
    track: 'entry_trial',
    trial,
    day: trial ? trialDayOf(trial.startDate, today) : null,
    dueDate: trial?.decisionDueDate ?? null,
    daysRemaining: trial ? daysUntilEntryDecision(trial.startDate, today) : null,
    decisionUnlocked: trial ? isEntryDecisionUnlocked(trial.startDate, today) : false,
    progress: trial ? criteriaProgress(trial.criteria) : null,
    podRep: {
      userId: trial?.podRepUserId ?? null,
      recommendation: trial?.podRepRecommendation ?? null,
    },
    hubRep: {
      userId: trial?.deploymentHubUserId ?? null,
      recommendation: trial?.deploymentHubRecommendation ?? null,
    },
    jointResult: trial
      ? combineEntryDecision(trial.podRepRecommendation, trial.deploymentHubRecommendation)
      : null,
    crossReference: openCase
      ? {
          track: 'accountability',
          label: `${snapshot.pod.name} also has an open Accountability Case — that is a different track`,
          href: `/review/accountability/${podId}`,
        }
      : { track: 'none', label: '', href: null },
    canRecord: {
      pod: trial !== null && trial.finalResult === null && isEntryDecisionUnlocked(trial.startDate, today),
      hub: trial !== null && trial.finalResult === null && isEntryDecisionUnlocked(trial.startDate, today),
    },
    totalDays: ENTRY_TRIAL_DAYS,
  };
}

export async function startEntryTrial(
  context: GovernanceServiceContext,
  input: {
    podId: UUID;
    actorUserId: UUID;
    startDate?: ISODate;
    criteria?: TrialCriterionRow[];
  },
): Promise<EntryTrial> {
  const snapshot = await resolveTrack(context, input.podId);
  if (snapshot.track === 'accountability') {
    throw conflict(
      `${snapshot.pod.name} is already on the Accountability Path — a pod cannot be on both tracks`,
    );
  }

  const existing = await getTrial(context.db, input.podId);
  if (existing) throw conflict('This pod already has an Entry Trial');

  if (
    !canOpenTrial({
      podId: input.podId,
      status: snapshot.pod.status,
      hasOpenTrial: false,
      hasOpenAccountability: false,
    })
  ) {
    throw badRequest(
      `Only a pod in trial status follows the 90-Day Entry Rule (${snapshot.pod.name} is ${snapshot.pod.status})`,
    );
  }

  const startDate = input.startDate ?? context.today();
  const trial = await createEntryTrial(context.db, {
    orgId: snapshot.orgId,
    podId: input.podId,
    startDate,
    decisionDueDate: entryDecisionDueDate(startDate),
    criteria: input.criteria ?? [],
  });

  // The pod's representative is the *current* Pod Lead seat, and the hub's is
  // whoever holds the Deployment Hub role — both resolved live.
  const leadId = await currentPodLeadId(context, input.podId);
  if (leadId) await setTrialRepresentative(context.db, trial.id, 'pod', leadId);
  const [hubId] = await hubMemberIds(context, snapshot.orgId);
  if (hubId) await setTrialRepresentative(context.db, trial.id, 'hub', hubId);

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.entry_trial_started',
    entityType: 'entry_trial',
    entityId: trial.id,
    metadata: { podId: input.podId, startDate, dueDate: trial.decisionDueDate },
  });

  await context.bus.publish({
    type: 'governance.entry_trial_started',
    aggregateType: 'pod',
    aggregateId: input.podId,
    orgId: snapshot.orgId,
    actorUserId: input.actorUserId,
    payload: { dueDate: trial.decisionDueDate },
  } as any);

  return (await getTrial(context.db, input.podId)) ?? trial;
}

export async function updateTrialCriteria(
  context: GovernanceServiceContext,
  input: { podId: UUID; actorUserId: UUID; criteria: TrialCriterionRow[] },
): Promise<EntryTrial> {
  const trial = await getOpenTrial(context.db, input.podId);
  if (!trial) throw notFound('No open Entry Trial for this pod');

  const updated = await setTrialCriteria(context.db, trial.id, input.criteria);
  if (!updated) throw notFound('Entry Trial not found');

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.entry_criteria_updated',
    entityType: 'entry_trial',
    entityId: trial.id,
    metadata: { count: input.criteria.length },
  });
  return updated;
}

/**
 * Record one side of the bilateral decision.
 *
 * Fails before Day 90 — there is no early verdict, and there is no correction
 * period: once both sides have spoken, the result is stamped immediately and
 * can never be edited.
 */
export async function recordEntryDecision(
  context: GovernanceServiceContext,
  input: {
    podId: UUID;
    actorUserId: UUID;
    side: 'pod' | 'hub';
    recommendation: EntryRecommendation;
  },
): Promise<EntryTrial> {
  const snapshot = await resolveTrack(context, input.podId);
  const trial = await getOpenTrial(context.db, input.podId);
  if (!trial) throw notFound('No open Entry Trial for this pod');

  const today = context.today();
  if (!isEntryDecisionUnlocked(trial.startDate, today)) {
    throw forbidden(
      `The Entry Rule decision unlocks on Day ${ENTRY_TRIAL_DAYS} (${trial.decisionDueDate}) — today is Day ${trialDayOf(trial.startDate, today)}`,
    );
  }

  if (input.side === 'pod') {
    const leadId = await currentPodLeadId(context, input.podId);
    if (leadId !== input.actorUserId) {
      throw forbidden('Only the pod’s current Pod Lead can record the pod’s recommendation');
    }
  } else {
    const hubIds = await hubMemberIds(context, snapshot.orgId);
    if (!hubIds.includes(input.actorUserId)) {
      throw forbidden('Only the Deployment Hub can record the hub’s recommendation');
    }
  }

  const updated = await setEntryRecommendation(
    context.db,
    trial.id,
    input.side,
    input.recommendation,
  );
  if (!updated) throw notFound('Entry Trial not found');

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.entry_recommendation',
    entityType: 'entry_trial',
    entityId: trial.id,
    metadata: { side: input.side, recommendation: input.recommendation },
  });

  // Bilateral: once both sides have spoken the decision is made, and a single
  // "do not continue" is enough to end the unit.
  const joint = combineEntryDecision(
    updated.podRepRecommendation,
    updated.deploymentHubRecommendation,
  );
  if (joint && updated.finalResult === null) {
    const finalized = await finalizeEntryTrial(context.db, updated.id, joint);
    if (finalized) {
      await recordAudit(context.db, {
        actorUserId: input.actorUserId,
        action: 'governance.entry_decided',
        entityType: 'entry_trial',
        entityId: finalized.id,
        metadata: { result: joint },
      });
      await context.bus.publish({
        type: joint === 'discontinued' ? 'governance.pod_discontinued' : 'governance.pod_entered',
        aggregateType: 'pod',
        aggregateId: input.podId,
        orgId: snapshot.orgId,
        actorUserId: input.actorUserId,
        payload: { result: joint },
      } as any);
      return finalized;
    }
  }

  return updated;
}

export const ENTRY_TRIAL_LABELS = RECOMMENDATION_LABELS;

// ===========================================================================
// Track 2 — Accountability & Dissolution Path
// ===========================================================================

export interface AccountabilityView {
  podId: UUID;
  podName: string;
  track: 'accountability';
  stage: AccountabilityStageValue;
  stages: Array<{
    key: AccountabilityStageValue;
    label: string;
    summary: string;
    state: 'done' | 'current' | 'upcoming';
  }>;
  currentStageLabel: string;
  currentStageSummary: string;
  case_:
    | {
        id: UUID;
        stage2TriggeredAt: string | null;
        reductionApplied: boolean;
        correctionStartDate: ISODate | null;
        correctionEndDate: ISODate | null;
        correctionDaysRemaining: number | null;
        finalResult: AccountabilityResult | null;
        decidedAt: string | null;
        openedAt: string;
      }
    | null;
  panel: Array<{
    memberId: UUID;
    userId: UUID;
    name: string;
    roleLabel: string;
    vote: PanelVoteValue | null;
    comment: string | null;
    votedAt: string | null;
  }>;
  tally: {
    panelSize: number;
    cast: number;
    quorum: number;
    continueVotes: number;
    dissolveVotes: number;
    canFinalize: boolean;
    result: AccountabilityResult | null;
  } | null;
  panelWarning: string | null;
  canAdvance: boolean;
  nextStage: AccountabilityStageValue | null;
  correctionPeriodOver: boolean;
  /** The entry-trial track, for the cross-reference banner. */
  crossReference: { track: 'entry_trial' | 'none'; label: string; href: string | null };
  settings: GovernanceSettings;
}

export async function getAccountabilityView(
  context: GovernanceServiceContext,
  podId: UUID,
): Promise<AccountabilityView> {
  const snapshot = await resolveTrack(context, podId);
  const today = context.today();
  // Reads show the latest case even once it is decided, so the outcome stays
  // visible; only the *open* one admits new votes or stage changes.
  const openCase = await getOpenAccountabilityCase(context.db, podId);
  const shownCase = openCase ?? (await getLatestAccountabilityCase(context.db, podId));
  const trial = await getOpenTrial(context.db, podId);
  const settings = await getGovernanceSettings(context.db, snapshot.orgId);

  const stage: AccountabilityStageValue = shownCase?.currentStage ?? 'transparency';
  const members = shownCase ? await listPanelMembers(context.db, shownCase.id) : [];
  const names = await namesFor(context, members.map((member) => member.userId));
  const tally =
    stage === 'correction_period' && members.length > 0
      ? tallyPanelVotes(members.map((member) => ({ userId: member.userId, vote: member.vote })))
      : null;

  const stageIndex = ACCOUNTABILITY_STAGES.indexOf(stage);

  return {
    podId,
    podName: snapshot.pod.name,
    track: 'accountability',
    stage,
    stages: ACCOUNTABILITY_STAGES.map((key) => ({
      key,
      label: STAGE_LABELS[key],
      summary: STAGE_SUMMARIES[key],
      state:
        ACCOUNTABILITY_STAGES.indexOf(key) < stageIndex
          ? 'done'
          : ACCOUNTABILITY_STAGES.indexOf(key) === stageIndex
            ? 'current'
            : 'upcoming',
    })),
    currentStageLabel: STAGE_LABELS[stage],
    currentStageSummary: STAGE_SUMMARIES[stage],
    case_: shownCase
      ? {
          id: shownCase.id,
          stage2TriggeredAt: shownCase.stage2TriggeredAt,
          reductionApplied: shownCase.reductionApplied,
          correctionStartDate: shownCase.correctionStartDate,
          correctionEndDate: shownCase.correctionEndDate,
          correctionDaysRemaining: shownCase.correctionEndDate
            ? Math.max(
                0,
                Math.round((Date.parse(shownCase.correctionEndDate) - Date.parse(today)) / 86_400_000),
              )
            : null,
          finalResult: shownCase.finalResult,
          decidedAt: shownCase.decidedAt,
          openedAt: shownCase.openedAt,
        }
      : null,
    panel: members.map((member) => ({
      memberId: member.id,
      userId: member.userId,
      name: names[member.userId] ?? 'Panel member',
      roleLabel: member.roleLabel,
      vote: member.vote,
      comment: member.comment,
      votedAt: member.votedAt,
    })),
    tally,
    panelWarning: members.length > 0 ? minPanelWarning(members.length) : null,
    canAdvance: openCase !== null && openCase.finalResult === null,
    nextStage: ACCOUNTABILITY_STAGES[stageIndex + 1] ?? null,
    correctionPeriodOver:
      shownCase?.correctionEndDate != null && isCorrectionPeriodOver(shownCase.correctionEndDate, today),
    crossReference: trial
      ? {
          track: 'entry_trial',
          label: `${snapshot.pod.name} also has an open Entry Trial — that is a different track`,
          href: `/review/entry/${podId}`,
        }
      : { track: 'none', label: '', href: null },
    settings,
  };
}

export async function openAccountabilityCase(
  context: GovernanceServiceContext,
  input: { podId: UUID; actorUserId: UUID },
) {
  const snapshot = await resolveTrack(context, input.podId);
  if (snapshot.track === 'entry_trial') {
    throw conflict(
      `${snapshot.pod.name} is an Entry Trial pod — it follows the 90-Day Entry Rule, not this path`,
    );
  }
  if (
    !canOpenAccountabilityCase({
      podId: input.podId,
      status: snapshot.pod.status,
      hasOpenTrial: false,
      hasOpenAccountability: false,
    })
  ) {
    throw badRequest(
      'Only an established pod can enter the Accountability Path (this pod is still in trial status)',
    );
  }

  const existing = await getOpenAccountabilityCase(context.db, input.podId);
  if (existing) throw conflict('This pod already has an open Accountability Case');

  const created = await createAccountabilityCase(context.db, {
    orgId: snapshot.orgId,
    podId: input.podId,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.accountability_opened',
    entityType: 'accountability_case',
    entityId: created.id,
    metadata: { podId: input.podId },
  });

  await context.bus.publish({
    type: 'governance.accountability_opened',
    aggregateType: 'pod',
    aggregateId: input.podId,
    orgId: snapshot.orgId,
    actorUserId: input.actorUserId,
    payload: {},
  } as any);

  return created;
}

/**
 * Stage 2 is triggered by data, not by a manager: the pod's score crossing the
 * org-configured threshold. When it fires, the reduction is written as a
 * *visible adjustment record* for Module 05's budget calculation — never an
 * untracked manual cut.
 */
export async function evaluateStage2Trigger(
  context: GovernanceServiceContext,
  input: { podId: UUID; actorUserId: UUID | null; score: number },
): Promise<{ triggered: boolean; threshold: number | null; case_?: unknown }> {
  const snapshot = await resolveTrack(context, input.podId);
  if (snapshot.track === 'entry_trial') {
    return { triggered: false, threshold: null };
  }

  const settings = await getGovernanceSettings(context.db, snapshot.orgId);
  const threshold = settings.accountabilityStage2ScoreThreshold;
  if (!isStage2Triggered(input.score, threshold)) return { triggered: false, threshold };

  const openCase =
    (await getOpenAccountabilityCase(context.db, input.podId)) ??
    (await createAccountabilityCase(context.db, { orgId: snapshot.orgId, podId: input.podId }));

  if (openCase.currentStage === 'transparency') {
    await setAccountabilityStage(context.db, openCase.id, 'reduced_share', {
      triggerStage2At: new Date().toISOString(),
    });
  }
  await markReductionApplied(context.db, openCase.id);

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.stage2_triggered',
    entityType: 'accountability_case',
    entityId: openCase.id,
    metadata: { score: input.score, threshold, reductionApplied: true },
  });

  return { triggered: true, threshold, case_: openCase };
}

type StageExtras = NonNullable<Parameters<typeof setAccountabilityStage>[3]>;

export async function advanceStage(
  context: GovernanceServiceContext,
  input: {
    podId: UUID;
    actorUserId: UUID;
    to: AccountabilityStageValue;
    coachUserId?: UUID | null;
    conflictCaseId?: UUID | null;
    correctionDays?: number;
  },
): Promise<AccountabilityView> {
  const snapshot = await resolveTrack(context, input.podId);
  if (snapshot.track === 'entry_trial') {
    throw conflict('This pod is on the Entry Rule track and has no accountability stages');
  }

  const openCase = await getOpenAccountabilityCase(context.db, input.podId);
  if (!openCase) throw notFound('No open Accountability Case for this pod');

  const currentIndex = ACCOUNTABILITY_STAGES.indexOf(openCase.currentStage);
  const targetIndex = ACCOUNTABILITY_STAGES.indexOf(input.to);
  if (targetIndex !== currentIndex + 1) {
    throw forbidden(
      `Stages are sequential: ${STAGE_LABELS[openCase.currentStage]} can only move to ${
        STAGE_LABELS[ACCOUNTABILITY_STAGES[currentIndex + 1]!]
      }`,
    );
  }

  const today = context.today();
  const settings = await getGovernanceSettings(context.db, snapshot.orgId);
  const extra: StageExtras = {};

  if (input.to === 'mediation') {
    extra.conflictCaseId = input.conflictCaseId ?? null;
  }
  if (input.to === 'correction_period') {
    const days = input.correctionDays ?? settings.accountabilityCorrectionDays ?? CORRECTION_PERIOD_DAYS;
    extra.correctionStartDate = today;
    extra.correctionEndDate = correctionEndDate(today, days);
    extra.assignedCoachUserId = input.coachUserId ?? null;
  }

  await setAccountabilityStage(context.db, openCase.id, input.to, extra);

  // The panel is constituted when the correction period opens. Its size is the
  // org-configured one and it is never fewer than three people.
  if (input.to === 'correction_period') {
    await constitutePanel(context, openCase.id, input.podId, snapshot.orgId, settings.accountabilityPanelSize);
  }

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.stage_advanced',
    entityType: 'accountability_case',
    entityId: openCase.id,
    metadata: { from: openCase.currentStage, to: input.to },
  });

  return getAccountabilityView(context, input.podId);
}

async function constitutePanel(
  context: GovernanceServiceContext,
  caseId: UUID,
  podId: UUID,
  orgId: UUID,
  size: number,
): Promise<void> {
  // Peers first: leads of *other* pods in the org, then hub members to fill up.
  const peers = await queryMany<{ user_id: UUID; pod_name: string }>(
    context.db,
    `SELECT r.user_id, p.name AS pod_name
       FROM role_assignment r
       JOIN pod p ON p.id = r.scope_id
       JOIN holding h ON h.id = p.holding_id
      WHERE r.role_type = 'pod_lead' AND r.scope_type = 'pod'
        AND h.org_id = $1 AND r.scope_id <> $2
        AND r.revoked_at IS NULL AND r.start_date <= $3::date
        AND (r.end_date IS NULL OR r.end_date >= $3::date)
      ORDER BY p.name`,
    [orgId, podId, context.today()],
  );

  const chosen: Array<{ userId: UUID; roleLabel: string }> = peers.map((peer) => ({
    userId: peer.user_id,
    roleLabel: `Peer Pod Lead — ${peer.pod_name}`,
  }));

  if (chosen.length < size) {
    for (const hubId of await hubMemberIds(context, orgId)) {
      if (chosen.some((member) => member.userId === hubId)) continue;
      chosen.push({ userId: hubId, roleLabel: 'Deployment Hub representative' });
      if (chosen.length >= size) break;
    }
  }

  // Take the configured number; if the org simply does not have that many
  // eligible people the panel is smaller and the UI says so rather than
  // inventing a vote.
  for (const member of chosen.slice(0, size)) {
    await addPanelMember(context.db, caseId, member.userId, member.roleLabel);
  }
}

export async function castPanelVote(
  context: GovernanceServiceContext,
  input: {
    podId: UUID;
    actorUserId: UUID;
    vote: PanelVoteValue;
    comment: string | null;
  },
): Promise<AccountabilityView> {
  const snapshot = await resolveTrack(context, input.podId);
  const openCase = await getOpenAccountabilityCase(context.db, input.podId);
  if (!openCase) throw notFound('No open Accountability Case for this pod');
  if (openCase.currentStage !== 'correction_period') {
    throw forbidden('The panel only votes once the 30-day correction period has opened');
  }

  const members = await listPanelMembers(context.db, openCase.id);
  const membership = members.find((member) => member.userId === input.actorUserId);
  if (!membership) throw forbidden('Only a member of the panel can vote on this pod’s future');
  if (membership.vote !== null) throw forbidden('You have already cast your vote');

  const comment = (input.comment ?? '').trim();
  if (comment.length < 20) {
    throw badRequest('A panel vote needs a short reason both the pod and the archive can read');
  }

  await castPanelVoteRow(context.db, membership.id, input.vote, comment);

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.panel_vote',
    entityType: 'accountability_case',
    entityId: openCase.id,
    metadata: { vote: input.vote },
  });

  // Finalize as soon as the result is mathematically decided — a pod should not
  // wait on a straggler once the quorum has spoken.
  const after = await listPanelMembers(context.db, openCase.id);
  const tally = tallyPanelVotes(after.map((member) => ({ userId: member.userId, vote: member.vote })));
  if (tally.canFinalize && tally.result && openCase.finalResult === null) {
    await finalizeAccountabilityCase(context.db, openCase.id, tally.result);
    await recordAudit(context.db, {
      actorUserId: input.actorUserId,
      action: 'governance.accountability_decided',
      entityType: 'accountability_case',
      entityId: openCase.id,
      metadata: { ...tally, result: tally.result },
    });
    await context.bus.publish({
      type: tally.result === 'dissolve' ? 'governance.pod_dissolved' : 'governance.pod_continues',
      aggregateType: 'pod',
      aggregateId: input.podId,
      orgId: snapshot.orgId,
      actorUserId: input.actorUserId,
      payload: { result: tally.result },
    } as any);
  }

  return getAccountabilityView(context, input.podId);
}

export async function listCasesForOrg(
  context: GovernanceServiceContext,
  orgId: UUID,
): Promise<Array<{ podId: UUID; stage: AccountabilityStageValue; result: AccountabilityResult | null }>> {
  const cases = await listAccountabilityCases(context.db, orgId);
  return cases.map((item) => ({
    podId: item.podId,
    stage: item.currentStage,
    result: item.finalResult,
  }));
}

async function namesFor(
  context: GovernanceServiceContext,
  userIds: UUID[],
): Promise<Record<UUID, string>> {
  if (userIds.length === 0) return {};
  const rows = await queryMany<{ id: UUID; full_name: string }>(
    context.db,
    'SELECT id, full_name FROM app_user WHERE id = ANY($1::uuid[])',
    [userIds],
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.full_name]));
}

export const ACCOUNTABILITY_STAGE_LABELS = STAGE_LABELS;

/**
 * Which track every pod in the org is on.
 *
 * Powers the `/review` overview. It exists as one call so the answer to "is
 * this pod in trial or in accountability?" is computed once, in the same place
 * the two tracks' services compute it — a screen cannot render a third opinion.
 */
export interface PodTrackSummary {
  podId: UUID;
  podName: string;
  status: Pod['status'];
  track: GovernanceTrack;
  /** Accountability only. */
  stage: AccountabilityStageValue | null;
  /** Entry trial only. */
  day: number | null;
  dueDate: ISODate | null;
  finalResult: string | null;
}

export async function listGovernanceOverview(
  context: GovernanceServiceContext,
  orgId: UUID,
): Promise<PodTrackSummary[]> {
  const pods = await listPods(context.db, orgId);
  const today = context.today();

  const summaries: PodTrackSummary[] = [];
  for (const pod of pods) {
    const trial = await getOpenTrial(context.db, pod.id);
    const openCase = await getOpenAccountabilityCase(context.db, pod.id);
    const track = trackFor({
      podId: pod.id,
      status: pod.status,
      hasOpenTrial: trial !== null,
      hasOpenAccountability: openCase !== null,
    });

    summaries.push({
      podId: pod.id,
      podName: pod.name,
      status: pod.status,
      track,
      stage: openCase?.currentStage ?? null,
      day: trial ? trialDayOf(trial.startDate, today) : null,
      dueDate: trial?.decisionDueDate ?? null,
      finalResult: (openCase?.finalResult ?? trial?.finalResult ?? null) as string | null,
    });
  }

  // Trial pods first — they are the ones with a hard 90-day clock running.
  return summaries.sort((a, b) => {
    if (a.track !== b.track) {
      const order: Record<GovernanceTrack, number> = { entry_trial: 0, accountability: 1, none: 2 };
      return order[a.track] - order[b.track];
    }
    return a.podName.localeCompare(b.podName);
  });
}

// ===========================================================================
// Rule versioning — always next cycle, never retroactive
// ===========================================================================

export interface RuleRegistryEntry {
  key: RuleKey;
  label: string;
  source: string;
  defaultValue: unknown;
  currentValue: unknown;
  history: RuleChange[];
}

export async function listRules(
  context: GovernanceServiceContext,
  orgId: UUID,
): Promise<RuleRegistryEntry[]> {
  const changes = await listRuleChanges(context.db, orgId);
  return Object.values(RULE_REGISTRY).map((rule) => ({
    key: rule.key,
    label: rule.label,
    source: rule.source,
    defaultValue: rule.defaultValue,
    currentValue: currentRuleValue(changes, rule.key, rule.defaultValue),
    history: changes.filter((change) => change.ruleName === rule.key),
  }));
}

function currentRuleValue(
  changes: RuleChange[],
  key: RuleKey,
  fallback: unknown,
): unknown {
  const approved = changes
    .filter((change) => change.ruleName === key && change.approvedAt !== null)
    .sort((a, b) => b.effectiveCycleNumber - a.effectiveCycleNumber);
  return approved[0]?.newValue ?? fallback;
}

export async function proposeRuleChange(
  context: GovernanceServiceContext,
  input: {
    orgId: UUID;
    actorUserId: UUID;
    ruleName: string;
    newValue: unknown;
    justification: string;
    effectiveCycleNumber: number;
  },
): Promise<RuleChange> {
  if (!isRuleKey(input.ruleName)) {
    throw badRequest(`Unknown rule: ${input.ruleName}`);
  }

  const justification = input.justification.trim();
  if (justification.length < 20) {
    throw badRequest('A rule change needs a justification the whole org can read');
  }

  // Never retroactive: the change can only take effect in a future cycle.
  const phase = await getCurrentPhaseForScope(context.db, { orgId: input.orgId }, context.today());
  const currentCycle = phase?.cycleNumber ?? 0;
  const check = assertFutureCycle(input.effectiveCycleNumber, currentCycle);
  if (!check.ok) throw badRequest(check.message ?? 'Rule changes apply to a future cycle only');

  const registry = RULE_REGISTRY[input.ruleName];
  const stored = await latestRuleValue(context.db, input.orgId, input.ruleName);
  const oldValue = stored ?? registry.defaultValue;

  if (input.ruleName === 'budget.formula_weights') {
    // The formula is a fixed part of the constitution: it is recorded, never
    // applied by this module and never silently reweighted.
    const weights = input.newValue as
      | { financial?: number; peer_review?: number; strategic?: number }
      | null;
    if (!weights) throw badRequest('The budget formula needs its three weights');
    const parts = {
      financial: Number(weights.financial ?? 0),
      peer_review: Number(weights.peer_review ?? 0),
      strategic: Number(weights.strategic ?? 0),
    };
    if (Object.values(parts).some((part) => !Number.isFinite(part) || part < 0)) {
      throw badRequest('Every formula weight has to be a positive number');
    }
    const total = Math.round((parts.financial + parts.peer_review + parts.strategic) * 100) / 100;
    if (total !== 100) {
      throw badRequest(
        `The formula weights must add up to 100 (got ${total}) — the 40/35/25 split is not manually overridable`,
      );
    }
  }

  const change = await createRuleChange(context.db, {
    orgId: input.orgId,
    ruleName: input.ruleName,
    oldValue,
    newValue: input.newValue,
    proposedBy: input.actorUserId,
    justification,
    effectiveCycleId: null,
    effectiveCycleNumber: input.effectiveCycleNumber,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'governance.rule_change_proposed',
    entityType: 'rule_change',
    entityId: change.id,
    metadata: {
      ruleName: input.ruleName,
      effectiveCycleNumber: input.effectiveCycleNumber,
      currentCycle,
    },
  });

  await context.bus.publish({
    type: 'governance.rule_change_proposed',
    aggregateType: 'org',
    aggregateId: input.orgId,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { ruleName: input.ruleName, effectiveCycleNumber: input.effectiveCycleNumber },
  } as any);

  return change;
}

export async function listRuleHistory(
  context: GovernanceServiceContext,
  orgId: UUID,
): Promise<RuleChange[]> {
  return listRuleChanges(context.db, orgId);
}
