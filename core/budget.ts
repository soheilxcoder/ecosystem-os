/**
 * Module 05 — Internal Budget Market: the formula itself.
 *
 * This file is the single source of truth for how a pod's budget is computed.
 * It is deliberately pure: no database, no I/O, no clock. Everything the UI
 * shows (the "show the formula" strip, the adjustment lines, the simulator)
 * is a rendering of what happens here, so a number can always be traced back
 * to this arithmetic.
 *
 * Source of truth: 15-BUSINESS-RULES-APPENDIX.md — "the appendix wins" over
 * any module doc, and the worked example in it is asserted verbatim in
 * tests/unit/budget.test.ts.
 *
 *   Unit Score = 0.40 × Financial + 0.35 × Peer Review + 0.25 × Strategic
 *   Unit Budget = (Unit Score ÷ Σ Unit Scores) × Distributable Pool
 *
 * with two hard constraints, both shown explicitly and never absorbed
 * silently into the final number:
 *   - FLOOR  every pod first receives a Survival Budget = one month of its
 *            fixed costs, reserved from the pool *before* the formula runs.
 *   - CAP    no pod may end up with more than 30% of the period's total
 *            allocatable budget; the excess is redistributed proportionally
 *            among the pods that are still under the ceiling, iterating while
 *            new pods cross it as a result.
 */

// ---------------------------------------------------------------------------
// The 40/35/25 weighting
// ---------------------------------------------------------------------------

export type BudgetComponentKey = 'financial' | 'peer_review' | 'strategic';

/**
 * The constitutional split, in whole percentages. The registry in
 * `core/governance.ts` exposes this same object so the rule panel, the budget
 * screen and the formula can never drift apart.
 */
export const BUDGET_FORMULA_WEIGHTS: Record<BudgetComponentKey, number> = {
  financial: 40,
  peer_review: 35,
  strategic: 25,
};

/** The same weights as fractions, which is what the arithmetic uses. */
export const BUDGET_WEIGHTS: Record<BudgetComponentKey, number> = {
  financial: BUDGET_FORMULA_WEIGHTS.financial / 100,
  peer_review: BUDGET_FORMULA_WEIGHTS.peer_review / 100,
  strategic: BUDGET_FORMULA_WEIGHTS.strategic / 100,
};

/** No unit may receive more than this share of one period's total pool. */
export const DEFAULT_CAP_FRACTION = 0.3;

export const BUDGET_COMPONENT_LABELS: Record<BudgetComponentKey, string> = {
  financial: 'Financial performance',
  peer_review: 'Peer review',
  strategic: 'Strategic alignment',
};

/** The three component scores of one pod for one cycle, each 0–100. */
export interface ScoreComponents {
  financial: number;
  peer_review: number;
  strategic: number;
}

export function isScoreComponentKey(value: string): value is BudgetComponentKey {
  return value === 'financial' || value === 'peer_review' || value === 'strategic';
}

/** Each component must be a real number inside the 0–100 band. */
export function assertComponents(components: ScoreComponents): { ok: true } | { ok: false; message: string } {
  for (const key of Object.keys(BUDGET_FORMULA_WEIGHTS) as BudgetComponentKey[]) {
    const value = components[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, message: `The ${BUDGET_COMPONENT_LABELS[key].toLowerCase()} score is missing` };
    }
    if (value < 0 || value > 100) {
      return {
        ok: false,
        message: `The ${BUDGET_COMPONENT_LABELS[key].toLowerCase()} score must be between 0 and 100 (got ${value})`,
      };
    }
  }
  return { ok: true };
}

/**
 * The Unit Score: a weighted sum of the three components, rounded to two
 * decimals so the arithmetic strip on screen reads exactly like the appendix
 * (`(0.40 × 78) + (0.35 × 82) + (0.25 × 65) = 76.15`).
 */
export function unitScore(components: ScoreComponents): number {
  const raw =
    BUDGET_WEIGHTS.financial * components.financial +
    BUDGET_WEIGHTS.peer_review * components.peer_review +
    BUDGET_WEIGHTS.strategic * components.strategic;
  return Math.round(raw * 100) / 100;
}

