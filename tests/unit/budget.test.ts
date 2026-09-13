import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BUDGET_FORMULA_WEIGHTS,
  DEFAULT_CAP_FRACTION,
  allocateBudget,
  assertComponents,
  describeUnitScore,
  minMaxScore,
  normalizeFinancial,
  peerReviewScore,
  percentileRankScore,
  simulateAllocation,
  strategicScore,
  targetScore,
  unitScore,
  type PodAllocationInput,
} from '../../core/budget';

// ---------------------------------------------------------------------------
// The worked example from 15-BUSINESS-RULES-APPENDIX.md
// ---------------------------------------------------------------------------

const APPENDIX_PODS = [
  { name: 'A', financial: 78, peer_review: 82, strategic: 65, unitScore: 76.15 },
  { name: 'B', financial: 60, peer_review: 70, strategic: 90, unitScore: 71.0 },
  { name: 'C', financial: 90, peer_review: 55, strategic: 40, unitScore: 65.25 },
];

describe('the 40/35/25 weighting', () => {
  it('is the constitutional split', () => {
    expect(BUDGET_FORMULA_WEIGHTS).toEqual({ financial: 40, peer_review: 35, strategic: 25 });
    expect(Object.values(BUDGET_FORMULA_WEIGHTS).reduce((sum, part) => sum + part, 0)).toBe(100);
  });

  it('reproduces every Unit Score in the appendix worked example', () => {
    for (const pod of APPENDIX_PODS) {
      expect(unitScore(pod)).toBe(pod.unitScore);
    }
  });

  it('can be printed as the arithmetic line the breakdown screen shows', () => {
    const [podA] = APPENDIX_PODS;
    expect(describeUnitScore(podA!)).toBe('(0.40 × 78) + (0.35 × 82) + (0.25 × 65) = 76.15');
  });

  it('refuses a component score outside 0–100', () => {
    expect(assertComponents({ financial: 78, peer_review: 82, strategic: 65 })).toEqual({ ok: true });
    expect(assertComponents({ financial: 178, peer_review: 82, strategic: 65 })).toMatchObject({ ok: false });
    expect(assertComponents({ financial: 78, peer_review: -1, strategic: 65 })).toMatchObject({ ok: false });
    expect(
      assertComponents({ financial: Number.NaN, peer_review: 82, strategic: 65 }),
    ).toMatchObject({ ok: false });
  });
});

describe('component scores', () => {
  it('averages the individual reviewer scores', () => {
    expect(peerReviewScore([80, 90, 70])).toBe(80);
    expect(peerReviewScore([82.5, 81.5])).toBe(82);
  });

  it('reports no peer review score rather than scoring an unreviewed pod as zero', () => {
    expect(peerReviewScore([])).toBeNull();
  });

  it('weights the strategic goals a pod was tagged against', () => {
    expect(
      strategicScore([
        { goalId: 'g1', goalLabel: 'Reach the pilot target', score: 80, weight: 2 },
        { goalId: 'g2', goalLabel: 'Document the handover', score: 50, weight: 1 },
      ]),
    ).toBe(70);
  });

  it('does not punish a pod the org forgot to tag against a goal', () => {
    expect(strategicScore([])).toBe(50);
  });

  it('normalizes financial figures with the method it will display', () => {
    const values = [100, 200, 300];
    expect(percentileRankScore(300, values)).toBe(100);
    expect(percentileRankScore(200, values)).toBe(50);
    expect(minMaxScore(200, values)).toBe(50);
    expect(targetScore(80, 100)).toBe(80);
    expect(targetScore(150, 100)).toBe(100);

    expect(normalizeFinancial(values, 'percentile_rank')).toEqual([0, 50, 100]);
    // A flat cohort has no rank to speak of and sits at the midpoint.
    expect(normalizeFinancial([200, 200, 200], 'percentile_rank')).toEqual([50, 50, 50]);
    expect(normalizeFinancial(values, 'min_max')).toEqual([0, 50, 100]);
    expect(normalizeFinancial([80, 120], 'target', [100, 100])).toEqual([80, 100]);
  });
});

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

