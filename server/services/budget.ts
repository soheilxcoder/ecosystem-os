/**
 * Internal Budget Market service (Module 05).
 *
 * The arithmetic lives in `core/budget.ts` and is pure; this file is the layer
 * that gathers real inputs, hands them to it, and stores the result with its
 * provenance. Nothing here decides *how* a budget is computed — only *which*
 * numbers go in and *whether* the answer may be announced.
 *
 * Four rules are enforced here rather than left to the UI:
 *
 *  1. **A cycle snapshots its rules.** The weights and the cap fraction are read
 *     once, at calculation time, and stored on the cycle. A later rule change
 *     therefore cannot rewrite a cycle that has already been shown to people
 *     (06-MODULE-SPRINT-CALENDAR.md: changes apply from the next cycle onward).
 *
 *  2. **A missing input is reported, never guessed as zero.** `peerReviewScore`
 *     returns null when nobody has reviewed yet. Rather than scoring that pod
 *     zero — which would silently move its budget — the component falls back to
 *     the midpoint with its method recorded as missing, *and* the cycle becomes
 *     unlockable until the reviews arrive. The provisional screen can show an
 *     estimate; an announced number may not rest on one.
 *
 *  3. **Locking is gated on a checklist, not on a button being enabled.** 05
 *     forbids locking while peer reviews are unresolved, so the check runs in
 *     the service and refuses with the list of what is missing.
 *
 *  4. **The simulator never persists.** It re-runs the real allocation with one
 *     pod's scores replaced, and returns. There is no code path from it to a
 *     write.
 */

import type { Queryable } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type {
  BudgetComponentType,
  BudgetCycle,
  FinancialSyncRecord,
  PodBudgetResult,
  PodScoreComponent,
  UUID,
} from '../../core/types';
import {
  BUDGET_FORMULA_WEIGHTS,
  DEFAULT_CAP_FRACTION,
  NORMALIZATION_LABELS,
  allocateBudget,
  describeUnitScoreWith,
  normalizeFinancial,
  peerReviewScore,
  simulateAllocation,
  strategicScore,
  unitScoreWith,
  type BudgetComponentKey,
  type NormalizationMethod,
  type PodAllocation,
  type ScoreComponents,
} from '../../core/budget';
import {
  createBudgetCycle,
  financialFiguresForPeriod,
  getBudgetCycle,
  getBudgetCycleByNumber,
  getBudgetCycleForSprint,
  latestFinancialSyncs,
  listBudgetCycles,
  listBudgetResults,
  listBudgetResultsForPod,
  listGoalAlignments,
  listScoreComponents,
  lockBudgetCycle as lockBudgetCycleRow,
  replaceBudgetResults,
  sprintCyclePeriod,
  submittedReviewScoresByPod,
  unresolvedReviewCounts,
  updateBudgetCycleTotals,
  upsertScoreComponent,
  type BudgetResultInput,
} from '../../db/repositories/budget';
import { listPods } from '../../db/repositories/pods';
import { latestRuleValue } from '../../db/repositories/governance';
import { recordAudit } from '../../db/repositories/audit';
import { getCurrentPhaseForScope, type PhaseSnapshot } from './calendar';
import { badRequest, conflict, notFound } from '../errors';

export interface BudgetServiceContext {
  db: Queryable;
  bus: EventBus;
  today: () => ISODate;
}

/**
 * The midpoint a component falls back to when its input is missing.
 *
 * Deliberately the same choice `core/budget.ts` makes for an untagged strategic
 * score: a gap in the organisation's setup is not a performance result, and
 * scoring it zero would move a pod's budget for a reason nobody at that pod
 * could act on. Every fallback is recorded with its method and explanation, and
 * makes the cycle unlockable, so it can inform a provisional estimate but can
 * never be announced.
 */
const MISSING_INPUT_MIDPOINT = 50;

// ---------------------------------------------------------------------------
// Rule snapshots
// ---------------------------------------------------------------------------

/**
 * The weights in force for an organisation, resolved through the rule registry
 * so a versioned change to `budget.formula_weights` actually reaches the
 * arithmetic. Falls back to the constitutional 40/35/25.
 */
