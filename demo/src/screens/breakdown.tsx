/**
 * Budget breakdown — the "show the formula" screen: components → weighted
 * sum → pool math → adjustments → final budget. Fully bilingual.
 */
import Link from '../shims/link';
import { ArithmeticStrip } from '../../../components/budget/ArithmeticStrip';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ComponentSubBarsI18n, type ComponentBarProps } from '../components/budget';
import { DataCardI18n } from '../components/primitives';
import {
  CAP_AMOUNT,
  CYCLE_NUMBER,
  DISTRIBUTABLE_POOL,
  PODS,
  RESERVED_FOR_SURVIVAL,
  TOTAL_POOL,
  TOTAL_UNIT_SCORE,
} from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

const pod = PODS[0]!; // Pod Atlas — the showcase walks one pod end to end.

export function BreakdownScreen() {
  const { t, num, money, date, lang } = useI18n();
  const names = useNames();

  const COMPONENTS: ComponentBarProps[] = [
    {
      label: t('component.financial'),
      weight: 40,
      score: pod.components.financial,
      weightedContribution: pod.components.financial * 0.4,
      explanation: t('component.financial.explanation'),
      normalizationMethod: 'peer_reviewed_percentile',
      rawInputs: {
        on_time_deliveries: 41,
        total_deliveries: 46,
        disputed_value: '2.1%',
        rework_rate: '4%',
      },
      calculatedAt: '2026-09-28',
      reference: '15-BUSINESS-RULES-APPENDIX.md',
    },
    {
      label: t('component.peer_review'),
      weight: 35,
      score: pod.components.peer_review,
      weightedContribution: pod.components.peer_review * 0.35,
      explanation: t('component.peer_review.explanation'),
      normalizationMethod: 'peer_reviewed_percentile',
      rawInputs: { reviews_completed: 12, average_mark: 3.7, max_mark: 5, escalations: 0 },
      calculatedAt: '2026-09-28',
      reference: '15-BUSINESS-RULES-APPENDIX.md',
    },
    {
      label: t('component.strategic'),
      weight: 25,
      score: pod.components.strategic,
      weightedContribution: pod.components.strategic * 0.25,
      explanation: t('component.strategic.explanation'),
      normalizationMethod: 'hub_scored',
      rawInputs: { themes_matched: 6, themes_total: 8, pitch_acceptance: '75%' },
      calculatedAt: '2026-09-27',
      reference: '15-BUSINESS-RULES-APPENDIX.md',
    },
  ];

  const unitScore = pod.unitScore;
  const rawBudgetShare = pod.formulaShare;
  const finalBudget = pod.finalBudget;

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/budget" className="underline-offset-2 hover:underline">
          {t('budget.h1')}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-700">{names.podName(pod.id)}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">
            {t('breakdown.h1', { pod: names.podName(pod.id) })}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('breakdown.calculated', { cycle: num(CYCLE_NUMBER), date: date('2026-09-29') })}
          </p>
        </div>
        <StatusChip tone="watch" label={t('lock.provisional')} />
      </header>

      <div className="rounded border border-line-200 bg-surface-white p-5">
        <p className="text-xs text-slate-500">{t('breakdown.heroLabel')}</p>
        <p className="mt-1 font-display text-4xl tabular-nums text-ink-950">{money(finalBudget)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {t('breakdown.heroSub', {
            share: num((finalBudget / TOTAL_POOL) * 100, 1),
            pool: money(TOTAL_POOL),
            score: num(unitScore, 2),
          })}
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-2 text-sm">
          <span
            className="font-mono tabular-nums"
            style={{ color: 'var(--color-status-good, #1E7A4C)' }}
          >
            ▲ {num(4.2, 1)}%
          </span>
          <span className="text-slate-500">
            {t('breakdown.delta', {
              n: num(2),
              budget: money(391_000_000),
              score: num(72.9, 1),
            })}
          </span>
        </p>
      </div>

      <section className="mt-6" aria-labelledby="components-heading">
        <h2 id="components-heading" className="font-display text-xl text-ink-950">
          {t('breakdown.componentsH2')}
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ComponentSubBarsI18n components={COMPONENTS} />
        </div>

        <div className="mt-4 space-y-3">
          {COMPONENTS.map((component) => (
            <details key={component.label} className="rounded border border-line-200 bg-surface-white">
              <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink-950">
                {t('breakdown.rawInputs', { label: component.label })}
                <span className="ms-2 text-xs text-slate-500">
                  {t(`norm.${component.normalizationMethod}` as never)}
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
          {t('breakdown.arithmeticH2')}
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ArithmeticStrip
            clauses={COMPONENTS.map((component) => ({
              weight: component.weight / 100,
              score: component.score,
              label: component.label.toLowerCase(),
            }))}
            result={unitScore}
            resultLabel={t('breakdown.unitScore')}
          />
          <p
            className="mt-3 border-t border-line-200 pt-3 font-mono text-sm text-slate-500"
            dir="ltr"
          >
            (0.40 × {num(pod.components.financial)}) + (0.35 × {num(pod.components.peer_review)}) +
            (0.25 × {num(pod.components.strategic)}) = {num(unitScore, 2)}
          </p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="pool-heading">
        <h2 id="pool-heading" className="font-display text-xl text-ink-950">
          {t('breakdown.poolH2')}
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DataCardI18n
            label={t('breakdown.poolTotal')}
            value={money(TOTAL_POOL)}
            hint={t('budget.poolHint', { n: num(CYCLE_NUMBER) })}
            provenance={{ source: 'budget_cycle.total_pool' }}
          />
          <DataCardI18n
            label={t('breakdown.poolReserved')}
            value={money(RESERVED_FOR_SURVIVAL)}
            hint={t('breakdown.poolReservedHint')}
            provenance={{
              source: 'Σ pod_budget_result.survival_budget',
              formula: t('breakdown.poolReservedFormula'),
            }}
          />
          <DataCardI18n
            label={t('breakdown.poolDistributable')}
            value={money(DISTRIBUTABLE_POOL)}
            hint={t('breakdown.poolDistributableHint')}
            provenance={{
              source: 'budget_cycle.distributable_pool',
              formula: t('breakdown.poolDistributableFormula'),
            }}
          />
        </div>

        <div className="mt-4 rounded border border-line-200 bg-surface-white">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {names.podName(pod.id)} — {t('breakdown.h1', { pod: '' })}
            </caption>
            <thead>
              <tr className="border-b border-line-200 text-xs text-slate-500">
                <th scope="col" className="px-4 py-2 text-start font-medium">{t('breakdown.stepCol')}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">{t('breakdown.amountCol')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              <tr>
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <span className="text-ink-950">{t('breakdown.stepShare')}</span>
                  <span className="block text-xs text-slate-500">
                    {num(unitScore, 2)} ÷ {num(TOTAL_UNIT_SCORE, 1)} × {money(DISTRIBUTABLE_POOL)}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-end font-mono tabular-nums text-ink-950">
                  {money(rawBudgetShare)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <span className="text-ink-950">{t('breakdown.stepSurvival')}</span>
                  <span className="block text-xs text-slate-500">
                    {t('breakdown.stepSurvivalNote', { monthly: money(pod.monthlyFixedCosts) })}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-end font-mono tabular-nums text-ink-950">
                  +{money(pod.survivalBudget)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <span className="text-ink-950">{t('breakdown.stepCap')}</span>
                  <span className="block text-xs text-slate-500">
                    {t('breakdown.stepCapNote', { cap: money(CAP_AMOUNT) })}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-end font-mono tabular-nums text-slate-500">—</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-300">
                <th scope="row" className="px-4 py-3 text-start font-medium">
                  {t('breakdown.final')}
                  <span className="block text-xs font-normal text-slate-500">
                    {t('breakdown.finalNote', {
                      survival: money(pod.survivalBudget),
                      share: money(rawBudgetShare),
                    })}
                  </span>
                </th>
                <td className="px-4 py-3 text-end font-display text-xl tabular-nums text-ink-950">
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
          {t('breakdown.back')}
        </Link>
        <Link
          href="/archive"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          {t('breakdown.archive')}
        </Link>
      </div>
    </div>
  );
}