function pods(scores: number[], fixedCosts = 0): PodAllocationInput[] {
  return scores.map((score, index) => ({
    podId: `pod-${index + 1}`,
    unitScore: score,
    monthlyFixedCosts: fixedCosts,
  }));
}

describe('allocation: the proportional case', () => {
  // Five pods with close scores, so the 30% ceiling stays out of the way and
  // the plain "score ÷ Σ scores" arithmetic is what is being asserted.
  const EVEN_SCORES = [25, 25, 20, 15, 15];

  it('splits the pool by Unit Score', () => {
    const result = allocateBudget({ pods: pods(EVEN_SCORES), totalPool: 1_000_000 });
    expect(result.allocations.map((pod) => pod.finalBudget)).toEqual([
      250_000, 250_000, 200_000, 150_000, 150_000,
    ]);
    expect(result.unallocated).toBe(0);
    expect(result.allocations.every((pod) => !pod.capApplied)).toBe(true);
  });

  it('reserves the survival budget before the formula runs', () => {
    const result = allocateBudget({
      pods: pods(EVEN_SCORES, 100_000),
      totalPool: 1_000_000,
    });
    expect(result.reservedForSurvival).toBe(500_000);
    expect(result.distributablePool).toBe(500_000);
    // 500k split by score, plus the 100k floor each.
    expect(result.allocations.map((pod) => pod.finalBudget)).toEqual([
      225_000, 225_000, 200_000, 175_000, 175_000,
    ]);
    expect(result.allocations.every((pod) => pod.finalBudget >= pod.survivalBudget)).toBe(true);
  });

  it('still pays the floor to a pod that scored nothing', () => {
    const result = allocateBudget({
      pods: [
        { podId: 'strong', unitScore: 90, monthlyFixedCosts: 100_000 },
        { podId: 'empty', unitScore: 0, monthlyFixedCosts: 100_000 },
      ],
      totalPool: 500_000,
    });
    const empty = result.allocations.find((pod) => pod.podId === 'empty');
    expect(empty?.finalBudget).toBeGreaterThanOrEqual(100_000);
    expect(result.allocations.every((pod) => pod.finalBudget >= pod.survivalBudget)).toBe(true);
  });

  it('says so when the pool cannot even cover the survival budgets', () => {
    const result = allocateBudget({ pods: pods([80, 20], 60_000), totalPool: 100_000 });
    expect(result.shortfall).toBe(20_000);
    expect(result.survivalScaled).toBe(true);
    expect(result.allocations.map((pod) => pod.finalBudget)).toEqual([50_000, 50_000]);
    expect(result.distributablePool).toBe(0);
  });

  it('splits evenly when no pod has a score signal', () => {
    const result = allocateBudget({ pods: pods([0, 0, 0, 0, 0]), totalPool: 1_000_000 });
    expect(result.allocations.map((pod) => pod.finalBudget)).toEqual([
      200_000, 200_000, 200_000, 200_000, 200_000,
    ]);
  });
});