export async function effectiveFormulaWeights(
  db: Queryable,
  orgId: UUID,
): Promise<Record<BudgetComponentKey, number>> {
  const changed = (await latestRuleValue(db, orgId, 'budget.formula_weights')) as
    | Record<string, unknown>
    | null;

  if (!changed || typeof changed !== 'object') return { ...BUDGET_FORMULA_WEIGHTS };

  const weights: Record<BudgetComponentKey, number> = { ...BUDGET_FORMULA_WEIGHTS };
  for (const key of Object.keys(BUDGET_FORMULA_WEIGHTS) as BudgetComponentKey[]) {
    const value = Number(changed[key]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) weights[key] = value;
  }

  const total = weights.financial + weights.peer_review + weights.strategic;
  if (Math.abs(total - 100) > 1e-9) {
    // A rule change whose weights do not sum to 100 is rejected at proposal
    // time; reaching this branch means the stored value was corrupted. Falling
    // back silently would announce numbers under weights nobody approved.
    throw conflict(
      `The stored budget weights sum to ${total}, not 100 — refusing to calculate until the rule is corrected`,
      'invalid_weights',
    );
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export interface ComputeBudgetInput {
  orgId: UUID;
  /** The sprint cycle whose Day 89–90 window this budget belongs to. */
  cycleId: UUID;
  cycleNumber: number;
  /** Total allocatable budget for the period, in minor money units. */
  totalPool: number;
  capFraction?: number;
  /** Defaults to percentile rank, the method 05 documents inline. */
  financialNormalization?: NormalizationMethod;
  actorUserId?: UUID | null;
}

export interface ComputedComponent {
  componentType: BudgetComponentType;
  score: number;
  normalizationMethod: string;
  rawInputs: Record<string, unknown>;
  explanation: string;
  /** True when the score is a midpoint fallback rather than a real measurement. */
  estimated: boolean;
}

export interface ComputedPod {
  podId: UUID;
  podName: string;
  components: Record<BudgetComponentType, ComputedComponent>;
  unitScore: number;
  arithmeticLine: string;
  allocation: PodAllocation;
}

export interface ComputeBudgetResult {
  budgetCycle: BudgetCycle;
  pods: ComputedPod[];
  results: PodBudgetResult[];
  /** Total pool minus survival, capped, redistributed and unallocated amounts. */
  totals: {
    totalPool: number;
    reservedForSurvival: number;
    distributablePool: number;
    capAmount: number;
    totalCapped: number;
    totalRedistributed: number;
    unallocated: number;
    shortfall: number;
    survivalScaled: boolean;
  };
  /** Anything that would block a lock — surfaced on the provisional screen too. */
  blockers: LockBlocker[];
}

export type LockBlockerReason =
  | 'peer_reviews_unresolved'
  | 'peer_reviews_missing'
  | 'financial_sync_missing'
  | 'financial_sync_failed'
  | 'no_pods';

export interface LockBlocker {
  reason: LockBlockerReason;
  podId: UUID | null;
  podName: string | null;
  detail: string;
}

/**
 * Compute (or recompute) one cycle's allocation and store it with its inputs.
 *
 * Refuses to touch a locked cycle: the database would reject the write anyway,
 * but failing here gives a message that names the rule instead of a constraint.
 */
export async function computeBudget(
  context: BudgetServiceContext,
  input: ComputeBudgetInput,
): Promise<ComputeBudgetResult> {
  const { db, bus } = context;

  const existing = await getBudgetCycleForSprint(db, input.cycleId);
  if (existing?.status === 'locked') {
    throw conflict(
      `Cycle ${existing.cycleNumber} was locked on ${existing.lockedAt ?? 'an unknown date'}; ` +
        'a locked budget is immutable and can only change through a correction record',
      'cycle_locked',
    );
  }

  const weights = await effectiveFormulaWeights(db, input.orgId);
  const capFraction = input.capFraction ?? DEFAULT_CAP_FRACTION;
  const normalization = input.financialNormalization ?? 'percentile_rank';

  const budgetCycle = await createBudgetCycle(db, {
    orgId: input.orgId,
    cycleId: input.cycleId,
    cycleNumber: input.cycleNumber,
    totalPool: input.totalPool,
    formulaWeights: weights,
    capFraction,
  });
  if (!budgetCycle) throw notFound(`Could not create the budget cycle for sprint ${input.cycleId}`);

  const period = await sprintCyclePeriod(db, input.cycleId);
  // Dissolved pods are not allocated to: they no longer exist to spend it. A pod
  // in trial is, because the survival floor exists precisely so that a new unit
  // cannot be starved out before its 90 days are up.
  const allPods = (await listPods(db, input.orgId)).filter((pod) => pod.status !== 'dissolved');

  if (allPods.length === 0) {
    await updateBudgetCycleTotals(db, budgetCycle.id, {
      reservedForSurvival: 0,
      distributablePool: input.totalPool,
      capAmount: Math.floor(capFraction * input.totalPool),
      totalCapped: 0,
      totalRedistributed: 0,
      unallocated: input.totalPool,
      shortfall: 0,
      survivalScaled: false,
    });
    return {
      budgetCycle: (await getBudgetCycle(db, budgetCycle.id))!,
      pods: [],
      results: [],
      totals: {
        totalPool: input.totalPool,
        reservedForSurvival: 0,
        distributablePool: input.totalPool,
        capAmount: Math.floor(capFraction * input.totalPool),
        totalCapped: 0,
        totalRedistributed: 0,
        unallocated: input.totalPool,
        shortfall: 0,
        survivalScaled: false,
      },
      blockers: [
        {
          reason: 'no_pods',
          podId: null,
          podName: null,
          detail: 'There are no active pods to allocate to',
        },
      ],
    };
  }

  const podIds = allPods.map((pod) => pod.id);
  const podById = new Map(allPods.map((pod) => [pod.id, pod]));

  // --- the three inputs, gathered in parallel --------------------------------
  const [financialRows, reviewRows, alignmentRows, syncRows] = await Promise.all([
    period
      ? financialFiguresForPeriod(db, podIds, period.start, period.end)
      : Promise.resolve([] as FinancialSyncRecord[]),
    submittedReviewScoresByPod(db, input.cycleId),
    listGoalAlignments(db, input.cycleId, podIds),
    latestFinancialSyncs(db, podIds),
  ]);

  const financialByPod = new Map(financialRows.map((row) => [row.podId, row]));
  const reviewsByPod = new Map(reviewRows.map((row) => [row.podId, row]));
  const syncByPod = new Map(syncRows.map((row) => [row.podId, row]));
  const alignmentsByPod = new Map<UUID, typeof alignmentRows>();
  for (const row of alignmentRows) {
    alignmentsByPod.set(row.podId, [...(alignmentsByPod.get(row.podId) ?? []), row]);
  }

  // Financial normalization is cohort-relative, so every pod's raw figure has to
  // be known before any pod's score can be computed.
  const rawProfits = allPods.map((pod) => financialByPod.get(pod.id)?.profit ?? 0);
  const normalizedFinancial = normalizeFinancial(rawProfits, normalization);

  const blockers: LockBlocker[] = [];
  const componentsByPod = new Map<UUID, Record<BudgetComponentType, ComputedComponent>>();

  for (let index = 0; index < allPods.length; index += 1) {
    const pod = allPods[index]!;
    const financialRow = financialByPod.get(pod.id);
    const sync = syncByPod.get(pod.id);

    // -- Financial (40%) --
    const financialScore = normalizedFinancial[index] ?? MISSING_INPUT_MIDPOINT;
    const financialMissing = !financialRow;
    const financial: ComputedComponent = {
      componentType: 'financial',
      score: financialMissing ? MISSING_INPUT_MIDPOINT : financialScore,
      normalizationMethod: financialMissing ? 'missing_input_midpoint' : normalization,
      rawInputs: financialRow
        ? {
            revenue: financialRow.revenue,
            costs: financialRow.costs,
            profit: financialRow.profit,
            currency: financialRow.currency,
            sourceSystem: financialRow.sourceSystem,
            periodStart: financialRow.periodStart,
            periodEnd: financialRow.periodEnd,
            fetchedAt: financialRow.fetchedAt,
            cohortSize: allPods.length,
          }
        : { cohortSize: allPods.length, sourceSystem: sync?.sourceSystem ?? null },
      explanation: financialMissing
        ? `No financial figures for this period — shown at the midpoint ${MISSING_INPUT_MIDPOINT}/100 until the connector syncs`
        : `${NORMALIZATION_LABELS[normalization]} — profit ${formatMoney(financialRow.profit ?? 0)} ${financialRow.currency}`,
      estimated: financialMissing,
    };

    if (financialMissing) {
      if (sync && sync.status !== 'ok') {
        blockers.push({
          reason: 'financial_sync_failed',
          podId: pod.id,
          podName: pod.name,
          detail:
            sync.error ??
            `The ${sync.sourceSystem} sync failed for ${pod.name}; the financial score is an estimate`,
        });
      } else {
        blockers.push({
          reason: 'financial_sync_missing',
          podId: pod.id,
          podName: pod.name,
          detail: `${pod.name} has no financial figures for this period`,
        });
      }
    }

    // -- Peer review (35%) --
    const review = reviewsByPod.get(pod.id);
    const reviewScore = review ? peerReviewScore(review.scores) : null;
    const reviewerCount = review?.reviewerCount ?? 0;
    const peerReview: ComputedComponent = {
      componentType: 'peer_review',
      score: reviewScore ?? MISSING_INPUT_MIDPOINT,
      normalizationMethod: reviewScore === null ? 'missing_input_midpoint' : 'peer_average',
      rawInputs: review
        ? { reviewerScores: review.scores, reviewerCount }
        : { reviewerScores: [], reviewerCount: 0 },
      explanation:
        reviewScore === null
          ? `No submitted peer reviews yet — shown at the midpoint ${MISSING_INPUT_MIDPOINT}/100`
          : `${reviewScore}/100 — average of ${reviewerCount} submitted reviewer score${
              reviewerCount === 1 ? '' : 's'
            }`,
      estimated: reviewScore === null,
    };

    if (reviewScore === null) {
      blockers.push({
        reason: 'peer_reviews_missing',
        podId: pod.id,
        podName: pod.name,
        detail: `${pod.name} has no submitted peer reviews this cycle`,
      });
    }

    // -- Strategic (25%) --
    const alignments = alignmentsByPod.get(pod.id) ?? [];
    const strategicValue = strategicScore(
      alignments.map((row) => ({
        goalId: row.goalId,
        goalLabel: row.goalId,
        score: row.score,
        weight: row.weight,
      })),
    );
    const strategic: ComputedComponent = {
      componentType: 'strategic',
      score: strategicValue,
      normalizationMethod: alignments.length === 0 ? 'untagged_midpoint' : 'rubric',
      rawInputs: {
        goals: alignments.map((row) => ({
          goalId: row.goalId,
          score: row.score,
          weight: row.weight,
          scoredBy: row.scoredBy,
          rationale: row.rationale,
        })),
        goalCount: alignments.length,
      },
      explanation:
        alignments.length === 0
          ? `Not tagged against any strategic goal this cycle — midpoint ${strategicValue}/100, so an org-setup gap does not cost this pod its budget`
          : `${strategicValue}/100 — weighted rubric across ${alignments.length} goal${
              alignments.length === 1 ? '' : 's'
            }`,
      estimated: alignments.length === 0,
    };

    componentsByPod.set(pod.id, { financial, peer_review: peerReview, strategic });
  }

  // Unresolved reviews are a blocker even where some scores already exist: 05
  // allows locking only once the automated calculation has run with none left.
  for (const pending of await unresolvedReviewCounts(db, input.cycleId)) {
    blockers.push({
      reason: 'peer_reviews_unresolved',
      podId: pending.podId,
      podName: podById.get(pending.podId)?.name ?? null,
      detail: `${pending.pending} assigned peer review${pending.pending === 1 ? '' : 's'} not yet submitted`,
    });
  }

  // --- store the components, then allocate -----------------------------------
  for (const pod of allPods) {
    const components = componentsByPod.get(pod.id)!;
    for (const component of Object.values(components)) {
      await upsertScoreComponent(db, {
        budgetCycleId: budgetCycle.id,
        cycleId: input.cycleId,
        podId: pod.id,
        componentType: component.componentType,
        rawInputs: component.rawInputs,
        normalizationMethod: component.normalizationMethod,
        score: component.score,
        explanation: component.explanation,
      });
    }
  }

  const scoreInputs = allPods.map((pod) => {
    const components = componentsByPod.get(pod.id)!;
    const scoreComponents: ScoreComponents = {
      financial: components.financial.score,
      peer_review: components.peer_review.score,
      strategic: components.strategic.score,
    };
    return {
      pod,
      scoreComponents,
      unitScore: unitScoreWith(scoreComponents, weights),
      arithmeticLine: describeUnitScoreWith(scoreComponents, weights),
      monthlyFixedCosts: pod.monthlyFixedCosts,
    };
  });

  const allocation = allocateBudget({
    pods: scoreInputs.map((entry) => ({
      podId: entry.pod.id,
      unitScore: entry.unitScore,
      monthlyFixedCosts: entry.monthlyFixedCosts,
    })),
    totalPool: input.totalPool,
    capFraction,
  });

  const allocationByPod = new Map(allocation.allocations.map((entry) => [entry.podId, entry]));

  const resultInputs: BudgetResultInput[] = scoreInputs.map((entry) => {
    const allocated = allocationByPod.get(entry.pod.id)!;
    return {
      podId: entry.pod.id,
      unitScore: entry.unitScore,
      monthlyFixedCosts: entry.monthlyFixedCosts,
      survivalBudget: allocated.survivalBudget,
      survivalBudgetApplied: allocated.survivalBudget > 0,
      rawBudgetShare: money(allocated.rawShare),
      formulaShare: allocated.formulaShare,
      capApplied: allocated.capApplied,
      capReduction: allocated.capReduction,
      redistributedAmount: allocated.redistributedIn,
      finalBudget: allocated.finalBudget,
      shareOfPoolPercent: allocated.shareOfPoolPercent,
    };
  });

  const results = await replaceBudgetResults(db, {
    budgetCycleId: budgetCycle.id,
    cycleId: input.cycleId,
    results: resultInputs,
  });

  // Every total is rounded to whole money units before it is stored or
  // reported. The column is numeric(18,2), but the value also travels through
  // JSON and back into arithmetic on screen, where 90000000.00000006 versus
  // 90000000 is the difference between an allocation that visibly sums to the
  // pool and one that does not.
  const totals = {
    totalPool: allocation.totalPool,
    reservedForSurvival: money(allocation.reservedForSurvival),
    distributablePool: money(allocation.distributablePool),
    capAmount: allocation.capAmount,
    totalCapped: money(allocation.totalCapped),
    totalRedistributed: money(allocation.totalRedistributed),
    unallocated: money(allocation.unallocated),
    shortfall: money(allocation.shortfall),
    survivalScaled: allocation.survivalScaled,
  };

  await updateBudgetCycleTotals(db, budgetCycle.id, totals);

  const pods: ComputedPod[] = scoreInputs.map((entry) => ({
    podId: entry.pod.id,
    podName: entry.pod.name,
    components: componentsByPod.get(entry.pod.id)!,
    unitScore: entry.unitScore,
    arithmeticLine: entry.arithmeticLine,
    allocation: allocationByPod.get(entry.pod.id)!,
  }));

  await recordAudit(db, {
    actorUserId: input.actorUserId ?? null,
    action: 'budget.computed',
    entityType: 'budget_cycle',
    entityId: budgetCycle.id,
    metadata: {
      cycleNumber: input.cycleNumber,
      totalPool: input.totalPool,
      weights,
      capFraction,
      podCount: pods.length,
      unallocated: totals.unallocated,
      blockerCount: blockers.length,
    },
  });

  await bus.publish({
    type: 'budget.computed',
    aggregateType: 'budget_cycle',
    aggregateId: budgetCycle.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    payload: {
      cycleNumber: input.cycleNumber,
      podCount: pods.length,
      status: 'provisional',
      blockerCount: blockers.length,
    },
  });

  const refreshed = await getBudgetCycle(db, budgetCycle.id);

  return {
    budgetCycle: refreshed ?? budgetCycle,
    pods,
    results,
    totals,
    blockers,
  };
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

export interface LockChecklist {
  cycleNumber: number;
  status: BudgetCycle['status'];
  /** Which cycle day the lock belongs to, from the shared calendar service. */
  cycleDay: number | null;
  phaseKey: string | null;
  /** True only inside the Day 89–90 announcement window. */
  inLockWindow: boolean;
  calculated: boolean;
  blockers: LockBlocker[];
  canLock: boolean;
}

/**
 * What stands between this cycle and a lock. The screen renders this list
 * verbatim, so "the button is disabled" is never the only explanation given.
 */
export async function lockChecklist(
  context: BudgetServiceContext,
  budgetCycleId: UUID,
): Promise<LockChecklist> {
  const { db, today } = context;
  const budgetCycle = await getBudgetCycle(db, budgetCycleId);
  if (!budgetCycle) throw notFound(`Budget cycle ${budgetCycleId} not found`);

  const phase = await getCurrentPhaseForScope(db, { orgId: budgetCycle.orgId }, today());
  const components = await listScoreComponents(db, budgetCycleId);

  const blockers: LockBlocker[] = [];

  if (!phase) {
    blockers.push({
      reason: 'no_pods',
      podId: null,
      podName: null,
      detail: 'There is no active sprint cycle, so the Day 89–90 lock window cannot be resolved',
    });
  }

  // Two different things can block a lock, and 05 names both:
  //
  //   - a component that fell back to the midpoint because its input was missing
  //     (the calculation ran, but on an estimate);
  //   - a peer review that is assigned and still unsubmitted (the calculation
  //     would change if it arrived).
  //
  // The second is not implied by the first: a pod can have one submitted review
  // — enough to produce a real average — while another assigned reviewer has not
  // answered. Locking then would announce a number that an outstanding review was
  // about to move.
  const estimated = components.filter((component) =>
    ['missing_input_midpoint', 'untagged_midpoint'].includes(component.normalizationMethod),
  );
  for (const component of estimated) {
    const reason: LockBlockerReason =
      component.componentType === 'peer_review' ? 'peer_reviews_missing' : 'financial_sync_missing';
    blockers.push({
      reason,
      podId: component.podId,
      podName: null,
      detail: `The ${component.componentType.replace('_', ' ')} score is a midpoint estimate: ${component.explanation ?? 'no input recorded'}`,
    });
  }

  const [pods, unresolved] = await Promise.all([
    listPods(db, budgetCycle.orgId),
    unresolvedReviewCounts(db, budgetCycle.cycleId),
  ]);
  const podNames = new Map(pods.map((pod) => [pod.id, pod.name]));
  for (const pending of unresolved) {
    blockers.push({
      reason: 'peer_reviews_unresolved',
      podId: pending.podId,
      podName: podNames.get(pending.podId) ?? null,
      detail: `${pending.pending} assigned peer review${pending.pending === 1 ? '' : 's'} not yet submitted`,
    });
  }

  return {
    cycleNumber: budgetCycle.cycleNumber,
    status: budgetCycle.status,
    cycleDay: phase?.day ?? null,
    phaseKey: phase?.phase?.key ?? null,
    // Day 89-90 is the `results` phase in the shared calendar; the day check is
    // the fallback for a cycle whose boundaries were reconfigured.
    inLockWindow: phase?.phase?.key === 'results' || (phase?.day ?? 0) >= 89,
    calculated: budgetCycle.calculatedAt !== null,
    blockers,
    canLock: budgetCycle.status === 'provisional' && budgetCycle.calculatedAt !== null && blockers.length === 0,
  };
}

/**
 * Lock the cycle: numbers become immutable and an audit reference is issued.
 *
 * Refuses when the calculation has not run, when any input is still an estimate,
 * or when the cycle is already locked. The window itself is reported to the
 * caller rather than silently enforced, because 05 ties the lock to Day 89–90
 * but the Architecture Hub must still be able to lock a late cycle explicitly —
 * the refusal that matters is the one about *unresolved inputs*.
 */
export async function lockCycle(
  context: BudgetServiceContext,
  input: { budgetCycleId: UUID; actorUserId: UUID; force?: boolean },
): Promise<{ budgetCycle: BudgetCycle; checklist: LockChecklist }> {
  const { db, bus } = context;
  const checklist = await lockChecklist(context, input.budgetCycleId);

  if (checklist.status === 'locked') {
    throw conflict(
      `Cycle ${checklist.cycleNumber} is already locked`,
      'cycle_locked',
    );
  }
  if (!checklist.calculated) {
    throw conflict(
      'The automated calculation has not run for this cycle yet — there is nothing to lock',
      'not_calculated',
    );
  }

  const blocking = checklist.blockers.filter((blocker) => blocker.reason !== 'no_pods');
  if (blocking.length > 0 && !input.force) {
    throw conflict(
      `Cannot lock cycle ${checklist.cycleNumber}: ${blocking.length} input${
        blocking.length === 1 ? '' : 's'
      } unresolved — ${blocking.map((blocker) => blocker.detail).join('; ')}`,
      'blockers_unresolved',
    );
  }

  const budgetCycle = await getBudgetCycle(db, input.budgetCycleId);
  if (!budgetCycle) throw notFound(`Budget cycle ${input.budgetCycleId} not found`);

  // The audit reference is derived from what is being locked, so it changes if
  // the stored numbers ever do — a matching hash is evidence the announcement
  // is the same one that was computed.
  const results = await listBudgetResults(db, input.budgetCycleId);
  const auditHash = await computeAuditHash(budgetCycle, results);

  const locked = await lockBudgetCycleRow(db, input.budgetCycleId, {
    lockedBy: input.actorUserId,
    auditHash,
  });
  if (!locked) throw notFound(`Budget cycle ${input.budgetCycleId} disappeared while locking`);

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'budget.cycle_locked',
    entityType: 'budget_cycle',
    entityId: input.budgetCycleId,
    metadata: {
      cycleNumber: budgetCycle.cycleNumber,
      auditHash,
      forced: Boolean(input.force),
      overriddenBlockers: input.force ? blocking.map((blocker) => blocker.detail) : [],
    },
  });

  await bus.publish({
    type: 'budget.cycle_locked',
    aggregateType: 'budget_cycle',
    aggregateId: input.budgetCycleId,
    orgId: budgetCycle.orgId,
    actorUserId: input.actorUserId,
    payload: {
      cycleNumber: budgetCycle.cycleNumber,
      auditHash,
      podCount: results.length,
      forced: Boolean(input.force),
    },
  });

  return { budgetCycle: locked, checklist };
}

/**
 * A stable digest over the announced numbers.
 *
 * Uses SHA-256 over a canonical string built from the sorted pod ids and their
 * stored figures, so re-hashing the same rows always yields the same reference
 * and a single changed digit yields a different one.
 */
async function computeAuditHash(
  budgetCycle: BudgetCycle,
  results: PodBudgetResult[],
): Promise<string> {
  const canonical = [
    `cycle:${budgetCycle.cycleNumber}`,
    `pool:${budgetCycle.totalPool}`,
    `weights:${JSON.stringify(budgetCycle.formulaWeights)}`,
    `cap:${budgetCycle.capFraction}`,
    ...[...results]
      .sort((a, b) => (a.podId < b.podId ? -1 : 1))
      .map(
        (result) =>
          `${result.podId}|${result.unitScore}|${result.survivalBudget}|${result.formulaShare}|${result.finalBudget}`,
      ),
  ].join('\n');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  // Shown on screen, so the first 16 hex characters are the usable reference.
  return `ECO-BUD-${hex.slice(0, 16).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface BreakdownComponent extends PodScoreComponent {
  weight: number;
  weightedContribution: number;
  label: string;
}

export interface PodBreakdown {
  budgetCycle: BudgetCycle;
  podId: UUID;
  podName: string;
  components: BreakdownComponent[];
  unitScore: number;
  arithmeticLine: string;
  result: PodBudgetResult;
  /** Every adjustment between the raw share and the final number, in order. */
  adjustmentLines: Array<{ label: string; amount: number; note: string }>;
  previousCycle: { cycleNumber: number; finalBudget: number; unitScore: number } | null;
  delta: number | null;
  deltaPercent: number | null;
  /** The connector banner's data: null when a healthy sync exists for the period. */
  financialWarning: { sourceSystem: string; detail: string; fetchedAt: string | null } | null;
}

/**
 * The full calculation for one pod — 05's "show the formula taken to its
 * fullest". Every figure returned here came out of the database with the inputs
 * that produced it, so the screen never has to re-derive anything.
 */
export async function getPodBreakdown(
  context: BudgetServiceContext,
  input: { podId: UUID; budgetCycleId?: UUID | null; cycleNumber?: number | null },
): Promise<PodBreakdown> {
  const { db } = context;

  const budgetCycle = await resolveBudgetCycle(db, input);
  const results = await listBudgetResults(db, budgetCycle.id);
  const result = results.find((entry) => entry.podId === input.podId);
  if (!result) {
    throw notFound(
      `Pod ${input.podId} has no budget result in cycle ${budgetCycle.cycleNumber}. ` +
        'It may have been dissolved, or the calculation may not have run yet.',
    );
  }

  const pods = await listPods(db, budgetCycle.orgId);
  const pod = pods.find((entry) => entry.id === input.podId);

  const weights = budgetCycle.formulaWeights as Record<BudgetComponentKey, number>;
  const components = await listScoreComponents(db, budgetCycle.id, input.podId);

  const breakdownComponents: BreakdownComponent[] = (
    ['financial', 'peer_review', 'strategic'] as BudgetComponentKey[]
  ).map((key) => {
    const stored = components.find((component) => component.componentType === key);
    const weight = weights[key] ?? BUDGET_FORMULA_WEIGHTS[key];
    const score = stored?.score ?? 0;
    return {
      id: stored?.id ?? '',
      budgetCycleId: budgetCycle.id,
      cycleId: budgetCycle.cycleId,
      podId: input.podId,
      componentType: key,
      rawInputs: stored?.rawInputs ?? {},
      normalizationMethod: stored?.normalizationMethod ?? 'not_calculated',
      score,
      explanation: stored?.explanation ?? null,
      calculatedAt: stored?.calculatedAt ?? '',
      weight,
      weightedContribution: Math.round(((weight / 100) * score) * 100) / 100,
      label: COMPONENT_LABELS[key],
    };
  });

  const scoreComponents: ScoreComponents = {
    financial: breakdownComponents[0]!.score,
    peer_review: breakdownComponents[1]!.score,
    strategic: breakdownComponents[2]!.score,
  };

  // Adjustments are listed in the order the formula applied them, so the screen
  // can render them as lines rather than folding them into one number.
  const adjustmentLines: PodBreakdown['adjustmentLines'] = [
    {
      label: 'Survival Budget (floor)',
      amount: result.survivalBudget,
      note: `One month of fixed costs (${formatMoney(result.monthlyFixedCosts)}), reserved before the formula ran`,
    },
    {
      label: 'Proportional share',
      amount: Math.round(result.rawBudgetShare * 100) / 100,
      note: `Unit Score ${result.unitScore} ÷ Σ all Unit Scores × distributable pool`,
    },
  ];
  if (result.capApplied) {
    adjustmentLines.push({
      label: 'Cap applied',
      amount: -result.capReduction,
      note: `Clipped to ${Math.round(budgetCycle.capFraction * 100)}% of the period's allocatable budget`,
    });
  }
  if (result.redistributedAmount > 0) {
    adjustmentLines.push({
      label: 'Redistributed in',
      amount: result.redistributedAmount,
      note: 'Received from the excess clipped off pods above the ceiling',
    });
  }
  if (budgetCycle.unallocated && budgetCycle.unallocated > 0) {
    adjustmentLines.push({
      label: 'Unallocated (org-wide)',
      amount: 0,
      note:
        `${formatMoney(budgetCycle.unallocated)} of the pool could not be distributed: ` +
        'every pod already sits at the ceiling, so there is nobody under it to receive the excess',
    });
  }

  const history = await listBudgetResultsForPod(db, input.podId, 24);
  const previous = history.find((entry) => entry.cycleNumber === budgetCycle.cycleNumber - 1);

  const sync = (await latestFinancialSyncs(db, [input.podId]))[0];
  const financialComponent = breakdownComponents[0]!;
  const financialWarning =
    financialComponent.normalizationMethod === 'missing_input_midpoint' ||
    (sync && sync.status !== 'ok')
      ? {
          sourceSystem: sync?.sourceSystem ?? 'the connected accounting system',
          detail:
            sync?.status === 'failed'
              ? `Sync failed${sync.error ? `: ${sync.error}` : ''} — the financial score is an estimate, not current data`
              : 'No financial figures for this period — the financial score is a midpoint estimate',
          fetchedAt: sync?.fetchedAt ?? null,
        }
      : null;

  const delta = previous ? result.finalBudget - previous.finalBudget : null;

  return {
    budgetCycle,
    podId: input.podId,
    podName: pod?.name ?? 'Unknown pod',
    components: breakdownComponents,
    unitScore: result.unitScore,
    arithmeticLine: describeUnitScoreWith(scoreComponents, weights),
    result,
    adjustmentLines,
    previousCycle: previous
      ? {
          cycleNumber: previous.cycleNumber,
          finalBudget: previous.finalBudget,
          unitScore: previous.unitScore,
        }
      : null,
    delta,
    deltaPercent:
      delta !== null && previous && previous.finalBudget > 0
        ? Math.round((delta / previous.finalBudget) * 10000) / 100
        : null,
    financialWarning,
  };
}

