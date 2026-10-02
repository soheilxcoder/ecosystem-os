/**
 * Strategic Hub Console services (Module 09).
 *
 * The console's whole identity is what it *cannot* do: nothing here edits a
 * pod's score, budget or governance outcome — those flows live in their own
 * modules with their own audited paths. What Company X's hubs DO own:
 *
 *   - launching new pods/units (the wizard below is the system's ONLY pod
 *     creation path, so every pod starts life with an Entry Trial and a coach),
 *   - tracking entry trials,
 *   - publishing aggregated investor reports (minimum aggregation enforced),
 *   - the external contact log,
 *   - named pilot programs (8 prep weeks + 90-day sprint + decision).
 *
 * Every write is recorded in the same audit log the pods read, so the org sees
 * Company X act the way Company X sees the org act.
 */

import type { Database, Queryable } from '../../db/client';
import { queryMany, queryOne } from '../../db/client';
import type { EventBus, DomainEvent } from '../../core/events';
import type { ISODate } from '../../core/time';
import { daysBetween, addDays } from '../../core/time';
import type {
  CorrectionEntityType,
  PilotDecision,
  PilotPhase,
  PilotPhaseState,
  PilotProgram,
  PilotSuccessCriteria,
  TrialCriterionRow,
  UUID,
} from '../../core/types';
import { createPod, addPodMember, getPod } from '../../db/repositories/pods';
import { findUserByEmail, listHoldings } from '../../db/repositories/users';
import { assignRole } from '../../db/repositories/roles';
import { createAssignment } from '../../db/repositories/coaching';
import { recordFinancialSync } from '../../db/repositories/budget';
import { getActiveCycle, listCycles } from '../../db/repositories/calendar';
import {
  createCorrectionRecord,
  createExternalContact,
  createInvestorReport,
  createPilotProgram,
  decideCorrectionRecord,
  getCorrectionRecord,
  getPilotProgram,
  listCorrectionRecords,
  listExternalContacts,
  listInvestorReports,
  listPilotPrograms,
  publishInvestorReport,
  recordPilotDecision,
  setPilotPod,
  updateExternalContact,
  updatePilotPhase,
  updatePilotSuccessCriteria,
} from '../../db/repositories/hub';
import { latestRuleValue, listRuleChanges } from '../../db/repositories/governance';
import { jsonField, toDateString } from '../../db/repositories/rows';
import { createLessonLearned, createArchiveEntry } from '../../db/repositories/archive';
import { recordAudit } from '../../db/repositories/audit';
import { startEntryTrial } from './governance';
import { badRequest, conflict, notFound } from '../errors';

export interface HubServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

// ---------------------------------------------------------------------------
// The deployment wizard's launch action — the ONLY pod creation path
// ---------------------------------------------------------------------------

/**
 * The cycle a launch attaches to. Prefers the active cycle; if the org
 * happens to be between cycles, falls back to the most recent one (the coach
 * assignment's start_cycle_id is NOT NULL, and a launch between cycles is an
 * operational oddity rather than an impossible state).
 */
async function resolveCurrentCycle(
  db: Queryable,
  orgId: UUID,
  holdingId: UUID,
) {
  const scope = { orgId, holdingId };
  const active = await getActiveCycle(db, scope);
  if (active) return active;
  const cycles = await listCycles(db, scope, 1);
  const latest = cycles[0];
  if (latest) return latest;
  throw badRequest('No sprint cycle exists yet — set up the calendar before launching pods');
}

export interface LaunchPodInput {
  orgId: UUID;
  actorUserId: UUID;
  name: string;
  categoryTag?: string | null;
  holdingId: UUID;
  /** Initial members, referenced by email (they must already exist in the org). */
  memberEmails: string[];
  /** The pod's first lead — must be one of the members. */
  leadEmail?: string | null;
  coachUserId?: UUID | null;
  /** The connected financial/CRM source system, if one was wired up. */
  dataSourceSystem?: string | null;
  trialStartDate?: ISODate;
  /** The wizard's selection checklist becomes the trial's criteria. */
  criteria?: TrialCriterionRow[];
  /** Set when this launch expands a pilot into its next unit. */
  pilotId?: UUID | null;
}

