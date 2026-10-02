/**
 * `/budget/current-cycle` — 05-MODULE-BUDGET-MARKET.md, screen 1.
 *
 * The highest-stakes screen in the product: it replaces a manager's former
 * discretionary budget authority, so every number on it has to be traceable and
 * the provisional/final distinction has to be unmistakable.
 *
 * Four things the spec asks for and this screen does structurally rather than
 * cosmetically:
 *
 *  - The provisional watermark is a *banner plus* a status chip plus hollow
 *    markers, not just a colour, because colour is never the only signal.
 *  - Capped and unallocated amounts are their own lines. Nothing is folded into
 *    a total, so the reader can see that the pool sums back to itself.
 *  - "My pod" is resolved from the viewer's active role assignments, so a member
 *    of two pods sees both rather than an arbitrary one.
 *  - The lock button is accompanied by its checklist. A disabled control
 *    explains nothing; the list of what is missing does.
 */

import Link from 'next/link';

import { AllocationBar } from '../../../../components/budget/AllocationBar';
import { ComponentSubBars } from '../../../../components/budget/ComponentSubBars';
import { CorrectedValue } from '../../../../components/budget/CorrectedValue';
import { LockChecklist } from '../../../../components/budget/LockChecklist';
import { LockCycleForm, ComputeCycleForm } from '../../../../components/budget/HubForms';
import { DataCard } from '../../../../components/ui/DataCard';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';
import type { CorrectionRecord } from '../../../../lib/types-hub';

export const dynamic = 'force-dynamic';

interface OverviewPayload {
  budgetCycle: {
    id: string;
    cycleNumber: number;
    status: 'provisional' | 'locked';
    totalPool: number;
    formulaWeights: Record<string, number>;
    capFraction: number;
    reservedForSurvival: number | null;
    distributablePool: number | null;
    capAmount: number | null;
    totalCapped: number | null;
    totalRedistributed: number | null;
    unallocated: number | null;
    shortfall: number | null;
    survivalScaled: boolean;
    calculatedAt: string | null;
    lockedAt: string | null;
    auditHash: string | null;
    cycleId: string;
  };
  phase: {
    day: number;
    phase: { key: string; name: string; summary: string };
    cycleEndDate: string;
  } | null;
  results: Array<{
    id: string;
    podId: string;
    podName: string;
    holdingName: string | null;
    unitScore: number;
    survivalBudget: number;
    formulaShare: number;
    finalBudget: number;
    shareOfPoolPercent: number;
    capApplied: boolean;
    capReduction: number;
    redistributedAmount: number;
    rawBudgetShare: number;
  }>;
  components: Array<{
    podId: string;
    componentType: 'financial' | 'peer_review' | 'strategic';
    score: number;
    explanation: string | null;
    normalizationMethod: string;
    rawInputs: Record<string, unknown>;
    calculatedAt: string;
  }>;
  checklist: {
    cycleNumber: number;
    status: 'provisional' | 'locked';
    cycleDay: number | null;
    phaseKey: string | null;
    inLockWindow: boolean;
    calculated: boolean;
    blockers: Array<{ reason: string; podId: string | null; podName: string | null; detail: string }>;
    canLock: boolean;
  };
}

const money = (amount: number | null | undefined): string =>
  Math.round(amount ?? 0).toLocaleString('en-US');

interface PhasePayload {
  cycleId: string;
  cycleNumber: number;
  day: number;
  phase: { key: string; label: string };
}