/** The visible arithmetic line, e.g. `(0.40 × 78) + (0.35 × 82) + (0.25 × 65) = 76.15`. */
export function describeUnitScore(components: ScoreComponents): string {
  const parts = (['financial', 'peer_review', 'strategic'] as BudgetComponentKey[]).map(
    (key) => `(${BUDGET_WEIGHTS[key].toFixed(2)} × ${round2(components[key])})`,
  );
  return `${parts.join(' + ')} = ${round2(unitScore(components))}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Component scores: how each raw input becomes a 0–100 number
// ---------------------------------------------------------------------------

/**
 * Normalisation methods for the financial component. The method is stored
 * alongside every computed score, because a number without its method is
 * exactly the kind of unexplainable figure this module exists to eliminate.
 */
export type NormalizationMethod = 'percentile_rank' | 'min_max' | 'target';

export const NORMALIZATION_LABELS: Record<NormalizationMethod, string> = {
  percentile_rank: 'Percentile rank among all pods this cycle',
  min_max: 'Min–max scaled across all pods this cycle',
  target: 'Achievement against the pod’s own target',
};

/**
 * Percentile rank: how far up this cycle's cohort the pod sits, on a 0–100
 * scale — the weakest pod scores 0 and the strongest 100, which is what a
 * budget screen has to mean by "percentile rank". A cohort that is completely
 * flat, or a single pod with nobody to compare against, sits at the midpoint
 * rather than being flattered with 100.
 */
export function percentileRankScore(value: number, peers: number[]): number {
  if (peers.length <= 1) return 50;
  const min = Math.min(...peers);
  const max = Math.max(...peers);
  if (max === min) return 50;
  const below = peers.filter((peer) => peer < value).length;
  return Math.round((below / (peers.length - 1)) * 100 * 100) / 100;
}

/** Min–max scaling across the cycle's pods; a flat cohort maps to the midpoint. */
export function minMaxScore(value: number, peers: number[]): number {
  if (peers.length === 0) return 50;
  const min = Math.min(...peers);
  const max = Math.max(...peers);
  if (max === min) return 50;
  return Math.round(((value - min) / (max - min)) * 100 * 100) / 100;
}

/** Achievement against the pod's own target, clamped to 0–100. */
export function targetScore(value: number, target: number): number {
  if (target <= 0) return 50;
  return Math.round(Math.max(0, Math.min(100, (value / target) * 100)) * 100) / 100;
}

/** Turns the raw financial figure of every pod into 0–100 scores. */
export function normalizeFinancial(
  values: number[],
  method: NormalizationMethod,
  targets?: number[],
): number[] {
  return values.map((value, index) => {
    if (method === 'target') return targetScore(value, targets?.[index] ?? 0);
    if (method === 'min_max') return minMaxScore(value, values);
    return percentileRankScore(value, values);
  });
}

/**
 * The peer review component: the average of the individual reviewer scores.
 * Reviewer identities and comments stay visible in the UI (Module 08), so this
 * is only the arithmetic. Returns `null` when nobody has reviewed yet — a pod
 * with no reviews must not be quietly scored as zero.
 */
export function peerReviewScore(scores: number[]): number | null {
  const usable = scores.filter((score) => Number.isFinite(score));
  if (usable.length === 0) return null;
  const sum = usable.reduce((total, score) => total + score, 0);
  return Math.round((sum / usable.length) * 100) / 100;
}

/** One goal a pod was tagged against this cycle, and how well it aligns. */
export interface StrategicAlignment {
  goalId: string;
  goalLabel: string;
  /** 0–100, from the Strategic Interactions Hub rubric. */
  score: number;
  /** Rubric scores are weighted when a pod is tagged against several goals. */
  weight?: number;
}

/**
 * The strategic component: the weighted average of the goal alignments the
 * pod was tagged against. A pod tagged against nothing scores the midpoint
 * rather than zero — being untagged is an org-setup gap, not a performance
 * result, and it must not cost a pod its budget.
 */
export function strategicScore(alignments: StrategicAlignment[]): number {
  const usable = alignments.filter((entry) => Number.isFinite(entry.score));
  if (usable.length === 0) return 50;
  const totalWeight = usable.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  if (totalWeight <= 0) return 50;
  const weighted = usable.reduce((sum, entry) => sum + entry.score * (entry.weight ?? 1), 0);
  return Math.round((weighted / totalWeight) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Allocation: survival floor, proportional share, 30% cap, redistribution
// ---------------------------------------------------------------------------

export interface PodAllocationInput {
  podId: string;
  /** Unit Score for the cycle, already computed by `unitScore()`. */
  unitScore: number;
  /** One month of the pod's fixed costs — the Survival Budget floor. */
  monthlyFixedCosts: number;
}

export interface PodAllocation {
  podId: string;
  unitScore: number;
  /** Reserved before the formula ran. */
  survivalBudget: number;
  /** This pod's share if the cap had not applied. */
  rawShare: number;
  /** What the pod actually receives from the formula, after capping. */
  formulaShare: number;
  capApplied: boolean;
  /** How much the 30% ceiling clipped off this pod. */
  capReduction: number;
  /** How much this pod gained from other pods' clipped excess. */
  redistributedIn: number;
  /** survivalBudget + formulaShare. */
  finalBudget: number;
  /** Share of the total pool, as a percentage — what the bar chart draws. */
  shareOfPoolPercent: number;
}

export interface AllocationResult {
  totalPool: number;
  capFraction: number;
  /** The hard ceiling per pod, in money units. */
  capAmount: number;
  /** Survival budgets reserved before the formula ran. */
  reservedForSurvival: number;
  /** What is left for the proportional formula. */
  distributablePool: number;
  allocations: PodAllocation[];
  /** Total clipped by the ceiling — shown explicitly, never absorbed. */
  totalCapped: number;
  /** Total handed to other pods from that clipped excess. */
  totalRedistributed: number;
  /**
   * Pool nobody can receive because every pod already sits at the ceiling
   * (with fewer than four pods the caps sum to less than the whole pool).
   * Reported, never spent silently.
   */
  unallocated: number;
  /** Positive when the pool cannot even cover the survival budgets. */
  shortfall: number;
  /**
   * True when the survival budgets had to be scaled down because the pool was
   * too small — a state everyone must be able to see.
   */
  survivalScaled: boolean;
}

export interface AllocateInput {
  pods: PodAllocationInput[];
  /** Total allocatable budget for the period, in minor money units. */
  totalPool: number;
  capFraction?: number;
}

/** Split `total` across `values` in proportion to each value. */
function proportional(values: number[], total: number): number[] {
  const sum = values.reduce((acc, value) => acc + Math.max(0, value), 0);
  if (values.length === 0) return [];
  if (sum <= 0) {
    // No score signal at all: split evenly rather than leaving the pool
    // unallocated. Every pod keeps its survival budget either way.
    const equal = total / values.length;
    return values.map(() => equal);
  }
  return values.map((value) => (Math.max(0, value) / sum) * total);
}

/**
 * Round a set of float amounts to whole money units that add up to exactly
 * `target`, using largest-remainder so the distribution stays deterministic
 * and no unit is invented or lost. `ceilings` keeps a rounded amount from
 * creeping above a pod's cap.
 */
function roundToTotal(values: number[], target: number, ceilings: number[]): number[] {
  const floors = values.map((value) => Math.floor(value));
  let remaining = target - floors.reduce((acc, value) => acc + value, 0);
  const result = [...floors];
  if (remaining > 0) {
    const order = values
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    let progressed = true;
    while (remaining > 0 && progressed) {
      progressed = false;
      for (const { index } of order) {
        if (remaining <= 0) break;
        const current = result[index] ?? 0;
        const ceiling = ceilings[index] ?? Number.POSITIVE_INFINITY;
        if (current + 1 <= ceiling) {
          result[index] = current + 1;
          remaining -= 1;
          progressed = true;
        }
      }
    }
  }
  return result;
}

/**
 * Allocate one period's pool across the pods.
 *
 * Order of operations, matching 05-MODULE-BUDGET-MARKET.md §"Business logic":
 *   1. reserve every pod's Survival Budget from the pool;
 *   2. distribute what remains in proportion to Unit Score;
 *   3. apply the 30% ceiling, redistributing each clipped excess
 *      proportionally among the pods still under it, and repeat while new
 *      pods cross the ceiling as a result (it can iterate).
 *
 * Every step that changes a number is recorded on the pod so the breakdown
 * screen can show it as its own line instead of folding it into the total.
 */
export function allocateBudget(input: AllocateInput): AllocationResult {
  const capFraction = input.capFraction ?? DEFAULT_CAP_FRACTION;
  const totalPool = Math.max(0, Math.round(input.totalPool));
  const pods = input.pods;
  const capAmount = Math.floor(capFraction * totalPool);

  if (pods.length === 0) {
    return {
      totalPool,
      capFraction,
      capAmount,
      reservedForSurvival: 0,
      distributablePool: totalPool,
      allocations: [],
      totalCapped: 0,
      totalRedistributed: 0,
      unallocated: totalPool,
      shortfall: 0,
      survivalScaled: false,
    };
  }

  // 1. Survival budgets, reserved before anything else is computed.
  const survival = pods.map((pod) => Math.max(0, Math.round(pod.monthlyFixedCosts)));
  const reserved = survival.reduce((acc, value) => acc + value, 0);

  // The pool cannot cover the floor: scale the floors down proportionally and
  // say so, rather than paying some pods in full and others nothing.
  if (reserved > totalPool) {
    const scaled = roundToTotal(
      survival.map((value) => (reserved > 0 ? (value / reserved) * totalPool : 0)),
      totalPool,
      survival.map(() => Number.POSITIVE_INFINITY),
    );
    return {
      totalPool,
      capFraction,
      capAmount,
      reservedForSurvival: totalPool,
      distributablePool: 0,
      allocations: pods.map((pod, index) => {
        const floor = scaled[index] ?? 0;
        return {
          podId: pod.podId,
          unitScore: pod.unitScore,
          survivalBudget: floor,
          rawShare: 0,
          formulaShare: 0,
          capApplied: false,
          capReduction: 0,
          redistributedIn: 0,
          finalBudget: floor,
          shareOfPoolPercent: totalPool > 0 ? round2((floor / totalPool) * 100) : 0,
        };
      }),
      totalCapped: 0,
      totalRedistributed: 0,
      unallocated: 0,
      shortfall: reserved - totalPool,
      survivalScaled: true,
    };
  }

  const distributable = totalPool - reserved;
  const scores = pods.map((pod) => Math.max(0, pod.unitScore));

  // 2. The untouched proportional result — kept so the UI can show what the
  //    formula wanted before the ceiling intervened.
  const rawShares = proportional(scores, distributable);
  const shares = [...rawShares];
  const capped = new Set<string>();
  let unallocated = 0;

  // 3. Cap and redistribute, iterating while the redistribution pushes another
  //    pod over the ceiling. Each pass caps at least one new pod, so this
  //    terminates after at most `pods.length` passes; the guard makes that
  //    explicit instead of relying on the invariant holding by accident.
  for (let pass = 0; pass <= pods.length; pass += 1) {
    const offenders = pods
      .map((pod, index) => ({
        pod,
        index,
        survival: survival[index] ?? 0,
        share: shares[index] ?? 0,
      }))
      .filter((candidate) => !capped.has(candidate.pod.podId) && candidate.survival + candidate.share > capAmount);
    if (offenders.length === 0) break;

    let excess = 0;
    for (const candidate of offenders) {
      const allowed = Math.max(0, capAmount - candidate.survival);
      excess += candidate.share - allowed;
      shares[candidate.index] = allowed;
      capped.add(candidate.pod.podId);
    }

    const freeIndexes = pods
      .map((pod, index) => ({ pod, index }))
      .filter(({ pod }) => !capped.has(pod.podId))
      .map(({ index }) => index);
    if (freeIndexes.length === 0) {
      unallocated = excess;
      break;
    }

    // Redistribute what is still to be handed out (the free pods' current
    // shares plus the clipped excess) across the free pods by score.
    const pool = freeIndexes.reduce((acc, index) => acc + (shares[index] ?? 0), 0) + excess;
    const parts = proportional(
      freeIndexes.map((index) => scores[index] ?? 0),
      pool,
    );
    freeIndexes.forEach((index, position) => {
      shares[index] = parts[position] ?? 0;
    });
    unallocated = 0;
  }

  // Round to whole money units without inventing or losing a single unit.
  // `shareTarget` is what the formula is allowed to hand out: the
  // distributable pool minus whatever nobody can legally receive because every
  // pod already sits at the ceiling.
  const shareTarget = distributable - unallocated;
  const ceilings = pods.map((_, index) => Math.max(0, capAmount - (survival[index] ?? 0)));
  const roundedShares = roundToTotal(shares, shareTarget, ceilings);
  const roundingLeftover = shareTarget - roundedShares.reduce((acc, value) => acc + value, 0);
  const unallocatedTotal = Math.max(0, unallocated + roundingLeftover);

  const allocations: PodAllocation[] = pods.map((pod, index) => {
    const floor = survival[index] ?? 0;
    const rawShare = rawShares[index] ?? 0;
    const formulaShare = Math.max(0, roundedShares[index] ?? 0);
    const finalBudget = floor + formulaShare;
    const capApplied = capped.has(pod.podId);
    return {
      podId: pod.podId,
      unitScore: pod.unitScore,
      survivalBudget: floor,
      rawShare: Math.round(rawShare * 100) / 100,
      formulaShare,
      capApplied,
      capReduction: capApplied ? Math.max(0, Math.round((rawShare - formulaShare) * 100) / 100) : 0,
      redistributedIn: !capApplied
        ? Math.max(0, Math.round((formulaShare - rawShare) * 100) / 100)
        : 0,
      finalBudget,
      shareOfPoolPercent: totalPool > 0 ? round2((finalBudget / totalPool) * 100) : 0,
    };
  });

  return {
    totalPool,
    capFraction,
    capAmount,
    reservedForSurvival: reserved,
    distributablePool: distributable,
    allocations,
    totalCapped: Math.round(allocations.reduce((acc, pod) => acc + pod.capReduction, 0) * 100) / 100,
    totalRedistributed:
      Math.round(allocations.reduce((acc, pod) => acc + pod.redistributedIn, 0) * 100) / 100,
    unallocated: unallocatedTotal,
    shortfall: 0,
    survivalScaled: false,
  };
}

// ---------------------------------------------------------------------------
// Simulator: "what if" arithmetic, never persisted
// ---------------------------------------------------------------------------

export interface SimulationInput {
  pods: PodAllocationInput[];
  targetPodId: string;
  /** Hypothetical component scores for the target pod. */
  components: ScoreComponents;
  totalPool: number;
  capFraction?: number;
}

export interface SimulationResult {
  simulatedUnitScore: number;
  arithmeticLine: string;
  current: PodAllocation;
  simulated: PodAllocation;
  /** Difference in budget between today's scores and the hypothetical ones. */
  delta: number;
  /** Percentage difference against the current budget. */
  deltaPercent: number;
  /** The assumption the simulator makes explicit on screen. */
  assumption: string;
}

/**
 * The `/budget/simulator` arithmetic. It re-runs the real allocation with one
 * pod's scores replaced, so a pod lead can answer "what if we gained ten
 * points on peer review?" — using every other pod's real numbers as the
 * denominator. Nothing here reads or writes stored data.
 */
export function simulateAllocation(input: SimulationInput): SimulationResult | null {
  const check = assertComponents(input.components);
  if (!check.ok) return null;

  const baseline = allocateBudget({ pods: input.pods, totalPool: input.totalPool, capFraction: input.capFraction });
  const simulatedScore = unitScore(input.components);
  const simulatedPods = input.pods.map((pod) =>
    pod.podId === input.targetPodId ? { ...pod, unitScore: simulatedScore } : pod,
  );
  const simulated = allocateBudget({ pods: simulatedPods, totalPool: input.totalPool, capFraction: input.capFraction });

  const current = baseline.allocations.find((pod) => pod.podId === input.targetPodId);
  const next = simulated.allocations.find((pod) => pod.podId === input.targetPodId);
  if (!current || !next) return null;

  const delta = next.finalBudget - current.finalBudget;
  return {
    simulatedUnitScore: simulatedScore,
    arithmeticLine: describeUnitScore(input.components),
    current,
    simulated: next,
    delta,
    deltaPercent: current.finalBudget > 0 ? round2((delta / current.finalBudget) * 100) : 0,
    assumption: 'Assuming every other pod’s score stays exactly as it is today',
  };
}