export interface LaunchPodResult {
  podId: UUID;
  trialId: UUID | null;
  memberCount: number;
  coachUserId: UUID | null;
  dataSourceConnected: boolean;
}

/**
 * Step 5 of the deployment wizard. This is the single code path that creates a
 * pod over the API, which is what guarantees every pod has, from day one:
 * membership + roles, an initial coach, a connected data source marker, and an
 * Entry Trial with the selection checklist attached.
 */
export async function launchPod(
  context: HubServiceContext,
  input: LaunchPodInput,
): Promise<LaunchPodResult> {
  const { db, today } = context;
  const name = input.name.trim();
  if (!name) throw badRequest('The new pod needs a name');

  const holdings = await listHoldings(db, input.orgId);
  const holding = holdings.find((h) => h.id === input.holdingId);
  if (!holding) throw notFound('Holding not found in this organisation');

  // Members must already exist in the org — inviting brand-new people is an
  // auth concern, not a deployment one.
  const members = [] as Array<{ userId: UUID; fullName: string; email: string }>;
  const unknown: string[] = [];
  for (const email of [...new Set(input.memberEmails.map((e) => e.trim().toLowerCase()))]) {
    if (!email) continue;
    const user = await findUserByEmail(db, email);
    if (!user || user.orgId !== input.orgId) {
      unknown.push(email);
      continue;
    }
    members.push({ userId: user.id, fullName: user.fullName, email });
  }
  if (unknown.length > 0) {
    throw badRequest(`No org account for: ${unknown.join(', ')} — they must sign in once first`);
  }
  if (members.length === 0) throw badRequest('A pod needs at least one member');

  const leadEmail = (input.leadEmail ?? '').trim().toLowerCase();
  const leadMember = leadEmail ? members.find((m) => m.email === leadEmail)?.userId ?? null : null;
  if (leadEmail && !leadMember) {
    throw badRequest('The initial Pod Lead must be one of the initial members');
  }

  // 1. The pod itself — always born in trial status.
  const pod = await createPod(db, {
    holdingId: input.holdingId,
    name,
    categoryTag: input.categoryTag ?? null,
    status: 'trial',
  });

  // 2. Membership + seats. Everyone is a member; the named lead holds the first
  //    pod_lead seat until the active cycle's rotation ends (open-ended if no
  //    cycle is running yet).
  for (const member of members) {
    await addPodMember(db, { podId: pod.id, userId: member.userId, joinedAt: today() });
    await assignRole(db, {
      userId: member.userId,
      roleType: 'pod_member',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: today(),
    });
  }
  const currentCycle = await resolveCurrentCycle(db, input.orgId, input.holdingId);
  if (leadMember) {
    await assignRole(db, {
      userId: leadMember,
      roleType: 'pod_lead',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: today(),
      endDate: currentCycle.endDate,
    });
  }

  // 3. The initial coach — an assignment plus the pod-scoped coach seat.
  if (input.coachUserId) {
    await createAssignment(db, {
      orgId: input.orgId,
      coachUserId: input.coachUserId,
      podId: pod.id,
      startCycleId: currentCycle.id,
      reasonForChange: 'Initial assignment at launch',
      createdBy: input.actorUserId,
    });
    await assignRole(db, {
      userId: input.coachUserId,
      roleType: 'coach',
      scopeType: 'pod',
      scopeId: pod.id,
      startDate: today(),
    });
  }

  // 4. The data source connection. A `stale` marker with no error means
  //    "connected, awaiting first sync" — the Budget module reads it as an
  //    unresolved input, which is exactly right for a pod born mid-cycle.
  let dataSourceConnected = false;
  if (input.dataSourceSystem) {
    await recordFinancialSync(db, {
      podId: pod.id,
      cycleId: currentCycle.id,
      sourceSystem: input.dataSourceSystem,
      periodStart: currentCycle.startDate,
      periodEnd: today(),
      status: 'stale',
      error: null,
    });
    dataSourceConnected = true;
    await recordAudit(db, {
      actorUserId: input.actorUserId,
      action: 'hub.data_source_connected',
      entityType: 'pod',
      entityId: pod.id,
      metadata: { sourceSystem: input.dataSourceSystem },
    });
  }

  // 5. The Entry Trial — the 90-Day Entry Rule applies from day one.
  const trial = await startEntryTrial(context, {
    podId: pod.id,
    actorUserId: input.actorUserId,
    startDate: input.trialStartDate ?? today(),
    criteria: input.criteria ?? [],
  });

  // 6. Pilot expansion carry-over: the pilot's lessons travel into the new
  //    pod's archive record, and the pilot points at its unit.
  if (input.pilotId) {
    const pilot = await getPilotProgram(db, input.pilotId);
    if (pilot) {
      await setPilotPod(db, pilot.id, pod.id);
      if (pilot.lessonsLearned) {
        const lesson = await createLessonLearned(db, {
          orgId: input.orgId,
          relatedEntityType: 'pod',
          relatedEntityId: pod.id,
          whatHappened: `Lessons carried over from pilot "${pilot.name}" into ${name}.`,
          whatWedDoDifferently: pilot.lessonsLearned,
          tags: ['pilot', 'expansion'],
          createdBy: input.actorUserId,
        });
        await createArchiveEntry(db, {
          orgId: input.orgId,
          entityType: 'lesson',
          entityId: lesson.id,
          title: `Pilot lessons carried into ${name}`,
          summary: pilot.lessonsLearned,
          podIds: [pod.id],
          holdingId: input.holdingId,
          tags: ['lesson', 'pilot', 'expansion'],
          occurredAt: new Date().toISOString(),
          sourceEventId: null,
        });
      }
    }
  }

  // 7. The audit row + the event that feeds notifications and the archive.
  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'hub.pod_launched',
    entityType: 'pod',
    entityId: pod.id,
    metadata: {
      holdingId: input.holdingId,
      memberCount: members.length,
      coachUserId: input.coachUserId ?? null,
      dataSourceSystem: input.dataSourceSystem ?? null,
      pilotId: input.pilotId ?? null,
    },
  });

  await context.bus.publish({
    type: 'hub.pod_launched',
    aggregateType: 'pod',
    aggregateId: pod.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { podId: pod.id, holdingId: input.holdingId, name },
  });

  return {
    podId: pod.id,
    trialId: trial?.id ?? null,
    memberCount: members.length,
    coachUserId: input.coachUserId ?? null,
    dataSourceConnected,
  };
}

