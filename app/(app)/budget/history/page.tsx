/**
 * `/budget/history` — 05-MODULE-BUDGET-MARKET.md, screen 3.
 *
 * "Table: cycle number, dates, this pod's score, this pod's budget, org-wide
 * total pool that cycle. Line chart: this pod's score trend over time, with the
 * three component sub-scores as an optional stacked/overlaid view. Filter:
 * compare against another pod — available to any user, reinforcing
 * organization-wide transparency."
 *
 * The comparison control is deliberately available to everybody rather than
 * gated to a hub role. A pod being able to see why another pod's budget moved is
 * the mechanism that replaced managerial oversight, so hiding it behind a
 * permission would remove the thing the module is for.
 */

import Link from 'next/link';

import { PodCompareForm } from '../../../../components/budget/PodCompareForm';
import { ScoreTrend } from '../../../../components/budget/ScoreTrend';
import { WideScreenNotice } from '../../../../components/layout/WideScreenNotice';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

interface HistoryRow {
  cycleNumber: number;
  status: 'provisional' | 'locked';
  totalPool: number;
  unitScore: number | null;
  finalBudget: number | null;
  components: Partial<Record<'financial' | 'peer_review' | 'strategic', number>>;
  lockedAt: string | null;
}

type PodsPayload = Array<{ id: string; name: string; status: string; holdingName: string | null }>;

const money = (amount: number | null | undefined): string =>
  Math.round(amount ?? 0).toLocaleString('en-US');

export default async function BudgetHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ podId?: string; compare?: string; overlay?: string }>;
}) {
  const { podId, compare, overlay } = await searchParams;
  const token = await getSessionToken();

  const [me, podsResponse] = await Promise.all([
    apiRequestOrNull<ApiMe>('/api/me', { token }),
    apiRequestOrNull<PodsPayload>('/api/pods', { token }),
  ]);

  const pods = (podsResponse ?? [])
    .filter((pod) => pod.status !== 'dissolved')
    .sort((a, b) => a.name.localeCompare(b.name));

  // Default to the viewer's own pod: history is first a question about "us",
  // and the comparison control is there for the second question.
  const selectedPodId =
    podId ?? (me?.pods ?? [])[0]?.id ?? pods[0]?.id ?? null;
  const comparePodId = compare && compare !== selectedPodId ? compare : null;
  const overlayComponents = overlay !== 'off';

  const [primary, secondary] = await Promise.all([
    selectedPodId
      ? apiRequestOrNull<{ podId: string; orgId: string; rows: HistoryRow[] }>(
          `/api/budget/history?podId=${selectedPodId}`,
          { token },
        )
      : Promise.resolve(null),
    comparePodId
      ? apiRequestOrNull<{ podId: string; orgId: string; rows: HistoryRow[] }>(
          `/api/budget/history?podId=${comparePodId}`,
          { token },
        )
      : Promise.resolve(null),
  ]);

  const rows = primary?.rows ?? [];
  const compareRows = secondary?.rows ?? [];
  const podName = pods.find((pod) => pod.id === selectedPodId)?.name ?? 'this pod';
  const compareName = pods.find((pod) => pod.id === comparePodId)?.name ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/budget/current-cycle" className="underline-offset-2 hover:underline">
          Budget Market
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-700">History</span>
      </nav>

      <WideScreenNotice surface="The budget history table" />

      <header className="mb-5">
        <h1 className="font-display text-2xl text-ink-950">Score and budget history</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          How {podName}&apos;s Unit Score and budget have moved across cycles, and what moved them.
        </p>
      </header>

      <PodCompareForm
        pods={pods.map((pod) => ({ id: pod.id, name: pod.name }))}
        selectedPodId={selectedPodId}
        comparePodId={comparePodId}
        overlayComponents={overlayComponents}
      />

      {rows.length === 0 ? (
        <div className="mt-5 rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">No calculated cycles yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            The trend appears once the Architecture Hub has run a calculation. A single cycle shows
            as one point; the line becomes meaningful from the second cycle onward.
          </p>
        </div>
      ) : (
        <>
          <section
            className="mt-5 rounded border border-line-200 bg-surface-white p-4"
            aria-labelledby="trend-heading"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="trend-heading" className="font-display text-lg text-ink-950">
                Unit Score trend
              </h2>
              <Link
                href={{
                  pathname: '/budget/history',
                  query: {
                    podId: selectedPodId ?? undefined,
                    compare: comparePodId ?? undefined,
                    overlay: overlayComponents ? 'off' : 'on',
                  },
                }}
                className="text-sm text-signal-600 underline-offset-2 hover:underline"
              >
                {overlayComponents ? 'Hide component scores' : 'Show component scores'}
              </Link>
            </div>

            <ScoreTrend
              className="mt-3"
              overlayComponents={overlayComponents}
              points={rows.map((row) => ({
                cycleNumber: row.cycleNumber,
                unitScore: row.unitScore,
                finalBudget: row.finalBudget,
                components: row.components,
                status: row.status,
              }))}
            />

            {compareName && compareRows.length > 0 && (
              <>
                <h3 className="mt-6 font-display text-base text-ink-950">
                  Compared with {compareName}
                </h3>
                <ScoreTrend
                  className="mt-3"
                  overlayComponents={overlayComponents}
                  points={compareRows.map((row) => ({
                    cycleNumber: row.cycleNumber,
                    unitScore: row.unitScore,
                    finalBudget: row.finalBudget,
                    components: row.components,
                    status: row.status,
                  }))}
                />
              </>
            )}
          </section>

          <section className="mt-5" aria-labelledby="table-heading">
            <h2 id="table-heading" className="font-display text-lg text-ink-950">
              Every cycle
            </h2>
            <div className="mt-3 overflow-x-auto rounded border border-line-200 bg-surface-white">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {podName}&apos;s Unit Score, budget and the organisation-wide pool for each
                  calculated cycle
                  {compareName ? `, alongside ${compareName}` : ''}
                </caption>
                <thead>
                  <tr className="border-b border-line-200 text-left text-xs text-slate-500">
                    <th scope="col" className="px-3 py-2 font-medium">Cycle</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Unit Score</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Financial</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Peer</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Strategic</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Budget</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Org pool</th>
                    {compareName && (
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {compareName}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-200">
                  {rows.map((row) => {
                    const counterpart = compareRows.find(
                      (other) => other.cycleNumber === row.cycleNumber,
                    );
                    return (
                      <tr key={row.cycleNumber} className="hover:bg-paper-100">
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          <Link
                            href={`/budget/${selectedPodId}/breakdown?cycleNumber=${row.cycleNumber}`}
                            className="text-ink-950 underline-offset-2 hover:underline"
                          >
                            {row.cycleNumber}
                          </Link>
                        </th>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {row.status === 'locked' ? 'locked' : 'provisional'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {row.unitScore ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                          {row.components.financial ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                          {row.components.peer_review ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                          {row.components.strategic ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-ink-950">
                          {row.finalBudget === null ? '—' : money(row.finalBudget)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                          {money(row.totalPool)}
                        </td>
                        {compareName && (
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                            {counterpart?.finalBudget === null || counterpart === undefined
                              ? '—'
                              : money(counterpart.finalBudget)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A provisional cycle&apos;s figures move until it locks on Day 90. Only locked cycles are
              announced numbers.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