describe('allocation: the 30% ceiling', () => {
  it('clips a pod over the ceiling and redistributes the excess by score', () => {
    const result = allocateBudget({ pods: pods([90, 10, 10, 10, 10]), totalPool: 1_000_000 });
    const [top, ...rest] = result.allocations;

    expect(result.capAmount).toBe(300_000);
    expect(top!.capApplied).toBe(true);
    expect(top!.finalBudget).toBe(300_000);
    expect(top!.capReduction).toBeGreaterThan(0);
    // 900k was its raw share; 600k of excess was shared out equally.
    expect(rest.every((pod) => pod.redistributedIn > 0)).toBe(true);
    expect(rest.every((pod) => pod.finalBudget === 175_000)).toBe(true);
    // Nothing is lost: the whole pool is still handed out.
    expect(result.allocations.reduce((sum, pod) => sum + pod.finalBudget, 0)).toBe(1_000_000);
    expect(result.unallocated).toBe(0);
  });

  it('iterates when the redistribution pushes another pod over the ceiling', () => {
    // Two pods, wildly unequal: after the top is clipped, the second one also
    // crosses 30% and has to be clipped in turn.
    const result = allocateBudget({ pods: pods([90, 10]), totalPool: 1_000_000 });
    expect(result.allocations.map((pod) => pod.capApplied)).toEqual([true, true]);
    expect(result.allocations.map((pod) => pod.finalBudget)).toEqual([300_000, 300_000]);
    expect(result.unallocated).toBe(400_000);
  });

  it('reproduces the appendix worked example, cap path and all', () => {
    const result = allocateBudget({
      pods: APPENDIX_PODS.map((pod) => ({
        podId: pod.name,
        unitScore: pod.unitScore,
        monthlyFixedCosts: 0,
      })),
      totalPool: 900_000_000,
    });

    // What the formula wanted before the ceiling intervened — the appendix
    // prints these rounded to three significant figures.
    const raw = Object.fromEntries(result.allocations.map((pod) => [pod.podId, pod.rawShare]));
    expect(raw.A).toBeGreaterThan(322_600_000);
    expect(raw.A).toBeLessThan(322_700_000);
    expect(raw.B).toBeGreaterThan(300_800_000);
    expect(raw.B).toBeLessThan(300_900_000);
    expect(raw.C).toBeGreaterThan(276_400_000);
    expect(raw.C).toBeLessThan(276_500_000);

    // All three exceed 30% of the pool, so all three sit at the ceiling and
    // the 10% nobody can legally receive is reported instead of spent.
    expect(result.capAmount).toBe(270_000_000);
    for (const pod of result.allocations) {
      expect(pod.capApplied).toBe(true);
      expect(pod.finalBudget).toBe(270_000_000);
    }
    expect(result.unallocated).toBe(90_000_000);
    expect(result.totalCapped).toBeGreaterThan(0);
  });

  it('never lets the ceiling cut into the survival budget', () => {
    // Each pod's floor alone is 400k — already above the 300k ceiling. The
    // floor is guaranteed, so the ceiling can only bind on top of it.
    const result = allocateBudget({
      pods: pods([100, 1], 400_000),
      totalPool: 1_000_000,
    });
    expect(result.capAmount).toBe(300_000);
    for (const pod of result.allocations) {
      expect(pod.finalBudget).toBeGreaterThanOrEqual(pod.survivalBudget);
      expect(pod.finalBudget).toBeGreaterThanOrEqual(400_000);
    }
    expect(result.reservedForSurvival).toBe(800_000);
  });
});