// ---------------------------------------------------------------------------
// Trial status tracker
// ---------------------------------------------------------------------------

export interface TrialStatusRow {
  podId: UUID;
  podName: string;
  holdingName: string | null;
  trialId: UUID | null;
  decisionDueDate: ISODate | null;
  daysRemaining: number | null;
  criteriaMet: number;
  criteriaTotal: number;
  completionPercent: number;
}

export async function listTrialStatus(
  context: HubServiceContext,
  orgId: UUID,
): Promise<TrialStatusRow[]> {
  const rows = await queryMany<{
    pod_id: UUID;
    pod_name: string;
    holding_name: string | null;
    trial_id: UUID | null;
    decision_due_date: ISODate | null;
    criteria: unknown;
  }>(
    context.db,
    `SELECT p.id AS pod_id, p.name AS pod_name, h.name AS holding_name,
            t.id AS trial_id, t.decision_due_date, t.criteria
       FROM pod p
       JOIN holding h ON h.id = p.holding_id
       LEFT JOIN entry_trial t ON t.pod_id = p.id AND t.final_result IS NULL
      WHERE h.org_id = $1 AND p.status = 'trial'
      ORDER BY t.decision_due_date NULLS LAST, p.name`,
    [orgId],
  );

  return rows.map((row) => {
    const parsed = jsonField<unknown>(row.criteria, []);
    const criteria = Array.isArray(parsed) ? (parsed as TrialCriterionRow[]) : [];
    const met = criteria.filter((c) => c.met === true).length;
    const total = criteria.length;
    const dueDate = row.decision_due_date ? (toDateString(row.decision_due_date) as ISODate) : null;
    const daysRemaining = dueDate ? daysBetween(context.today(), dueDate) : null;
    return {
      podId: row.pod_id,
      podName: row.pod_name,
      holdingName: row.holding_name,
      trialId: row.trial_id,
      decisionDueDate: dueDate,
      daysRemaining,
      criteriaMet: met,
      criteriaTotal: total,
      completionPercent: total === 0 ? 0 : Math.round((met / total) * 100),
    };
  });
}

