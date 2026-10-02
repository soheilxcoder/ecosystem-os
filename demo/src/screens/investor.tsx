/**
 * Investor view — the Strategic Hub's published report, as an investor sees
 * it: holdings, the cycle's headline numbers and the published documents.
 */
import Link from '../shims/link';
import { DataCard } from '../../../components/ui/DataCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { HOLDINGS, PODS, TOTAL_POOL, money } from '../data';

export function InvestorScreen() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Investor reporting</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Investors see what the Strategic Interactions Hub publishes — never raw coaching notes or
          draft scores. This is the Q3 report for Holding Pars.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DataCard
          label="Cycle 3 pool"
          value={money(TOTAL_POOL)}
          tone="active"
          hint="Set by the Architecture Hub, divided by formula."
        />
        <DataCard
          label="Pods in Holding Pars"
          value={PODS.filter((p) => p.holdingName === 'Holding Pars').length}
          tone="neutral"
          hint="Atlas, Basalt and Cinder."
        />
        <DataCard
          label="Average Unit Score"
          value={70.9}
          tone="good"
          hint="Across the five pods, up from 68.4 in cycle 2."
        />
        <DataCard
          label="Days of cycle left"
          value={28}
          tone="neutral"
          hint="Results announced Days 89–90."
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">Your holdings</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          {HOLDINGS.map((holding) => {
            const pods = PODS.filter((p) => p.holdingName === holding.name);
            return (
              <li key={holding.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">
                    {holding.name} ({holding.code})
                  </span>
                  <span className="block text-xs text-slate-500">
                    {pods.length} pods ·{' '}
                    {money(pods.reduce((sum, pod) => sum + pod.finalBudget, 0))} provisional
                  </span>
                </span>
                <StatusChip tone="good" label="Reporting current" />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-ink-700">Published reports</h2>
        <ul className="divide-y divide-line-200 border border-line-200 bg-white">
          <li className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink-950">Q3 2026 — Holding Pars</span>
              <span className="block text-xs text-slate-500">Published 2026-09-15 · Strategic Hub</span>
            </span>
            <StatusChip tone="good" label="Published" />
          </li>
          <li className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink-950">Q4 2026 — Holding Pars</span>
              <span className="block text-xs text-slate-500">In draft · not visible to investors yet</span>
            </span>
            <StatusChip tone="watch" label="Draft" />
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Full calculation behind these numbers:{' '}
          <Link href="/budget" className="text-signal-600 underline">
            Budget Market
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