describe('allocation: invariants', () => {
  it('always accounts for the whole pool, to the unit', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            unitScore: fc.integer({ min: 0, max: 100 }),
            monthlyFixedCosts: fc.integer({ min: 0, max: 200_000 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        fc.integer({ min: 1_000_000, max: 5_000_000_000 }),
        (raw, totalPool) => {
          const result = allocateBudget({
            pods: raw.map((pod, index) => ({ podId: `p${index}`, ...pod })),
            totalPool,
          });
          const distributed = result.allocations.reduce((sum, pod) => sum + pod.finalBudget, 0);
          const survivorsScaled = result.survivalScaled;
          if (!survivorsScaled) {
            expect(distributed + result.unallocated).toBe(totalPool);
          }
          expect(result.unallocated).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never lets anyone above the ceiling, and never anyone below their floor', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            unitScore: fc.integer({ min: 0, max: 100 }),
            monthlyFixedCosts: fc.integer({ min: 0, max: 100_000 }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        fc.integer({ min: 10_000_000, max: 2_000_000_000 }),
        (raw, totalPool) => {
          const result = allocateBudget({
            pods: raw.map((pod, index) => ({ podId: `p${index}`, ...pod })),
            totalPool,
          });
          for (const pod of result.allocations) {
            // The ceiling binds, except where the guaranteed survival floor is
            // already above it — the floor is paid first and cannot be cut.
            expect(pod.finalBudget).toBeLessThanOrEqual(
              Math.max(result.capAmount, pod.survivalBudget),
            );
            expect(pod.finalBudget).toBeGreaterThanOrEqual(pod.survivalBudget);
            expect(Number.isInteger(pod.finalBudget)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is monotone: a better score never means less money', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 1, max: 60 }),
        (scores, index, gain) => {
          const target = index % scores.length;
          const podsInput = pods(scores);
          const before = allocateBudget({ pods: podsInput, totalPool: 10_000_000 });
          const improved = podsInput.map((pod, position) =>
            position === target
              ? { ...pod, unitScore: Math.min(100, pod.unitScore + gain) }
              : pod,
          );
          const after = allocateBudget({ pods: improved, totalPool: 10_000_000 });
          expect(after.allocations[target]!.finalBudget).toBeGreaterThanOrEqual(
            before.allocations[target]!.finalBudget,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is deterministic — the same inputs give the same money', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1_000_000, max: 900_000_000 }),
        (scores, totalPool) => {
          const input = { pods: pods(scores), totalPool };
          expect(allocateBudget(input)).toEqual(allocateBudget(input));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('keeps the ceiling configurable only through the recorded rule', () => {
    const podsInput = pods([90, 10, 10]);
    const strict = allocateBudget({ pods: podsInput, totalPool: 1_000_000, capFraction: 0.2 });
    expect(strict.capAmount).toBe(200_000);
    expect(allocateBudget({ pods: podsInput, totalPool: 1_000_000 }).capAmount).toBe(
      Math.floor(DEFAULT_CAP_FRACTION * 1_000_000),
    );
  });
});

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

describe('simulator', () => {
  const podsInput = pods([40, 35, 30, 25, 20]);

  it('answers "what if" against everyone else’s real scores', () => {
    const result = simulateAllocation({
      pods: podsInput,
      targetPodId: 'pod-1',
      components: { financial: 45, peer_review: 45, strategic: 45 },
      totalPool: 1_000_000,
    });

    expect(result?.simulatedUnitScore).toBe(45);
    expect(result?.arithmeticLine).toBe('(0.40 × 45) + (0.35 × 45) + (0.25 × 45) = 45');
    expect(result?.delta).toBeGreaterThan(0);
    expect(result?.assumption).toMatch(/assuming every other pod/i);
    // The estimate is built from the same allocator, not a parallel formula.
    expect(result?.current.finalBudget).toBe(
      allocateBudget({ pods: podsInput, totalPool: 1_000_000 }).allocations[0]!.finalBudget,
    );
  });

  it('shows the ceiling in the simulation too — a perfect score is still capped', () => {
    const result = simulateAllocation({
      pods: podsInput,
      targetPodId: 'pod-1',
      components: { financial: 100, peer_review: 100, strategic: 100 },
      totalPool: 1_000_000,
    });
    expect(result?.simulatedUnitScore).toBe(100);
    expect(result?.simulated.capApplied).toBe(true);
    expect(result?.simulated.finalBudget).toBe(300_000);
  });

  it('stays inside the ceiling a real allocation would respect', () => {
    const result = simulateAllocation({
      pods: pods([10, 10]),
      targetPodId: 'pod-1',
      components: { financial: 100, peer_review: 100, strategic: 100 },
      totalPool: 1_000_000,
    });
    expect(result?.simulated.finalBudget).toBeLessThanOrEqual(300_000);
  });

  it('refuses hypothetical scores that could not exist', () => {
    expect(
      simulateAllocation({
        pods: podsInput,
        targetPodId: 'pod-1',
        components: { financial: 140, peer_review: 90, strategic: 90 },
        totalPool: 1_000_000,
      }),
    ).toBeNull();
  });

  it('never writes anything — it is pure arithmetic over the inputs', () => {
    const before = JSON.stringify(podsInput);
    simulateAllocation({
      pods: podsInput,
      targetPodId: 'pod-1',
      components: { financial: 10, peer_review: 10, strategic: 10 },
      totalPool: 1_000_000,
    });
    expect(JSON.stringify(podsInput)).toBe(before);
  });
});