// ---------------------------------------------------------------------------
// Investor reports — aggregation enforced at generation time
// ---------------------------------------------------------------------------

/** The minimum number of pods a report may aggregate. Rule-managed, default 2. */
export async function minAggregationSize(db: Queryable, orgId: UUID): Promise<number> {
  const value = await latestRuleValue(db, orgId, 'investor_min_aggregation');
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

interface ScopedPod {
  id: UUID;
  status: string;
  holdingId: UUID;
}

async function resolveReportScope(
  db: Queryable,
  orgId: UUID,
  scope: { holdingIds: UUID[]; podIds: UUID[] },
): Promise<ScopedPod[]> {
  const rows = await queryMany<{ id: UUID; status: string; holding_id: UUID; org_id: UUID }>(
    db,
    `SELECT p.id, p.status, p.holding_id, h.org_id
       FROM pod p JOIN holding h ON h.id = p.holding_id
      WHERE h.org_id = $1`,
    [orgId],
  );
  const all = rows.filter((r) => r.org_id === orgId);
  if (scope.holdingIds.length === 0 && scope.podIds.length === 0) {
    return all.map((r) => ({ id: r.id, status: r.status, holdingId: r.holding_id }));
  }
  const holdingSet = new Set(scope.holdingIds);
  const podSet = new Set(scope.podIds);
  return all
    .filter((r) => holdingSet.has(r.holding_id) || podSet.has(r.id))
    .map((r) => ({ id: r.id, status: r.status, holdingId: r.holding_id }));
}

export async function generateInvestorReport(
  context: HubServiceContext,
  input: {
    orgId: UUID;
    actorUserId: UUID;
    dateFrom: ISODate;
    dateTo: ISODate;
    holdingIds: UUID[];
    podIds: UUID[];
  },
): Promise<{ report: Awaited<ReturnType<typeof createInvestorReport>>; podCountInScope: number }> {
  const { db } = context;
  if (input.dateTo < input.dateFrom) throw badRequest('The report window ends before it starts');

  const scope = { holdingIds: input.holdingIds, podIds: input.podIds };
  const pods = await resolveReportScope(db, input.orgId, scope);

  // The structural guarantee: a report can never resolve to effectively one
  // pod's operational detail. The threshold is rule-managed.
  const minimum = await minAggregationSize(db, input.orgId);
  if (pods.length < minimum) {
    throw conflict(
      `An investor report must aggregate at least ${minimum} pods (this scope covers ${pods.length}) — pod-level detail stays inside the platform`,
      'aggregation_below_minimum',
    );
  }

  const podIds = pods.map((p) => p.id);

  const budgetRow = await queryOne<{ total: string | null }>(
    db,
    `SELECT SUM(r.final_budget)::text AS total
       FROM pod_budget_result r
       JOIN budget_cycle bc ON bc.id = r.budget_cycle_id
       JOIN sprint_cycle c ON c.id = bc.cycle_id
      WHERE r.pod_id = ANY($1::uuid[])
        AND c.start_date >= $2::date AND c.start_date <= $3::date`,
    [podIds, input.dateFrom, input.dateTo],
  );

  const trendRow = await queryOne<{ avg_profit: string | null }>(
    db,
    `SELECT AVG(s.profit)::text AS avg_profit
       FROM financial_sync_record s
      WHERE s.pod_id = ANY($1::uuid[]) AND s.status = 'ok'
        AND s.fetched_at >= $2::date AND s.fetched_at <= ($3::date + interval '1 day')`,
    [podIds, input.dateFrom, input.dateTo],
  );

  const metrics = {
    totalBudgetDistributed: Number(budgetRow?.total ?? 0),
    activePodCount: pods.filter((p) => p.status === 'active').length,
    podsPastTrial: pods.filter((p) => p.status === 'active').length,
    podsDiscontinued: pods.filter((p) => p.status === 'discontinued').length,
    aggregateFinancialTrend:
      trendRow && trendRow.avg_profit !== null ? Number(trendRow.avg_profit) : null,
    podCountInScope: pods.length,
  };

  const report = await createInvestorReport(db, {
    orgId: input.orgId,
    generatedBy: input.actorUserId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    scope,
    metrics,
  });

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'hub.investor_report_generated',
    entityType: 'investor_report',
    entityId: report.id,
    metadata: { podCountInScope: pods.length, dateFrom: input.dateFrom, dateTo: input.dateTo },
  });

  return { report, podCountInScope: pods.length };
}