export default async function CurrentBudgetCyclePage() {
  const token = await getSessionToken();
  const meFirst = await apiRequestOrNull<ApiMe>('/api/me', { token });
  const [me, overview, phaseResponse, corrections] = await Promise.all([
    Promise.resolve(meFirst),
    apiRequestOrNull<OverviewPayload>('/api/budget/cycle/current', { token }),
    // The active sprint cycle is read from the calendar module rather than
    // restated here: the Architecture Hub has to be able to start a calculation
    // before any budget cycle exists, and the Day 89–90 window is the calendar's
    // answer, not this module's.
    // `/api/calendar/phase` requires an explicit date: "today" is the server's
    // injected clock, not the caller's, so a screen cannot assume it.
    meFirst?.today
      ? apiRequestOrNull<PhasePayload>(`/api/calendar/phase?date=${meFirst.today}`, { token })
      : Promise.resolve(null),
    // Approved corrections (13 §7): where a figure on this screen was corrected,
    // the original and the correction must appear side by side. The list is
    // org-wide read, so every viewer of the market sees the same truth.
    apiRequestOrNull<CorrectionRecord[]>('/api/hub/corrections?status=approved', { token }),
  ]);

  const approvedCorrections = corrections ?? [];
  // A correction pins to one budget-result row, so pair it with the exact row
  // this screen shows — never with the pod in general, which could pull in a
  // correction from an earlier cycle's numbers.
  const correctionsForResult = (resultId: string): CorrectionRecord[] =>
    approvedCorrections.filter(
      (c) => c.originalEntityType === 'budget_result' && c.originalEntityId === resultId,
    );

  const activeCycle = phaseResponse ?? null;
  const isArchitect = (me?.roles ?? []).some((role) => role.roleType === 'hub_architecture');
  const myPodIds = new Set((me?.pods ?? []).map((pod) => pod.id));

  if (!overview) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Budget Market</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            How the organisation&apos;s allocatable budget is divided between pods, every cycle, by
            formula.
          </p>
        </header>

        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">No budget cycle has been calculated</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            {isArchitect
              ? 'Set the total allocatable pool for the active sprint cycle and run the calculation. Every pod keeps its Survival Budget whatever the pool is.'
              : 'The Architecture Hub sets the total allocatable pool and runs the calculation. Once it has, every pod can see its own number and how it was built.'}
          </p>
          {isArchitect && (
            <ComputeCycleForm
              cycleId={activeCycle?.cycleId ?? null}
              cycleNumber={activeCycle?.cycleNumber ?? null}
              today={me?.today ?? null}
              className="mx-auto mt-6 max-w-md text-left"
            />
          )}
        </div>
      </div>
    );
  }

  const { budgetCycle, phase, results, components, checklist } = overview;
  const locked = budgetCycle.status === 'locked';

  const componentsFor = (podId: string) => {
    const byType = new Map(components.filter((c) => c.podId === podId).map((c) => [c.componentType, c]));
    return (['financial', 'peer_review', 'strategic'] as const).map((type) => {
      const stored = byType.get(type);
      const weight = budgetCycle.formulaWeights[type] ?? 0;
      const score = stored?.score ?? 0;
      return {
        label:
          type === 'financial'
            ? 'Financial performance'
            : type === 'peer_review'
              ? 'Peer review'
              : 'Strategic alignment',
        weight,
        score,
        weightedContribution: Math.round((weight / 100) * score * 100) / 100,
        explanation: stored?.explanation ?? null,
        normalizationMethod: stored?.normalizationMethod ?? 'not_calculated',
        rawInputs: stored?.rawInputs ?? {},
        calculatedAt: stored?.calculatedAt,
        estimated: ['missing_input_midpoint', 'untagged_midpoint'].includes(
          stored?.normalizationMethod ?? '',
        ),
        reference: '15-BUSINESS-RULES-APPENDIX.md',
      };
    });
  };

  const myResults = results.filter((result) => myPodIds.has(result.podId));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Budget Market</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Cycle {budgetCycle.cycleNumber} budget:{' '}
            {locked
              ? `Final — locked ${budgetCycle.lockedAt ? new Date(budgetCycle.lockedAt).toUTCString() : ''}`
              : 'Provisional — live estimate'}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Budget screens">
          <Link
            href="/budget/history"
            className="rounded border border-line-300 px-3 py-1.5 text-ink-700 hover:border-signal-600 hover:text-signal-600"
          >
            History
          </Link>
          <Link
            href="/budget/simulator"
            className="rounded border border-line-300 px-3 py-1.5 text-ink-700 hover:border-signal-600 hover:text-signal-600"
          >
            Simulator
          </Link>
        </nav>
      </header>

      {!locked && (
        <div
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-status-watch/40 bg-surface-white px-4 py-3"
          role="status"
        >
          <StatusChip tone="watch" label="Provisional — Live Estimate" />
          <p className="text-sm text-slate-500">
            These numbers move as peer reviews and financial syncs arrive. They become final when the
            cycle locks on Day 90
            {phase ? ` (currently Day ${phase.day}, ${phase.phase.name.toLowerCase()})` : ''}.
          </p>
        </div>
      )}

      {locked && (
        <div
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-status-good/40 bg-surface-white px-4 py-3"
          role="status"
        >
          <StatusChip tone="good" label="Final — Locked" />
          <p className="text-sm text-slate-500">
            Locked{' '}
            {budgetCycle.lockedAt ? new Date(budgetCycle.lockedAt).toUTCString() : 'this cycle'}.
            These numbers are immutable.
          </p>
          {budgetCycle.auditHash && (
            <p className="font-mono text-xs text-ink-700">{budgetCycle.auditHash}</p>
          )}
        </div>
      )}

      {budgetCycle.survivalScaled && (
        <div
          className="mb-5 rounded border border-status-alert/40 bg-surface-white px-4 py-3 text-sm text-ink-950"
          role="alert"
        >
          The pool could not cover every pod&apos;s Survival Budget, so the floors were scaled down
          proportionally rather than paying some pods in full and others nothing. Shortfall:{' '}
          <span className="font-mono tabular-nums">{money(budgetCycle.shortfall)}</span>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-labelledby="allocation-heading">
          <div className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="allocation-heading" className="font-display text-lg text-ink-950">
              Allocation across the organisation
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Every pod&apos;s share of the total allocatable budget. Select a segment for its full
              calculation.
            </p>
            <AllocationBar
              className="mt-4"
              segments={results.map((result) => ({
                podId: result.podId,
                podName: result.podName,
                holdingName: result.holdingName,
                finalBudget: result.finalBudget,
                shareOfPoolPercent: result.shareOfPoolPercent,
                capApplied: result.capApplied,
              }))}
              totalPool={budgetCycle.totalPool}
              unallocated={budgetCycle.unallocated ?? 0}
              provisional={!locked}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DataCard
              label="Total allocatable pool"
              value={money(budgetCycle.totalPool)}
              tone="neutral"
              hint={`Cycle ${budgetCycle.cycleNumber}`}
              provenance={{
                source: 'budget_cycle.total_pool',
                updatedAt: budgetCycle.calculatedAt
                  ? new Date(budgetCycle.calculatedAt).toUTCString()
                  : undefined,
                formula: 'Set by the Architecture Hub at the start of the cycle',
                reference: '05-MODULE-BUDGET-MARKET.md',
              }}
            />
            <DataCard
              label="Reserved for Survival Budgets"
              value={money(budgetCycle.reservedForSurvival)}
              tone="neutral"
              hint="One month of each pod's fixed costs, before the formula runs"
              provenance={{
                source: 'pod_budget_result.survival_budget',
                formula: 'Σ pod.monthly_fixed_costs, reserved before the proportional split',
                reference: '15-BUSINESS-RULES-APPENDIX.md',
              }}
            />
            <DataCard
              label="Distributed by formula"
              value={money(budgetCycle.distributablePool)}
              tone="active"
              hint="Total pool minus the reserved Survival Budgets"
              provenance={{
                source: 'budget_cycle.distributable_pool',
                formula: '(Unit Score ÷ Σ Unit Scores) × distributable pool',
                reference: '05-MODULE-BUDGET-MARKET.md',
              }}
            />
            <DataCard
              label={`Capped at ${Math.round(budgetCycle.capFraction * 100)}%`}
              value={money(budgetCycle.totalCapped)}
              tone={(budgetCycle.totalCapped ?? 0) > 0 ? 'watch' : 'neutral'}
              hint={
                (budgetCycle.totalRedistributed ?? 0) > 0
                  ? `${money(budgetCycle.totalRedistributed)} redistributed to the pods still under the ceiling`
                  : 'Nothing was clipped by the ceiling this cycle'
              }
              provenance={{
                source: 'budget_cycle.total_capped',
                formula: `cap = ${Math.round(budgetCycle.capFraction * 100)}% × ${money(budgetCycle.totalPool)} = ${money(budgetCycle.capAmount)}`,
                reference: '15-BUSINESS-RULES-APPENDIX.md',
              }}
            />
          </div>

          {(budgetCycle.unallocated ?? 0) > 0 && (
            <div className="mt-4 rounded border border-line-200 bg-surface-white px-4 py-3 text-sm">
              <p className="text-ink-950">
                <span className="font-mono tabular-nums">{money(budgetCycle.unallocated)}</span> of
                the pool could not be distributed.
              </p>
              <p className="mt-1 text-slate-500">
                Every pod already sits at the ceiling, so there is nobody under it to receive the
                excess. With fewer than four pods the caps sum to less than the whole pool, which
                makes this arithmetic rather than a mistake — but it is reported here rather than
                folded silently into the totals.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:col-span-4">
          <LockChecklist
            {...checklist}
            lockedAt={budgetCycle.lockedAt}
            auditHash={budgetCycle.auditHash}
          />

          {isArchitect && !locked && (
            <LockCycleForm
              budgetCycleId={budgetCycle.id}
              canLock={checklist.canLock}
              blockerCount={checklist.blockers.length}
            />
          )}

          {isArchitect && !locked && (
            <ComputeCycleForm
              today={me?.today ?? null}
              currentPool={budgetCycle.totalPool}
              cycleId={budgetCycle.cycleId}
              cycleNumber={budgetCycle.cycleNumber}
            />
          )}
        </aside>
      </div>

      <section className="mt-6" aria-labelledby="my-pods-heading">
        <h2 id="my-pods-heading" className="font-display text-xl text-ink-950">
          {myResults.length > 1 ? 'My pods' : 'My pod'}
        </h2>

        {myResults.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-slate-500">
            You are not currently a member of any pod, so there is no pod budget to show you here.
            Every pod&apos;s allocation above is still readable — cross-pod transparency is the
            default, not a privilege.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {myResults.map((result) => (
              <article
                key={result.podId}
                className="rounded border border-line-200 bg-surface-white p-4"
                style={{ borderLeft: '2px solid var(--color-signal-600, #1E6F5C)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm text-ink-950">{result.podName}</h3>
                  {result.holdingName && (
                    <span className="text-2xs text-slate-500">{result.holdingName}</span>
                  )}
                </div>

                <p className="mt-3 font-display text-3xl tabular-nums text-ink-950">
                  <CorrectedValue
                    value={result.finalBudget}
                    corrections={correctionsForResult(result.id)}
                    field="final_budget"
                    format={money}
                  />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Unit Budget for cycle {budgetCycle.cycleNumber + 1} · {result.shareOfPoolPercent}%
                  of the pool · Unit Score {result.unitScore}
                </p>

                <ComponentSubBars className="mt-4" components={componentsFor(result.podId)} />

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-200 pt-3">
                  <Link
                    href={`/budget/${result.podId}/breakdown`}
                    className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
                  >
                    View full calculation
                  </Link>
                  {result.capApplied && (
                    <StatusChip
                      tone="watch"
                      label={`Capped · ${money(result.capReduction)} clipped`}
                    />
                  )}
                  {result.redistributedAmount > 0 && (
                    <StatusChip
                      tone="good"
                      label={`+${money(result.redistributedAmount)} redistributed in`}
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="all-pods-heading">
        <h2 id="all-pods-heading" className="font-display text-xl text-ink-950">
          Every pod
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Readable by anyone in the organisation. A pod seeing another pod&apos;s number is the
          point of this module, not a leak.
        </p>
        <div className="mt-3 overflow-x-auto rounded border border-line-200 bg-surface-white">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Budget allocation for cycle {budgetCycle.cycleNumber}, newest calculation{' '}
              {/* `calculatedAt` is a full timestamp, not an ISO date, so it is
                  formatted as an instant rather than passed to formatShortDate. */}
              {budgetCycle.calculatedAt
                ? new Date(budgetCycle.calculatedAt).toUTCString()
                : 'pending'}
            </caption>
            <thead>
              <tr className="border-b border-line-200 text-left text-xs text-slate-500">
                <th scope="col" className="px-3 py-2 font-medium">Pod</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Unit Score</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Survival</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Formula share</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Final budget</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {results.map((result) => (
                <tr key={result.podId} className="hover:bg-paper-100">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link
                      href={`/budget/${result.podId}/breakdown`}
                      className="text-ink-950 underline-offset-2 hover:underline"
                    >
                      {result.podName}
                    </Link>
                    {result.capApplied && (
                      <span className="ml-2 rounded border border-line-200 px-1 text-2xs text-slate-500">
                        capped
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <CorrectedValue
                      value={result.unitScore}
                      corrections={correctionsForResult(result.id)}
                      field="unit_score"
                      format={(v) => String(v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <CorrectedValue
                      value={result.survivalBudget}
                      corrections={correctionsForResult(result.id)}
                      field="survival_budget"
                      format={money}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {money(result.formulaShare)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-950">
                    <CorrectedValue
                      value={result.finalBudget}
                      corrections={correctionsForResult(result.id)}
                      field="final_budget"
                      format={money}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {result.shareOfPoolPercent}%
                  </td>
                </tr>
              ))}
              {(budgetCycle.unallocated ?? 0) > 0 && (
                <tr className="border-t-2 border-line-300">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-slate-500">
                    Unallocated — nobody under the ceiling to receive it
                  </th>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {money(budgetCycle.unallocated)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                    {(((budgetCycle.unallocated ?? 0) / budgetCycle.totalPool) * 100).toFixed(1)}%
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-300 font-medium">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  Total pool
                </th>
                <td className="px-3 py-2" colSpan={3} />
                <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-950">
                  {money(budgetCycle.totalPool)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
