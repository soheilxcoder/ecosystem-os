/**
 * `/investor-portal` — the restricted investor surface (Module 09).
 *
 * Investors see exactly what the Strategic Interactions Hub has chosen to
 * publish, and nothing else: aggregated snapshots only. There is no drill-down
 * here by construction — the minimum-aggregation rule upstream guarantees no
 * report on this page can resolve to a single pod's operational detail.
 */

import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { InvestorReport } from '../../../lib/types-hub';

export const dynamic = 'force-dynamic';

function formatMoney(value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('en-US');
}

export default async function InvestorPortalPage() {
  const token = await getSessionToken();
  const reports = await apiRequestOrNull<InvestorReport[]>('/api/hub/strategic/reports', { token });

  if (!reports) {
    return (
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Investor Portal</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Published, aggregated updates.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Investor access required</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            This surface is limited to users holding an investor or Strategic Interactions seat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Investor Portal</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Read-only, aggregated snapshots. Reports are published by the Strategic Interactions Hub
          and always cover multiple pods.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Nothing published yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            The first aggregated report will appear here once it&apos;s published.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <article key={report.id} className="rounded border border-line-200 bg-surface-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg text-ink-950">
                  {report.dateFrom} → {report.dateTo}
                </h2>
                {report.publishedAt && (
                  <span className="text-2xs text-slate-500">
                    Published {report.publishedAt.slice(0, 10)}
                  </span>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">Active pods</dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {report.metrics.activePodCount ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">Past trial</dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {report.metrics.podsPastTrial ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">Discontinued</dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {report.metrics.podsDiscontinued ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">
                    Budget distributed
                  </dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {formatMoney(report.metrics.totalBudgetDistributed)}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">
                    Aggregate financial trend
                  </dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {report.metrics.aggregateFinancialTrend === null ||
                    report.metrics.aggregateFinancialTrend === undefined
                      ? '—'
                      : formatMoney(report.metrics.aggregateFinancialTrend)}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-wide text-slate-500">Pods in scope</dt>
                  <dd className="mt-0.5 font-display text-xl text-ink-950">
                    {report.metrics.podCountInScope ?? '—'}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 border-t border-line-100 pt-3 text-2xs text-slate-500">
                Aggregated across {report.metrics.podCountInScope ?? 'multiple'} pods. Pod-level
                operational detail is not exposed through this portal.
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