export async function publishReport(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; reportId: UUID },
) {
  const report = await getReportOrThrow(context.db, input.reportId, input.orgId);
  const published = await publishInvestorReport(context.db, report.id);
  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.investor_report_published',
    entityType: 'investor_report',
    entityId: report.id,
    metadata: {},
  });
  return published;
}

export async function listReportsForOrg(
  db: Queryable,
  orgId: UUID,
  onlyPublished: boolean,
) {
  return listInvestorReports(db, orgId, onlyPublished);
}

async function getReportOrThrow(db: Queryable, reportId: UUID, orgId: UUID) {
  const rows = await listInvestorReports(db, orgId, false);
  const report = rows.find((r) => r.id === reportId);
  if (!report) throw notFound('Report not found');
  return report;
}

// ---------------------------------------------------------------------------
// External contact log (lightweight CRM)
// ---------------------------------------------------------------------------

export async function addContact(
  context: HubServiceContext,
  input: {
    orgId: UUID;
    actorUserId: UUID;
    name: string;
    relationshipType: 'investor' | 'partner' | 'media' | 'institution';
    lastInteractionAt?: ISODate | null;
    notes?: string | null;
  },
) {
  if (!input.name.trim()) throw badRequest('The contact needs a name');
  const contact = await createExternalContact(context.db, {
    orgId: input.orgId,
    name: input.name.trim(),
    relationshipType: input.relationshipType,
    lastInteractionAt: input.lastInteractionAt ?? null,
    notes: input.notes ?? null,
  });
  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.contact_added',
    entityType: 'external_contact',
    entityId: contact.id,
    metadata: { relationshipType: input.relationshipType },
  });
  return contact;
}

export async function logContactInteraction(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; contactId: UUID; notes?: string | null },
) {
  const updated = await updateExternalContact(context.db, input.contactId, {
    lastInteractionAt: context.today(),
    notes: input.notes ?? null,
  });
  if (!updated) throw notFound('Contact not found');
  return updated;
}

export { listExternalContacts };

// ---------------------------------------------------------------------------
// Pilot programs — 8 prep weeks + 90-day sprint + decision
// ---------------------------------------------------------------------------

export async function createPilot(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; name: string; holdingId?: UUID | null },
) {
  if (!input.name.trim()) throw badRequest('The pilot needs a name');
  const pilot = await createPilotProgram(context.db, {
    orgId: input.orgId,
    name: input.name.trim(),
    holdingId: input.holdingId ?? null,
  });
  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.pilot_created',
    entityType: 'pilot_program',
    entityId: pilot.id,
    metadata: { name: pilot.name },
  });
  return pilot;
}

export async function getPilotOrThrow(db: Queryable, orgId: UUID, pilotId: UUID) {
  const pilot = await getPilotProgram(db, pilotId);
  if (!pilot || pilot.orgId !== orgId) throw notFound('Pilot program not found');
  return pilot;
}

export async function updatePilotPhaseState(
  context: HubServiceContext,
  input: {
    orgId: UUID;
    actorUserId: UUID;
    pilotId: UUID;
    currentPhase?: PilotPhase;
    phase?: PilotPhase;
    state?: Partial<PilotPhaseState>;
  },
) {
  const pilot = await getPilotOrThrow(context.db, input.orgId, input.pilotId);
  if (pilot.decision) throw conflict('This pilot already has a recorded decision');

  let phaseStatus: Partial<Record<PilotPhase, PilotPhaseState>> | undefined;
  if (input.phase && input.state) {
    const prev = pilot.phaseStatus[input.phase] ?? { status: 'not_started', owner: null };
    phaseStatus = {
      [input.phase]: {
        status: input.state.status ?? prev.status,
        owner: input.state.owner !== undefined ? input.state.owner : prev.owner,
      },
    };
  }

  const updated = await updatePilotPhase(context.db, pilot.id, {
    currentPhase: input.currentPhase,
    phaseStatus,
  });
  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.pilot_phase_updated',
    entityType: 'pilot_program',
    entityId: pilot.id,
    metadata: { currentPhase: input.currentPhase ?? null, phase: input.phase ?? null },
  });
  return updated;
}

