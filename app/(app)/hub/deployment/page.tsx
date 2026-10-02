/**
 * `/hub/deployment` — the Deployment Hub's default view (Module 09).
 *
 * The trial status tracker: every pod currently in `trial`, counting down to
 * its Day-90 decision, with the selection-checklist completion pulled live
 * from the Entry Trial's criteria. The "Open Entry Tracker" deep link hands
 * off to Module 08 — the decision itself is recorded there, not here.
 */

import Link from 'next/link';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { TrialStatusRow } from '../../../../lib/types-hub';
import { StatusChip } from '../../../../components/ui/StatusChip';

export const dynamic = 'force-dynamic';

export default async function DeploymentHubPage() {
  const token = await getSessionToken();
  const trials = await apiRequestOrNull<TrialStatusRow[]>('/api/hub/deployment/trials', { token });

  if (!trials) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Deployment Hub</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            New units launch here; trials are tracked here.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Deployment Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Sign in with a Deployment or Architecture Hub seat to launch units and track entry
            trials.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Deployment Hub</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            {trials.length === 0
              ? 'No pods are in trial right now.'
              : `${trials.length} pod(s) counting down to their Day-90 decision.`}
          </p>
        </div>
        <Link
          href="/hub/deployment/new"
          className="rounded bg-ink-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800"
        >
          New pod / unit →
        </Link>
      </header>

      {trials.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">All units past trial</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Launch a new pod with the wizard and it will appear here with its 90-day countdown
            from day one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-line-200 bg-surface-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line-200 text-2xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Pod</th>
                <th className="px-4 py-2.5 font-medium">Holding</th>
                <th className="px-4 py-2.5 font-medium">Decision due</th>
                <th className="px-4 py-2.5 font-medium">Checklist</th>
                <th className="px-4 py-2.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {trials.map((trial) => {
                const urgent = trial.daysRemaining !== null && trial.daysRemaining <= 14;
                return (
                  <tr key={trial.podId} className="border-b border-line-100 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink-950">{trial.podName}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{trial.holdingName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {trial.decisionDueDate ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-ink-950">{trial.decisionDueDate}</span>
                          <StatusChip
                            tone={urgent ? 'alert' : 'neutral'}
                            label={
                              trial.daysRemaining === null
                                ? '—'
                                : trial.daysRemaining < 0
                                  ? `${-trial.daysRemaining}d overdue`
                                  : `${trial.daysRemaining}d left`
                            }
                          />
                        </span>
                      ) : (
                        <span className="text-slate-500">No trial started</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded bg-paper-100">
                          <div
                            className="h-full rounded bg-ink-700"
                            style={{ width: `${trial.completionPercent}%` }}
                          />
                        </div>
                        <span className="text-2xs text-slate-500">
                          {trial.criteriaMet}/{trial.criteriaTotal} · {trial.completionPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/review/entry/${trial.podId}`}
                        className="text-xs font-medium text-ink-700 underline-offset-2 hover:underline"
                      >
                        Open Entry Tracker →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 max-w-prose text-2xs text-slate-500">
        The wizard is the system&apos;s only pod-creation path — every pod listed here already has
        membership, a coach and an entry trial, assigned at launch.
      </p>
    </div>
  );
}