const COMPONENT_LABELS: Record<BudgetComponentKey, string> = {
  financial: 'Financial performance',
  peer_review: 'Peer review',
  strategic: 'Strategic alignment',
};

/** Resolve which budget cycle a read is about, from an id, a number, or "current". */
async function resolveBudgetCycle(
  db: Queryable,
  input: { podId: UUID; budgetCycleId?: UUID | null; cycleNumber?: number | null; orgId?: UUID | null },
): Promise<BudgetCycle> {
  if (input.budgetCycleId) {
    const found = await getBudgetCycle(db, input.budgetCycleId);
    if (!found) throw notFound(`Budget cycle ${input.budgetCycleId} not found`);
    return found;
  }

  const orgId = input.orgId ?? (await orgIdForPod(db, input.podId));
  if (input.cycleNumber) {
    const found = await getBudgetCycleByNumber(db, orgId, input.cycleNumber);
    if (!found) throw notFound(`No budget cycle numbered ${input.cycleNumber}`);
    return found;
  }

  const [latest] = await listBudgetCycles(db, orgId, 1);
  if (!latest) {
    throw notFound(
      'No budget cycle has been calculated yet. The Architecture Hub sets the pool and runs the calculation.',
    );
  }
  return latest;
}

/**
 * The organisation a pod belongs to, resolved through its holding.
 *
 * `listPods` needs an org id to start from, so a pod-scoped read that does not
 * already know its org has to resolve it here — one join, and it keeps a pod id
 * from another organisation from being answered at all.
 */
