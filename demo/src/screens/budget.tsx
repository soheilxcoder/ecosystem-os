/**
 * Budget Market — cycle overview: pool math, allocation bar, results table
 * and the lock checklist. Fully bilingual.
 */
import Link from '../shims/link';
import { StatusChip } from '../../../components/ui/StatusChip';
import { AllocationBarI18n, LockChecklistI18n, type ChecklistBlocker } from '../components/budget';
import { DataCardI18n } from '../components/primitives';
import { CAP_AMOUNT, CYCLE_DAY, CYCLE_NUMBER, PODS, TOTAL_POOL } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

const BLOCKERS: Array<{ reason: string; podId: string; detailKey: 'lock.detail.dune' | 'lock.detail.ember' }> = [
  { reason: 'financial_sync_failed', podId: 'pod-dune', detailKey: 'lock.detail.dune' },
  { reason: 'peer_reviews_unresolved', podId: 'pod-ember', detailKey: 'lock.detail.ember' },
];

export function BudgetScreen() {
  const { t, num, money } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">{t('budget.h1')}</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            {t('budget.sub', { cycle: num(CYCLE_NUMBER), day: num(CYCLE_DAY) })}
          </p>
        </div>
        <StatusChip tone="watch" label={t('budget.chip')} />
      </header>

      <p className="mb-5 rounded border border-line-200 bg-surface-white px-4 py-2.5 text-sm text-slate-500">
        {t('budget.intro')}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-labelledby="allocation-heading">
          <div className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="allocation-heading" className="font-display text-lg text-ink-950">
              {t('budget.allocationH2')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t('budget.allocationSub')}</p>
            <AllocationBarI18n
              className="mt-4"
              segments={PODS.map((pod) => ({
                podId: pod.id,
                podName: names.podName(pod.id),
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
            <DataCardI18n
              label={t('budget.pool')}
              value={money(TOTAL_POOL)}
              tone="neutral"
              hint={t('budget.poolHint', { n: num(CYCLE_NUMBER) })}
              provenance={{
                source: 'budget_cycle.total_pool',
                updatedAt: '2026-09-21',
                formula: t('budget.poolProvFormula'),
                reference: '05-MODULE-BUDGET-MARKET.md',
              }}
            />
            <DataCardI18n
              label={t('budget.cap')}
              value={money(CAP_AMOUNT)}
              tone="neutral"
              hint={t('budget.capHint')}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded border border-line-200 bg-surface-white">
            <table className="w-full min-w-135 border-collapse text-sm">
              <caption className="px-3 py-2 text-start text-xs text-slate-500">
                {t('budget.tableCaption', { n: num(CYCLE_NUMBER) })}
              </caption>
              <thead>
                <tr className="border-b border-line-200 text-start text-xs text-slate-500">
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('budget.colPod')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('budget.colUnitScore')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('budget.colSurvival')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('budget.colFinal')}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t('budget.colShare')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-200">
                {PODS.map((pod) => (
                  <tr key={pod.id} className="hover:bg-paper-100">
                    <th scope="row" className="px-3 py-2 text-start font-normal">
                      <Link
                        href="/budget/breakdown"
                        className="text-ink-950 underline-offset-2 hover:underline"
                      >
                        {names.podName(pod.id)}
                      </Link>
                      {pod.capApplied && (
                        <span className="ms-2 rounded border border-line-200 px-1 text-2xs text-slate-500">
                          {t('budget.capped')}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-end font-mono tabular-nums">{num(pod.unitScore, 2)}</td>
                    <td className="px-3 py-2 text-end font-mono tabular-nums">
                      {money(pod.survivalBudget)}
                    </td>
                    <td className="px-3 py-2 text-end font-mono tabular-nums text-ink-950">
                      {money(pod.finalBudget)}
                    </td>
                    <td className="px-3 py-2 text-end font-mono tabular-nums text-slate-500">
                      {num(pod.shareOfPoolPercent, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-300 font-medium">
                  <th scope="row" className="px-3 py-2 text-start font-medium">{t('budget.totalPool')}</th>
                  <td className="px-3 py-2" colSpan={3} />
                  <td className="px-3 py-2 text-end font-mono tabular-nums text-ink-950">
                    {money(TOTAL_POOL)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="space-y-4 lg:col-span-4">
          <LockChecklistI18n
            cycleNumber={CYCLE_NUMBER}
            status="provisional"
            cycleDay={CYCLE_DAY}
            phaseKey="execution"
            inLockWindow={false}
            calculated
            blockers={BLOCKERS.map((blocker) => ({
              reason: blocker.reason,
              podId: blocker.podId,
              podName: names.podName(blocker.podId),
              detail: t(blocker.detailKey),
            }))}
            canLock={false}
          />

          <div className="rounded border border-line-200 bg-surface-white p-4">
            <h2 className="text-sm font-medium text-ink-950">{t('budget.whyH2')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('budget.whyText1')}{' '}
              <Link href="/budget/breakdown" className="text-signal-600 underline">
                {t('budget.whyLink')}
              </Link>
              {t('budget.whyText2')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
