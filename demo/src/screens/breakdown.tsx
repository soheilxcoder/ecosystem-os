/**
 * Budget breakdown — the "show the formula" screen, adapted from the live
 * `/budget/:podId/breakdown` page. Renders the six spec steps in order:
 * components → weighted sum → pool math → adjustments → final budget.
 */
import Link from '../shims/link';
import { ArithmeticStrip } from '../../../components/budget/ArithmeticStrip';
import { ComponentSubBars, type ComponentBarProps } from '../../../components/budget/ComponentSubBars';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import {
  CAP_AMOUNT,
  CYCLE_NUMBER,
  DISTRIBUTABLE_POOL,
  PODS,
  RESERVED_FOR_SURVIVAL,
  TOTAL_POOL,
  TOTAL_UNIT_SCORE,
  money,
} from '../data';

const pod = PODS[0]!; // Pod Atlas — the showcase walks one pod end to end.

const COMPONENTS: ComponentBarProps[] = [
  {
    label: 'Financial delivery',
    weight: 40,
    score: pod.components.financial,
    weightedContribution: pod.components.financial * 0.4,
    explanation: 'Revenue booked on time, minus rework and disputed invoices.',
    normalizationMethod: 'peer_reviewed_percentile',
    rawInputs: { on_time_deliveries: 41, total_deliveries: 46, disputed_value: '2.1%', rework_rate: '4%' },
    calculatedAt: '2026-09-28',
    reference: '15-BUSINESS-RULES-APPENDIX.md',
  },
  {
    label: 'Peer review quality',
    weight: 35,
    score: pod.components.peer_review,
    weightedContribution: pod.components.peer_review * 0.35,
    explanation: 'Mean of the peer validators\' marks on this cycle\'s outputs.',
    normalizationMethod: 'peer_reviewed_percentile',
    rawInputs: { reviews_completed: 12, average_mark: 3.7, max_mark: 5, escalations: 0 },
    calculatedAt: '2026-09-28',
    reference: '15-BUSINESS-RULES-APPENDIX.md',
  },
  {
    label: 'Strategic alignment',
    weight: 25,
    score: pod.components.strategic,
    weightedContribution: pod.components.strategic * 0.25,
    explanation: 'How closely the pod\'s pitches tracked the Strategic Hub\'s themes.',
    normalizationMethod: 'hub_scored',
    rawInputs: { themes_matched: 6, themes_total: 8, pitch_acceptance: '75%' },
    calculatedAt: '2026-09-27',
    reference: '15-BUSINESS-RULES-APPENDIX.md',
  },
];

const unitScore = pod.unitScore;
/** Same figures the live API returns for this pod's cycle-3 result row. */
const rawBudgetShare = pod.formulaShare;
const finalBudget = pod.finalBudget;

export function BreakdownScreen() {
  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/budget" className="underline-offset-2 hover:underline">
          Budget Market
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-700">{pod.name}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">{pod.name} — full calculation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cycle {CYCLE_NUMBER} · calculated Tue, 29 Sep 2026
          </p>
        </div>
        <StatusChip tone="watch" label="Provisional — live estimate" />
      </header>

      <div className="rounded border border-line-200 bg-surface-white p-5">
        <p className="text-xs text-slate-500">Unit Budget — provisional estimate</p>
        <p className="mt-1 font-display text-4xl tabular-nums text-ink-950">{money(finalBudget)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {((finalBudget / TOTAL_POOL) * 100).toFixed(1)}% of a {money(TOTAL_POOL)} pool · Unit
          Score {unitScore}
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-mono tabular-nums" style={{ color: 'var(--color-status-good, #1E7A4C)' }}>
            ▲ 4.2%
          </span>
          <span className="text-slate-500">versus cycle 2 ({money(391_000_000)}, Unit Score 72.9)</span>
        </p>
      </div>

      <section className="mt-6" aria-labelledby="components-heading">
        <h2 id="components-heading" className="font-display text-xl text-ink-950">
          How each component score was derived
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ComponentSubBars components={COMPONENTS} />
        </div>

        <div className="mt-4 space-y-3">
          {COMPONENTS.map((component) => (
            <details
              key={component.label}
              className="rounded border border-line-200 bg-surface-white"
            >
              <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink-950">
                {component.label} — raw inputs
                <span className="ml-2 text-xs text-slate-500">
                  {component.normalizationMethod.replace(/_/g, ' ')}
                </span>
              </summary>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-line-200 px-4 py-3 text-sm sm:grid-cols-2">
                {Object.entries(component.rawInputs).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{key.replace(/_/g, ' ')}</dt>
                    <dd className="font-mono tabular-nums text-ink-950">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="arithmetic-heading">
        <h2 id="arithmetic-heading" className="font-display text-xl text-ink-950">
          The weighted sum
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ArithmeticStrip
            clauses={COMPONENTS.map((component) => ({
              weight: component.weight / 100,
              score: component.score,
              label: component.label.toLowerCase(),
            }))}
            result={unitScore}
          />
          <p className="mt-3 border-t border-line-200 pt-3 font-mono text-sm text-slate-500">
            (0.40 × {pod.components.financial}) + (0.35 × {pod.components.peer_review}) + (0.25 ×{' '}
            {pod.components.strategic}) = {unitScore}
          </p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="pool-heading">
        <h2 id="pool-heading" className="font-display text-xl text-ink-950">
          From Unit Score to budget
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DataCard
            label="Total pool"
            value={money(TOTAL_POOL)}
            hint={`Cycle ${CYCLE_NUMBER}`}
            provenance={{ source: 'budget_cycle.total_pool' }}
          />
          <DataCard
            label="Reserved for Survival Budgets"
            value={money(RESERVED_FOR_SURVIVAL)}
            hint="Every pod's floor, before the formula"
            provenance={{
              source: 'Σ pod_budget_result.survival_budget',
              formula: 'one month of each pod’s fixed costs',
            }}
          />
          <DataCard
            label="Distributable pool"
            value={money(DISTRIBUTABLE_POOL)}
            hint="What the proportional formula divides"
            provenance={{
              source: 'budget_cycle.distributable_pool',
              formula: 'total pool − Σ survival budgets',
            }}
          />
        </div>

        <div className="mt-4 rounded border border-line-200 bg-surface-white">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Every step between {pod.name}&apos;s Unit Score and its final budget
            </caption>
            <thead>
              <tr className="border-b border-line-200 text-left text-xs text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">Step</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              <tr>
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="text-ink-950">This pod&apos;s share of all Unit Scores</span>
                  <span className="block text-xs text-slate-500">
                    {unitScore} ÷ Σ all Unit Scores × {money(DISTRIBUTABLE_POOL)}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-950">
                  {money(rawBudgetShare)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="text-ink-950">Survival Budget added</span>
                  <span className="block text-xs text-slate-500">
                    Reserved floor — 12 × {money(pod.monthlyFixedCosts)}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-950">
                  +{money(pod.survivalBudget)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="text-ink-950">Cap check</span>
                  <span className="block text-xs text-slate-500">
                    Ceiling is {money(CAP_AMOUNT)} (25% of pool) — not exceeded
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">—</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-300">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  Final budget
                  <span className="block text-xs font-normal text-slate-500">
                    Survival Budget {money(pod.survivalBudget)} + formula share{' '}
                    {money(rawBudgetShare)}
                  </span>
                </th>
                <td className="px-4 py-3 text-right font-display text-xl tabular-nums text-ink-950">
                  {money(finalBudget)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/budget"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          Back to the cycle
        </Link>
        <Link
          href="/archive"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          Locked cycles in the archive
        </Link>
      </div>
    </div>
  );
}