async function orgIdForPod(db: Queryable, podId: UUID): Promise<UUID> {
  const { rows } = await db.query<{ org_id: UUID }>(
    `SELECT h.org_id FROM pod p JOIN holding h ON h.id = p.holding_id WHERE p.id = $1`,
    [podId],
  );
  const orgId = rows[0]?.org_id;
  if (!orgId) throw notFound(`Pod ${podId} not found`);
  return orgId;
}

export interface CycleOverview {
  budgetCycle: BudgetCycle;
  phase: PhaseSnapshot | null;
  results: Array<PodBudgetResult & { podName: string; holdingName: string | null }>;
  components: PodScoreComponent[];
  checklist: LockChecklist;
}

/** Everything `/budget/current-cycle` renders, in one read. */
export async function getCurrentCycleOverview(
  context: BudgetServiceContext,
  input: { orgId: UUID; holdingId?: UUID | null },
): Promise<CycleOverview | null> {
  const { db, today } = context;

  const cycles = await listBudgetCycles(db, input.orgId, 1);
  const budgetCycle = cycles[0];
  if (!budgetCycle) return null;

  const [phase, results, components, checklist] = await Promise.all([
    getCurrentPhaseForScope(db, { orgId: input.orgId, holdingId: input.holdingId ?? null }, today()),
    listBudgetResults(db, budgetCycle.id),
    listScoreComponents(db, budgetCycle.id),
    lockChecklist(context, budgetCycle.id),
  ]);

  const { rows } = await db.query<{ id: UUID; name: string; holding_name: string | null }>(
    `SELECT p.id, p.name, h.name AS holding_name
       FROM pod p JOIN holding h ON h.id = p.holding_id
      WHERE h.org_id = $1`,
    [input.orgId],
  );
  const names = new Map(rows.map((row) => [row.id, row]));

  return {
    budgetCycle,
    phase,
    results: results.map((result) => ({
      ...result,
      podName: names.get(result.podId)?.name ?? 'Unknown pod',
      holdingName: names.get(result.podId)?.holding_name ?? null,
    })),
    components,
    checklist,
  };
}