export async function updatePilotCriteria(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; pilotId: UUID; criteria: PilotSuccessCriteria },
) {
  const pilot = await getPilotOrThrow(context.db, input.orgId, input.pilotId);
  const updated = await updatePilotSuccessCriteria(context.db, pilot.id, input.criteria);
  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.pilot_criteria_updated',
    entityType: 'pilot_program',
    entityId: pilot.id,
    metadata: {},
  });
  return updated;
}

export interface RecordDecisionInput {
  orgId: UUID;
  actorUserId: UUID;
  pilotId: UUID;
  decision: PilotDecision;
  lessonsLearned?: string | null;
}

/**
 * The post-Day-90 decision. "expand" additionally requires the holding
 * executive's seat (checked in the route via `pilot.approve_expansion`) and
 * returns the prefill for the next unit's wizard.
 */
export async function recordDecision(context: HubServiceContext, input: RecordDecisionInput) {
  const pilot = await getPilotOrThrow(context.db, input.orgId, input.pilotId);
  if (pilot.decision) throw conflict('This pilot already has a recorded decision');
  if (input.decision === 'expand' && !pilot.pilotPodId) {
    throw conflict('A pilot can only expand once its unit has been launched');
  }

  const updated = await recordPilotDecision(context.db, pilot.id, {
    decision: input.decision,
    lessonsLearned: input.lessonsLearned ?? null,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'hub.pilot_decision_recorded',
    entityType: 'pilot_program',
    entityId: pilot.id,
    metadata: { decision: input.decision },
  });

  await context.bus.publish({
    type: 'hub.pilot_decision_recorded',
    aggregateType: 'pilot_program',
    aggregateId: pilot.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { decision: input.decision, name: pilot.name },
  });

  return updated;
}

export async function listPilotsForOrg(context: HubServiceContext, orgId: UUID) {
  return listPilotPrograms(context.db, orgId);
}

/** The wizard prefill an "expand" decision hands to the Deployment hub. */
export async function expansionPrefill(context: HubServiceContext, orgId: UUID, pilotId: UUID) {
  const pilot = await getPilotOrThrow(context.db, orgId, pilotId);
  if (pilot.decision !== 'expand') {
    throw conflict('Only an "expand" decision opens the next unit wizard');
  }
  const sourcePod = pilot.pilotPodId ? await getPod(context.db, pilot.pilotPodId) : null;
  return {
    pilotId: pilot.id,
    pilotName: pilot.name,
    holdingId: pilot.holdingId,
    suggestedName: sourcePod ? `${sourcePod.name} — next unit` : `${pilot.name} — next unit`,
    lessonsLearned: pilot.lessonsLearned,
  };
}

// ---------------------------------------------------------------------------
// Correction Records — the ONLY path that may alter a locked record (13 §7)
// ---------------------------------------------------------------------------

/**
 * Where a corrected field's current value is read from. The original value is
 * frozen from the database at proposal time — never accepted from the caller —
 * so a later upstream change can never rewrite what "was".
 */
const CORRECTABLE_FIELDS: Record<
  CorrectionEntityType,
  { table: string; fields: readonly string[] }
> = {
  financial_sync: { table: 'financial_sync_record', fields: ['revenue', 'costs', 'profit'] },
  budget_result: {
    table: 'pod_budget_result',
    fields: ['final_budget', 'unit_score', 'survival_budget'],
  },
  entry_trial: { table: 'entry_trial', fields: ['final_result'] },
  accountability_case: { table: 'accountability_case', fields: ['final_result', 'current_stage'] },
  peer_review_score: { table: 'peer_review', fields: ['score'] },
};

