/**
 * `/budget/simulator` — 05-MODULE-BUDGET-MARKET.md, screen 4.
 *
 * Read-only and sandboxed. The spec's purpose statement is the design brief:
 * "lets a Pod Lead answer 'if we improve our peer review score by 10 points,
 * roughly how much more budget would that mean?' without needing a spreadsheet
 * or a finance person."
 *
 * The sliders start from the pod's real current scores so the what-if is a
 * difference rather than an abstraction, and the denominator is every other pod's
 * real score — which is why the assumption has to be stated on screen rather
 * than left implied.
 */

import Link from 'next/link';

import { Simulator } from '../../../../components/budget/Simulator';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

interface OverviewPayload {
  budgetCycle: {
    cycleNumber: number;
    status: 'provisional' | 'locked';
    totalPool: number;
    capFraction: number;
  };
  results: Array<{ podId: string; podName: string; unitScore: number; finalBudget: number }>;
  components: Array<{
    podId: string;
    componentType: 'financial' | 'peer_review' | 'strategic';
    score: number;
  }>;
}

type PodsPayload = Array<{ id: string; name: string; status: string }>;

export default async function BudgetSimulatorPage() {
  const token = await getSessionToken();
  const [me, overview, podsResponse] = await Promise.all([
    apiRequestOrNull<ApiMe>('/api/me', { token }),
    apiRequestOrNull<OverviewPayload>('/api/budget/cycle/current', { token }),
    apiRequestOrNull<PodsPayload>('/api/pods', { token }),
  ]);

  const pods = (podsResponse ?? [])
    .filter((pod) => pod.status !== 'dissolved')
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!overview) {
    return (
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="font-display text-2xl text-ink-950">Budget simulator</h1>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Nothing to simulate against yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            The simulator re-runs the current cycle&apos;s real allocation with one pod&apos;s scores
            replaced, so it needs a calculated cycle to work from. The Architecture Hub runs the
            first calculation.
          </p>
          <Link
            href="/budget/current-cycle"
            className="mt-4 inline-block rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
          >
            Back to the current cycle
          </Link>
        </div>
      </div>
    );
  }

  const { budgetCycle, results, components } = overview;

  const currentScores: Record<
    string,
    { financial: number; peer_review: number; strategic: number }
  > = {};
  for (const result of results) {
    currentScores[result.podId] = { financial: 50, peer_review: 50, strategic: 50 };
  }
  for (const component of components) {
    const entry = currentScores[component.podId];
    if (entry) entry[component.componentType] = component.score;
  }

  // Only pods that actually took part in this allocation can be simulated: a
  // dissolved or newly created pod has no share to vary.
  const participating = pods.filter((pod) => currentScores[pod.id] !== undefined);
  const myPodId = (me?.pods ?? []).find((pod) => currentScores[pod.id] !== undefined)?.id ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/budget/current-cycle" className="underline-offset-2 hover:underline">
          Budget Market
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-700">Simulator</span>
      </nav>

      <header className="mb-5">
        <h1 className="font-display text-2xl text-ink-950">Budget simulator</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Cycle {budgetCycle.cycleNumber} · pool of{' '}
          {budgetCycle.totalPool.toLocaleString('en-US')} · ceiling{' '}
          {Math.round(budgetCycle.capFraction * 100)}% · {participating.length} pods
        </p>
      </header>

      {participating.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center text-sm text-slate-500">
          No pod took part in the current allocation, so there is nothing to vary.
        </div>
      ) : (
        <div className="rounded border border-line-200 bg-surface-white p-5">
          <Simulator
            pods={participating.map((pod) => ({ id: pod.id, name: pod.name }))}
            defaultPodId={myPodId}
            currentScores={currentScores}
          />
        </div>
      )}

      <section className="mt-5 rounded border border-line-200 bg-surface-white p-4 text-sm text-slate-500">
        <h2 className="font-display text-base text-ink-950">What this calculation does</h2>
        <p className="mt-1">
          It replaces one pod&apos;s three component scores with the slider values, recomputes that
          pod&apos;s Unit Score with the same weights the real cycle used, and re-runs the whole
          allocation — including the survival floor and the ceiling — with every other pod&apos;s
          real score unchanged as the denominator.
        </p>
        <p className="mt-2">
          Because the ceiling redistributes clipped excess to the pods still under it, a gain here is
          not always linear: past a certain score the extra is clipped and handed to other pods. When
          that happens the result says so.
        </p>
      </section>
    </div>
  );
}