export interface HistoryRow {
  cycleNumber: number;
  status: BudgetCycle['status'];
  totalPool: number;
  unitScore: number | null;
  finalBudget: number | null;
  components: Partial<Record<BudgetComponentKey, number>>;
  lockedAt: string | null;
}

/** `/budget/history` for one pod, newest first, with its component sub-scores. */
export async function getPodHistory(
  context: BudgetServiceContext,
  podId: UUID,
  limit = 24,
): Promise<HistoryRow[]> {
  const { db } = context;
  const results = await listBudgetResultsForPod(db, podId, limit);
  if (results.length === 0) return [];

  const cycles = await listBudgetCycles(db, await orgIdForPod(db, podId), limit);
  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));

  return results.map((result) => {
    const cycle = cycleById.get(result.budgetCycleId);
    return {
      cycleNumber: result.cycleNumber,
      status: result.status,
      totalPool: cycle?.totalPool ?? 0,
      unitScore: result.unitScore,
      finalBudget: result.finalBudget,
      components: {},
      lockedAt: cycle?.lockedAt ?? null,
    };
  });
}

/** Fill in the three component sub-scores for a set of history rows. */
export async function withComponentHistory(
  context: BudgetServiceContext,
  podId: UUID,
  rows: HistoryRow[],
): Promise<HistoryRow[]> {
  const { db } = context;
  const cycles = await listBudgetCycles(db, await orgIdForPod(db, podId), rows.length || 1);
  const byNumber = new Map(cycles.map((cycle) => [cycle.cycleNumber, cycle]));

  const filled = await Promise.all(
    rows.map(async (row) => {
      const cycle = byNumber.get(row.cycleNumber);
      if (!cycle) return row;
      const components = await listScoreComponents(db, cycle.id, podId);
      const map: Partial<Record<BudgetComponentKey, number>> = {};
      for (const component of components) {
        map[component.componentType as BudgetComponentKey] = component.score;
      }
      return { ...row, components: map };
    }),
  );
  return filled;
}

