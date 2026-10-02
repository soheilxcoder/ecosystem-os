/**
 * Budget Market — cycle overview, adapted from the live `/budget/current-cycle`
 * screen with the sample dataset: pool math, allocation bar, results table and
 * the lock checklist.
 */
import Link from '../shims/link';
import { AllocationBar } from '../../../components/budget/AllocationBar';
import { LockChecklist, type ChecklistBlocker } from '../../../components/budget/LockChecklist';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { CAP_FRACTION, CYCLE_DAY, CYCLE_NUMBER, PODS, TOTAL_POOL, money } from '../data';

const CAP_AMOUNT = Math.round(TOTAL_POOL * CAP_FRACTION);

const blockers: ChecklistBlocker[] = [
  {
    reason: 'financial_sync_failed',
    podId: 'pod-dune',
    podName: 'Pod Dune',
    detail: 'The accounting connector returned stale figures two days running.',
  },
  {
    reason: 'peer_reviews_unresolved',
    podId: 'pod-ember',
    podName: 'Pod Ember',
    detail: 'One assigned peer review is still a draft.',
  },
];

export function BudgetScreen() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Budget Market</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Cycle {CYCLE_NUMBER} · Day {CYCLE_DAY} of 90 · how the organisation&apos;s allocatable
            budget is divided between pods, by formula.
          </p>
        </div>
        <StatusChip tone="watch" label="Provisional — locks on Day 89" />
      </header>

      <p className="mb-5 rounded border border-line-200 bg-surface-white px-4 py-2.5 text-sm text-slate-500">
        Every number below is computed, not entered: Unit Score feeds the formula, the Survival
        Budget is the floor, and the 25% ceiling keeps any one pod from absorbing the pool.
      </p>

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
              segments={PODS.map((pod) => ({
                podId: pod.id,
                podName: pod.name,
                holdingName: pod.holdingName,
                finalBudget: pod.finalBudget,
                shareOfPoolPercent: pod.shareOfPoolPercent,
                capApplied: pod.capApplied,
              }))}
              totalPool={TOTAL_POOL}
              unallocated={0}
              provisional
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DataCard
              label="Total allocatable pool"
              value={money(TOTAL_POOL)}
              tone="neutral"
              hint={`Cycle ${CYCLE_NUMBER}`}
              provenance={{
                source: 'budget_cycle.total_pool',
                updatedAt: '2026-09-21',
                formula: 'Set by the Architecture Hub at the start of the cycle',
                reference: '05-MODULE-BUDGET-MARKET.md',
              }}
            />
            <DataCard
              label="Ceiling per pod (25%)"
              value={money(CAP_AMOUNT)}
              tone="neutral"
              hint="No pod is over the ceiling this cycle; if one were, the excess would be redistributed."
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded border border-line-200 bg-surface-white">
            <table className="w-full min-w-135 border-collapse text-sm">
              <caption className="px-3 py-2 text-left text-xs text-slate-500">
                Cycle {CYCLE_NUMBER} results — provisional until the lock window
              </caption>
              <thead>
                <tr className="border-b border-line-200 text-left text-xs text-slate-500">
                  <th scope="col" className="px-3 py-2 font-medium">Pod</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Unit Score</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Survival</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Final budget</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-200">
                {PODS.map((pod) => (
                  <tr key={pod.id} className="hover:bg-paper-100">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Link
                        href="/budget/breakdown"
                        className="text-ink-950 underline-offset-2 hover:underline"
                      >
                        {pod.name}
                      </Link>
                      {pod.capApplied && (
                        <span className="ml-2 rounded border border-line-200 px-1 text-2xs text-slate-500">
                          capped
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{pod.unitScore}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {money(pod.survivalBudget)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-950">
                      {money(pod.finalBudget)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                      {pod.shareOfPoolPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-300 font-medium">
                  <th scope="row" className="px-3 py-2 text-left font-medium">Total pool</th>
                  <td className="px-3 py-2" colSpan={3} />
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-950">
                    {money(TOTAL_POOL)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="space-y-4 lg:col-span-4">
          <LockChecklist
            cycleNumber={CYCLE_NUMBER}
            status="provisional"
            cycleDay={CYCLE_DAY}
            phaseKey="execution"
            inLockWindow={false}
            calculated
            blockers={blockers}
            canLock={false}
          />

          <div className="rounded border border-line-200 bg-surface-white p-4">
            <h2 className="text-sm font-medium text-ink-950">Why a market?</h2>
            <p className="mt-1 text-sm text-slate-500">
              No manager allocates money here. The formula does, in the open — so any pod can audit
              why its budget moved. That audit trail is the{' '}
              <Link href="/budget/breakdown" className="text-signal-600 underline">
                full calculation
              </Link>
              , step by step.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