async function currentFieldValue(
  db: Queryable,
  entityType: CorrectionEntityType,
  entityId: UUID,
  field: string,
): Promise<unknown> {
  const spec = CORRECTABLE_FIELDS[entityType];
  if (!spec.fields.includes(field)) {
    throw badRequest(`Field "${field}" is not correctable on ${entityType}`);
  }
  // Column names come from the allowlist above, never from the request.
  const row = await queryOne<Record<string, unknown>>(
    db,
    `SELECT ${field} AS value FROM ${spec.table} WHERE id = $1`,
    [entityId],
  );
  if (!row) throw notFound('The record to correct was not found');
  return row.value ?? null;
}

export async function proposeCorrection(
  context: HubServiceContext,
  input: {
    orgId: UUID;
    actorUserId: UUID;
    entityType: CorrectionEntityType;
    entityId: UUID;
    fieldCorrected: string;
    correctedValue: unknown;
    reason: string;
  },
) {
  if (input.reason.trim().length < 10) {
    throw badRequest('A correction needs a real reason (at least 10 characters)');
  }
  const originalValue = await currentFieldValue(
    context.db,
    input.entityType,
    input.entityId,
    input.fieldCorrected,
  );

  const record = await createCorrectionRecord(context.db, {
    orgId: input.orgId,
    originalEntityType: input.entityType,
    originalEntityId: input.entityId,
    fieldCorrected: input.fieldCorrected,
    originalValue,
    correctedValue: input.correctedValue,
    reason: input.reason.trim(),
    proposedBy: input.actorUserId,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'correction.proposed',
    entityType: 'correction_record',
    entityId: record.id,
    metadata: {
      originalEntityType: input.entityType,
      originalEntityId: input.entityId,
      fieldCorrected: input.fieldCorrected,
    },
  });

  return record;
}

/**
 * The two-person rule: the approver must hold the Architecture Hub seat
 * (checked in the route guard) AND must not be the proposer. DB CHECK
 * (`approved_by <> proposed_by`) is the last line of defence.
 */
export async function approveCorrection(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; correctionId: UUID },
) {
  const record = await getCorrectionRecord(context.db, input.correctionId);
  if (!record || record.orgId !== input.orgId) throw notFound('Correction not found');
  if (record.status !== 'pending') throw conflict('This correction was already decided');
  if (record.proposedBy === input.actorUserId) {
    throw conflict('The two-person rule: a correction must be approved by a different architect');
  }

  const approved = await decideCorrectionRecord(context.db, record.id, {
    status: 'approved',
    decidedBy: input.actorUserId,
  });
  if (!approved) throw conflict('This correction was already decided');

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'correction.approved',
    entityType: 'correction_record',
    entityId: record.id,
    metadata: {
      originalEntityType: record.originalEntityType,
      originalEntityId: record.originalEntityId,
      fieldCorrected: record.fieldCorrected,
    },
  });

  await context.bus.publish({
    type: 'correction.approved',
    aggregateType: 'correction_record',
    aggregateId: record.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: {
      correctionId: record.id,
      originalEntityType: record.originalEntityType,
      originalEntityId: record.originalEntityId,
      fieldCorrected: record.fieldCorrected,
      reason: record.reason,
    },
  });

  return approved;
}

export async function rejectCorrection(
  context: HubServiceContext,
  input: { orgId: UUID; actorUserId: UUID; correctionId: UUID },
) {
  const record = await getCorrectionRecord(context.db, input.correctionId);
  if (!record || record.orgId !== input.orgId) throw notFound('Correction not found');
  if (record.status !== 'pending') throw conflict('This correction was already decided');
  if (record.proposedBy === input.actorUserId) {
    throw conflict('The two-person rule: a correction must be decided by a different architect');
  }

  const rejected = await decideCorrectionRecord(context.db, record.id, {
    status: 'rejected',
    decidedBy: input.actorUserId,
  });
  if (!rejected) throw conflict('This correction was already decided');

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'correction.rejected',
    entityType: 'correction_record',
    entityId: record.id,
    metadata: {},
  });

  return rejected;
}

export async function listCorrections(
  context: HubServiceContext,
  input: {
    orgId: UUID;
    entityType?: CorrectionEntityType;
    entityId?: UUID;
    status?: 'pending' | 'approved' | 'rejected';
  },
) {
  return listCorrectionRecords(context.db, input);
}

// Re-exports used by routes.
export { listRuleChanges, listHoldings };
export type { PilotProgram };
export { addDays };
export type { DomainEvent };