// ---------------------------------------------------------------------------
// Simulator — stateless by construction
// ---------------------------------------------------------------------------

export interface SimulateInput {
  orgId: UUID;
  targetPodId: UUID;
  components: ScoreComponents;
  /** Override the pool; defaults to the current cycle's. */
  totalPool?: number;
}

export interface SimulateOutput {
  simulatedUnitScore: number;
  arithmeticLine: string;
  current: PodAllocation;
  simulated: PodAllocation;
  delta: number;
  deltaPercent: number;
  assumption: string;
  disclaimer: string;
  totalPool: number;
  podCount: number;
}

/**
 * "What if our peer review score were ten points higher?"
 *
 * Re-runs the real allocation with one pod's scores replaced and every other
 * pod's real scores as the denominator. There is no write anywhere in this
 * function — that is the whole guarantee the disclaimer banner makes.
 */
export async function simulate(
  context: BudgetServiceContext,
  input: SimulateInput,
): Promise<SimulateOutput> {
  const { db } = context;

  const [cycles, pods] = await Promise.all([
    listBudgetCycles(db, input.orgId, 1),
    listPods(db, input.orgId),
  ]);
  const budgetCycle = cycles[0];
  if (!budgetCycle) {
    throw notFound('No budget cycle has been calculated yet, so there is nothing to simulate against');
  }

  const live = await listBudgetResults(db, budgetCycle.id);
  const byPod = new Map(live.map((result) => [result.podId, result]));
  const participating = pods.filter((pod) => pod.status !== 'dissolved' && byPod.has(pod.id));

  if (!participating.some((pod) => pod.id === input.targetPodId)) {
    throw badRequest(
      'That pod is not part of the current allocation, so its budget cannot be simulated',
      'pod_not_in_cycle',
    );
  }

  const totalPool = input.totalPool ?? budgetCycle.totalPool;

  const result = simulateAllocation({
    pods: participating.map((pod) => ({
      podId: pod.id,
      unitScore: byPod.get(pod.id)!.unitScore,
      monthlyFixedCosts: pod.monthlyFixedCosts,
    })),
    targetPodId: input.targetPodId,
    components: input.components,
    totalPool,
    capFraction: budgetCycle.capFraction,
  });

  if (!result) {
    throw badRequest(
      'Each component score must be a number between 0 and 100',
      'invalid_component_scores',
    );
  }

  return {
    ...result,
    disclaimer:
      'This is a planning tool only. It does not submit anything and has no effect on real scores or budgets.',
    totalPool,
    podCount: participating.length,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Round a money amount to whole units.
 *
 * The proportional share is computed in floating point, so a figure that should
 * be exactly 90,000,000 can arrive as 90,000,000.00000006. Storing that is
 * harmless in a numeric(18,2) column but not in the JSON a screen adds up.
 */
function money(amount: number): number {
  return Math.round(amount);
}

/** Whole money units, grouped — the shape every budget figure is shown in. */
export function formatMoney(amount: number): string {
  return money(amount).toLocaleString('en-US');
}
