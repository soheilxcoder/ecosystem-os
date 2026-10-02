/**
 * `/budget/:podId/breakdown` — 05-MODULE-BUDGET-MARKET.md, screen 2.
 *
 * "Shows, in order, exactly how the number was built — this is the 'show the
 * formula' principle taken to its fullest." The six steps in the spec are the
 * six sections here, in that order, because the order *is* the explanation:
 * components first, then the weighted sum, then the pool math, then the
 * adjustments that got from one to the other.
 *
 * Readable by anyone in the organisation, including for a pod they do not belong
 * to. That is not an oversight — `budget.view_breakdown` is org-wide in the
 * permission matrix, and a pod being able to audit another pod's arithmetic is
 * the mechanism that replaces managerial oversight.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArithmeticStrip } from '../../../../../components/budget/ArithmeticStrip';
import { ComponentSubBars } from '../../../../../components/budget/ComponentSubBars';
import { CorrectedValue } from '../../../../../components/budget/CorrectedValue';
import { DataCard } from '../../../../../components/ui/DataCard';
import { StatusChip } from '../../../../../components/ui/StatusChip';
import { BreakdownExport } from '../../../../../components/budget/BreakdownExport';
import { apiRequest, apiRequestOrNull, ApiError } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type { CorrectionRecord } from '../../../../../lib/types-hub';

export const dynamic = 'force-dynamic';

interface BreakdownPayload {
  budgetCycle: {
    id: string;
    cycleNumber: number;
    status: 'provisional' | 'locked';
    totalPool: number;
    formulaWeights: Record<string, number>;
    capFraction: number;
    capAmount: number | null;
    distributablePool: number | null;
    reservedForSurvival: number | null;
    unallocated: number | null;
    lockedAt: string | null;
    auditHash: string | null;
    calculatedAt: string | null;
  };
  podId: string;
  podName: string;
  components: Array<{
    componentType: 'financial' | 'peer_review' | 'strategic';
    label: string;
    weight: number;
    score: number;
    weightedContribution: number;
    explanation: string | null;
    normalizationMethod: string;
    rawInputs: Record<string, unknown>;
    calculatedAt: string;
  }>;
  unitScore: number;
  arithmeticLine: string;
  result: {
    id: string;
    unitScore: number;
    monthlyFixedCosts: number;
    survivalBudget: number;
    rawBudgetShare: number;
    formulaShare: number;
    capApplied: boolean;
    capReduction: number;
    redistributedAmount: number;
    finalBudget: number;
    shareOfPoolPercent: number;
    locked: boolean;
  };
  adjustmentLines: Array<{ label: string; amount: number; note: string }>;
  previousCycle: { cycleNumber: number; finalBudget: number; unitScore: number } | null;
  delta: number | null;
  deltaPercent: number | null;
  financialWarning: { sourceSystem: string; detail: string; fetchedAt: string | null } | null;
}

const money = (amount: number | null | undefined): string =>
  Math.round(amount ?? 0).toLocaleString('en-US');

/** Render a raw-input value as readable text without inventing structure. */
function rawValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.map(rawValue).join(', ');
  return JSON.stringify(value);
}

