/**
 * `/review/entry/:podId` — the 90-Day Entry Rule tracker (Section 14 logic).
 *
 * Deliberately *not* a stage machine. There is one bar, Day 0 → Day 90, and one
 * decision that needs both sides: the pod's representative and the Deployment
 * Hub. A single "do not continue" ends the unit immediately, and the page says
 * so in the spec's own words — no correction period applies.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../../components/ui/StatusChip';
import { EntryDecisionForm, TrialCriteriaForm } from '../../../../../components/review/ReviewForms';
import {
  EntryTrialBar,
  TrackCrossReference,
} from '../../../../../components/review/TrackViews';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type { ApiMe } from '../../../../../lib/types';
import {
  ENTRY_RESULT_COPY,
  RECOMMENDATION_COPY,
  type EntryTrialView,
} from '../../../../../lib/governance';
import { formatShortDate } from '../../../../../core/time';

export const dynamic = 'force-dynamic';

function CriterionChip({ met }: { met: boolean | null }) {
  if (met === null) return <StatusChip tone="neutral" label="N/A" />;
  return <StatusChip tone={met ? 'good' : 'watch'} label={met ? 'Met' : 'Not yet'} />;
}

export default async function EntryTrialPage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const token = await getSessionToken();
  const [view, me] = await Promise.all([
    apiRequestOrNull<EntryTrialView>(`/api/review/entry/${podId}`, { token }),
    apiRequestOrNull<ApiMe>('/api/me', { token }),
  ]);

  if (!view) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink-950">90-Day Entry Rule</h1>
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          This screen is available to the Deployment Hub and the pod&apos;s own lead. Start the API
          with <code>npm run dev:api</code> if it is not running.
        </p>
      </div>
    );
  }

  if (!view.trial) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink-950">{view.podName} — 90-Day Entry Rule</h1>
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          No entry trial has been started for this pod. A trial unit gets one the day it is
          deployed, and one 90-day decision at the end of it.
        </p>
      </div>
    );
  }

  const trial = view.trial;
  const viewerId = me?.user?.id;
  const isPodRep = trial.podRepUserId !== null && trial.podRepUserId === viewerId;
  const isHubRep = trial.deploymentHubUserId !== null && trial.deploymentHubUserId === viewerId;
  const decided = trial.finalResult !== null;

  return (
    <div>
      <Link href="/review" className="text-sm text-slate-500 underline">
        ← Governance
      </Link>

      <TrackCrossReference
        track={view.crossReference.track}
        label={view.crossReference.label}
        href={view.crossReference.href}
      />

      <h1 className="font-display text-2xl text-ink-950">
        {view.podName} — 90-Day Entry Rule
      </h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        A straight line from Day 0 to Day 90. There are no correction stages in between: at Day 90
        the pod&apos;s representative and the Deployment Hub each record a recommendation, and the
        unit continues only if both want it to.
      </p>

      <div className="mt-4">
        <EntryTrialBar view={view} />
      </div>

      {decided ? (
        <p
          role="status"
          className={`mt-4 border-l-2 px-4 py-3 text-sm ${
            trial.finalResult === 'full_entry'
              ? 'border-status-good bg-green-50 text-ink-950'
              : 'border-status-alert bg-red-50 text-ink-950'
          }`}
        >
          {ENTRY_RESULT_COPY[trial.finalResult!]}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="border border-line-200 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">The two recommendations</h2>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Neither one alone decides anything. Both must say “join fully”.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500">Pod representative</dt>
              <dd>
                {view.podRep.recommendation ? (
                  <StatusChip
                    tone={view.podRep.recommendation === 'join' ? 'good' : 'alert'}
                    label={RECOMMENDATION_COPY[view.podRep.recommendation]}
                  />
                ) : (
                  <span className="text-slate-400">Not recorded</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500">Deployment Hub</dt>
              <dd>
                {view.hubRep.recommendation ? (
                  <StatusChip
                    tone={view.hubRep.recommendation === 'join' ? 'good' : 'alert'}
                    label={RECOMMENDATION_COPY[view.hubRep.recommendation]}
                  />
                ) : (
                  <span className="text-slate-400">Not recorded</span>
                )}
              </dd>
            </div>
          </dl>

          {!decided && view.jointResult === null && view.podRep.recommendation && view.hubRep.recommendation ? null : null}

          {isPodRep || isHubRep ? (
            <div className="mt-4 space-y-4">
              {isPodRep ? (
                <EntryDecisionForm
                  podId={view.podId}
                  side="pod"
                  sideLabel="Your recommendation as the pod’s representative"
                  unlocked={view.decisionUnlocked && !decided}
                  current={view.podRep.recommendation}
                />
              ) : null}
              {isHubRep ? (
                <EntryDecisionForm
                  podId={view.podId}
                  side="hub"
                  sideLabel="Your recommendation for the Deployment Hub"
                  unlocked={view.decisionUnlocked && !decided}
                  current={view.hubRep.recommendation}
                />
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Only the pod&apos;s current lead and the Deployment Hub record a recommendation here.
            </p>
          )}
        </section>

        <section className="border border-line-200 bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Entry criteria</h2>
          {view.progress ? (
            <p className="tabular mt-1 text-sm text-slate-500">
              {view.progress.met} met · {view.progress.outstanding} outstanding ·{' '}
              {view.progress.notApplicable} N/A
            </p>
          ) : null}

          {trial.criteria.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No criteria recorded yet. The Deployment Hub defines what “fits the model and creates
              real value” means for this unit.
            </p>
          ) : (
            <ul className="mt-3">
              {trial.criteria.map((criterion, index) => (
                <li
                  key={`${criterion.label}-${index}`}
                  className="flex items-center justify-between gap-2 border-b border-line-100 py-2 last:border-b-0"
                >
                  <span className="text-sm text-ink-700">{criterion.label}</span>
                  <CriterionChip met={criterion.met} />
                </li>
              ))}
            </ul>
          )}

          {isHubRep && !decided ? (
            <div className="mt-4">
              <TrialCriteriaForm podId={view.podId} criteria={trial.criteria} />
            </div>
          ) : null}
        </section>
      </div>

      {decided ? (
        <p className="mt-6 text-sm text-slate-500">
          Decided {trial.decidedAt ? formatShortDate(trial.decidedAt.slice(0, 10)) : ''} — this
          record is immutable. A correction would be a new record referencing this one, never an
          edit.
        </p>
      ) : null}
    </div>
  );
}