export default async function BudgetBreakdownPage({
  params,
  searchParams,
}: {
  params: Promise<{ podId: string }>;
  searchParams: Promise<{ cycleNumber?: string }>;
}) {
  const { podId } = await params;
  const { cycleNumber } = await searchParams;
  const token = await getSessionToken();

  const query = cycleNumber ? `?cycleNumber=${encodeURIComponent(cycleNumber)}` : '';
  let breakdown: BreakdownPayload;
  try {
    breakdown = await apiRequest<BreakdownPayload>(
      `/api/budget/pod/${podId}/breakdown${query}`,
      { token },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { budgetCycle, components, result } = breakdown;
  const locked = budgetCycle.status === 'locked';

  // Approved corrections for this exact result row (13 §7): the original and
  // corrected figures appear side by side where the number is shown. Pairing by
  // the result row id keeps a correction from an earlier cycle away from a
  // later cycle's numbers.
  const approved = await apiRequestOrNull<CorrectionRecord[]>(
    `/api/hub/corrections?status=approved&entityType=budget_result&entityId=${result.id}`,
    { token },
  );
  const podCorrections = approved ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/budget/current-cycle" className="underline-offset-2 hover:underline">
          Budget Market
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-700">{breakdown.podName}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">
            {breakdown.podName} — full calculation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cycle {budgetCycle.cycleNumber} · calculated{' '}
            {budgetCycle.calculatedAt ? new Date(budgetCycle.calculatedAt).toUTCString() : '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {locked ? (
            <StatusChip tone="good" label="Final — locked" />
          ) : (
            <StatusChip tone="watch" label="Provisional — live estimate" />
          )}
          <BreakdownExport
            jsonHref={`/api/budget/pod/${podId}/breakdown${query}`}
            jsonFilename={`budget-cycle-${budgetCycle.cycleNumber}-${breakdown.podName}.json`}
          />
        </div>
      </header>

      {breakdown.financialWarning && (
        <div
          className="mb-5 rounded border border-status-alert/40 bg-surface-white px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-ink-950">{breakdown.financialWarning.detail}</p>
          <p className="mt-1 text-xs text-slate-500">
            Source: {breakdown.financialWarning.sourceSystem}
            {breakdown.financialWarning.fetchedAt
              ? ` · last successful sync ${new Date(breakdown.financialWarning.fetchedAt).toUTCString()}`
              : ' · never synced successfully'}
            . Stale data is never presented as current.
          </p>
        </div>
      )}

      <div className="rounded border border-line-200 bg-surface-white p-5">
        <p className="text-xs text-slate-500">
          {locked ? 'Unit Budget — final' : 'Unit Budget — provisional estimate'}
        </p>
        <p className="mt-1 font-display text-4xl tabular-nums text-ink-950">
          <CorrectedValue
            value={result.finalBudget}
            corrections={podCorrections}
            field="final_budget"
            format={money}
          />
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {result.shareOfPoolPercent}% of a {money(budgetCycle.totalPool)} pool · Unit Score{' '}
          <CorrectedValue
            value={result.unitScore}
            corrections={podCorrections}
            field="unit_score"
            format={(v) => String(v)}
          />
        </p>

        {breakdown.previousCycle && breakdown.delta !== null && (
          <p className="mt-3 flex flex-wrap items-baseline gap-2 text-sm">
            <span
              className="font-mono tabular-nums"
              style={{
                color:
                  breakdown.delta > 0
                    ? 'var(--color-status-good, #1E7A4C)'
                    : breakdown.delta < 0
                      ? 'var(--color-status-alert, #B23B3B)'
                      : 'var(--color-slate-500, #5B6672)',
              }}
            >
              {breakdown.delta > 0 ? '▲' : breakdown.delta < 0 ? '▼' : '·'}{' '}
              {Math.abs(breakdown.deltaPercent ?? 0)}%
            </span>
            <span className="text-slate-500">
              versus cycle {breakdown.previousCycle.cycleNumber} ({money(
                breakdown.previousCycle.finalBudget,
              )}
              , Unit Score {breakdown.previousCycle.unitScore})
            </span>
          </p>
        )}
      </div>

      {/* Steps 1–3: the three components, with the raw values behind each. */}
      <section className="mt-6" aria-labelledby="components-heading">
        <h2 id="components-heading" className="font-display text-xl text-ink-950">
          How each component score was derived
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ComponentSubBars
            components={components.map((component) => ({
              label: component.label,
              weight: component.weight,
              score: component.score,
              weightedContribution: component.weightedContribution,
              explanation: component.explanation,
              normalizationMethod: component.normalizationMethod,
              rawInputs: component.rawInputs,
              calculatedAt: component.calculatedAt,
              estimated: ['missing_input_midpoint', 'untagged_midpoint'].includes(
                component.normalizationMethod,
              ),
              reference: '15-BUSINESS-RULES-APPENDIX.md',
            }))}
          />
        </div>

        {/* The raw inputs, printed rather than hidden behind the popover: the
            breakdown screen is the audit surface, so the values belong on it. */}
        <div className="mt-4 space-y-3">
          {components.map((component) => (
            <details
              key={component.componentType}
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
                    <dd className="font-mono tabular-nums text-ink-950">{rawValue(value)}</dd>
                  </div>
                ))}
                {Object.keys(component.rawInputs).length === 0 && (
                  <p className="text-slate-500">No inputs were recorded for this component.</p>
                )}
              </dl>
            </details>
          ))}
        </div>
      </section>

      {/* Step 4: the arithmetic line itself. */}
      <section className="mt-6" aria-labelledby="arithmetic-heading">
        <h2 id="arithmetic-heading" className="font-display text-xl text-ink-950">
          The weighted sum
        </h2>
        <div className="mt-3 rounded border border-line-200 bg-surface-white p-4">
          <ArithmeticStrip
            clauses={components.map((component) => ({
              weight: component.weight / 100,
              score: component.score,
              label: component.label.toLowerCase(),
            }))}
            result={breakdown.unitScore}
            locked={locked}
          />
          <p className="mt-3 border-t border-line-200 pt-3 font-mono text-sm text-slate-500">
            {breakdown.arithmeticLine}
          </p>
        </div>
      </section>

      {/* Step 5: the pool math, with every adjustment as its own line. */}
      <section className="mt-6" aria-labelledby="pool-heading">
        <h2 id="pool-heading" className="font-display text-xl text-ink-950">
          From Unit Score to budget
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DataCard
            label="Total pool"
            value={money(budgetCycle.totalPool)}
            hint={`Cycle ${budgetCycle.cycleNumber}`}
            provenance={{ source: 'budget_cycle.total_pool' }}
          />
          <DataCard
            label="Reserved for Survival Budgets"
            value={money(budgetCycle.reservedForSurvival)}
            hint="Every pod's floor, before the formula"
            provenance={{
              source: 'Σ pod_budget_result.survival_budget',
              formula: 'one month of each pod’s fixed costs',
            }}
          />
          <DataCard
            label="Distributable pool"
            value={money(budgetCycle.distributablePool)}
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
              Every step between {breakdown.podName}&apos;s Unit Score and its final budget
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
                    {result.unitScore} ÷ Σ all Unit Scores × {money(budgetCycle.distributablePool)}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-950">
                  {money(result.rawBudgetShare)}
                </td>
              </tr>

              {breakdown.adjustmentLines.map((line) => (
                <tr key={line.label}>
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <span className="text-ink-950">{line.label}</span>
                    <span className="block text-xs text-slate-500">{line.note}</span>
                  </th>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-950">
                    {line.amount === 0 ? '—' : `${line.amount < 0 ? '−' : ''}${money(Math.abs(line.amount))}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-300">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  Final budget
                  <span className="block text-xs font-normal text-slate-500">
                    Survival Budget {money(result.survivalBudget)} + formula share{' '}
                    {money(result.formulaShare)}
                  </span>
                </th>
                <td className="px-4 py-3 text-right font-display text-xl tabular-nums text-ink-950">
                  <CorrectedValue
                    value={result.finalBudget}
                    corrections={podCorrections}
                    field="final_budget"
                    format={money}
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {result.capApplied && budgetCycle.capAmount !== null && (
          <p className="mt-3 text-sm text-slate-500">
            The ceiling for this cycle is {money(budgetCycle.capAmount)} (
            {Math.round(budgetCycle.capFraction * 100)}% of the pool). This pod&apos;s proportional
            share was {money(result.rawBudgetShare)}, so {money(result.capReduction)} was clipped and
            handed to the pods still under the ceiling.
          </p>
        )}
      </section>

      {locked && budgetCycle.auditHash && (
        <section className="mt-6 rounded border border-line-200 bg-surface-white px-4 py-3">
          <h2 className="text-sm text-ink-950">Immutability</h2>
          <p className="mt-1 text-sm text-slate-500">
            These numbers were locked and cannot be edited. Audit reference{' '}
            <span className="font-mono text-ink-950">{budgetCycle.auditHash}</span>. If a figure here
            is wrong, the correction arrives as a new record referring to this one — confirmed by two
            different people at the Architecture Hub — never as a quiet edit.
          </p>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/budget/current-cycle"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          Back to the cycle
        </Link>
        <Link
          href="/budget/history"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          Score and budget history
        </Link>
        <Link
          href="/budget/simulator"
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          Simulate a change
        </Link>
      </div>
    </div>
  );
}
