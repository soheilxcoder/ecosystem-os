/**
 * `/review/accountability/:podId` — the Accountability & Dissolution Path
 * tracker (Section 17 logic).
 *
 * Four sequential stages, ending in a panel vote. Every difference from the
 * Entry Rule screen is intentional: this track is gradual, has a 30-day
 * correction period with intensive coach support, and its decision is made by a
 * panel of at least three people — never by one person.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../../components/ui/StatusChip';
import { AdvanceStageForm, PanelVoteForm } from '../../../../../components/review/ReviewForms';
import {
  PanelVoteTable,
  StageRail,
  TrackCrossReference,
} from '../../../../../components/review/TrackViews';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type { ApiMe } from '../../../../../lib/types';
import { ACCOUNTABILITY_RESULT_COPY, type AccountabilityView } from '../../../../../lib/governance';
import { formatShortDate } from '../../../../../core/time';

export const dynamic = 'force-dynamic';

export default async function AccountabilityPage({
  params,
}: {
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;
  const token = await getSessionToken();
  const [view, me] = await Promise.all([
    apiRequestOrNull<AccountabilityView>(`/api/review/accountability/${podId}`, { token }),
    apiRequestOrNull<ApiMe>('/api/me', { token }),
  ]);

  if (!view) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink-950">Accountability Path</h1>
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          This screen is available to the pods&apos; coaches and to the Deployment Hub. Start the API
          with <code>npm run dev:api</code> if it is not running.
        </p>
      </div>
    );
  }

  const viewerId = me?.user?.id;
  const isCoachOrHub = (me?.roles ?? []).some(
    (role) => role.roleType === 'coach' || role.roleType === 'hub_deployment',
  );
  const myVote = view.panel.find((member) => member.userId === viewerId) ?? null;
  const decided = view.case_?.finalResult ?? null;
  const hasCase = view.case_ !== null;

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
        {view.podName} — Accountability &amp; Dissolution Path
      </h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Four sequential stages. Stage 1 is always true for everyone — the dashboards and budget
        numbers are already public. Stage 4 ends in a panel vote, not a manager&apos;s decision.
      </p>

      {!hasCase ? (
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          No accountability case is open for this pod. A case opens when the pod crosses the
          org-configured performance threshold, or when a coach or the Deployment Hub opens one.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <StageRail view={view} />
          </div>

          {view.case_?.stage2TriggeredAt ? (
            <p role="status" className="mt-4 border border-line-200 bg-white px-4 py-3 text-sm text-ink-700">
              Stage 2 is in force: the credibility and profit-share reduction was written as a
              visible adjustment in the budget calculation
              {view.case_?.reductionApplied ? ' and is tracked there' : ''}. It is not an
              off-the-books cut.
            </p>
          ) : null}

          {view.stage === 'correction_period' && view.case_?.correctionEndDate ? (
            <p role="status" className="mt-4 border border-line-200 bg-white px-4 py-3 text-sm text-ink-700">
              Correction period: {formatShortDate(view.case_.correctionStartDate!)} –{' '}
              {formatShortDate(view.case_.correctionEndDate)} ·{' '}
              <span className="tabular">{view.case_.correctionDaysRemaining}</span> day(s) left, with
              intensive coach support. The panel votes when it ends.
            </p>
          ) : null}

          {decided ? (
            <p
              role="status"
              className={`mt-4 border-l-2 px-4 py-3 text-sm ${
                decided === 'continue'
                  ? 'border-status-good bg-green-50 text-ink-950'
                  : 'border-status-alert bg-red-50 text-ink-950'
              }`}
            >
              {ACCOUNTABILITY_RESULT_COPY[decided]}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-lg text-ink-950">Panel vote</h2>
              <div className="mt-3">
                <PanelVoteTable view={view} />
              </div>

              {myVote && myVote.vote === null && !decided ? (
                <div className="mt-4">
                  <div className="mb-2 border border-line-200 bg-signal-50 px-3 py-2">
                    <p className="text-sm text-ink-950">
                      You are on this panel as {myVote.roleLabel}.
                    </p>
                  </div>
                  <PanelVoteForm podId={view.podId} />
                </div>
              ) : null}

              {myVote && myVote.vote !== null ? (
                <p role="status" className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
                  You voted “{myVote.vote === 'continue' ? 'Continue' : 'Dissolve'}”. A cast vote
                  cannot be changed.
                </p>
              ) : null}

              {!myVote && !decided && view.stage === 'correction_period' ? (
                <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
                  You are not on this panel. The panel is made up of other pods&apos; leads and a
                  Deployment Hub representative — never the pod under review.
                </p>
              ) : null}
            </div>

            <div>
              <h2 className="font-display text-lg text-ink-950">Moving between stages</h2>
              <p className="mt-1 max-w-prose text-sm text-slate-500">
                Stages are sequential in both directions: no skipping ahead, and stepping back is how
                a pod earns its way out.
              </p>

              {isCoachOrHub && !decided && view.nextStage ? (
                <div className="mt-3">
                  <AdvanceStageForm
                    podId={view.podId}
                    to={view.nextStage}
                    label={view.stages.find((stage) => stage.key === view.nextStage)?.label ?? view.nextStage}
                  />
                </div>
              ) : null}

              <dl className="mt-3 border border-line-200 bg-white p-4 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Stage 2 threshold</dt>
                  <dd className="tabular">
                    {view.settings.accountabilityStage2ScoreThreshold === null
                      ? 'Not configured'
                      : `below ${view.settings.accountabilityStage2ScoreThreshold}`}
                  </dd>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Panel size</dt>
                  <dd className="tabular">{view.settings.accountabilityPanelSize}</dd>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Correction period</dt>
                  <dd className="tabular">{view.settings.accountabilityCorrectionDays} days</dd>
                </div>
              </dl>

              {view.case_?.openedAt ? (
                <p className="mt-3 text-xs text-slate-500">
                  Case opened {formatShortDate(view.case_.openedAt.slice(0, 10))}
                  {view.case_?.decidedAt
                    ? ` · decided ${formatShortDate(view.case_.decidedAt.slice(0, 10))}, immutably`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}

      {!hasCase && isCoachOrHub ? (
        <p className="mt-4 text-sm text-slate-500">
          A coach or the Deployment Hub can open a case for an established pod — a pod still in trial
          status follows the 90-Day Entry Rule instead, and the database refuses to put it here.
        </p>
      ) : null}

      <div className="mt-6">
        <StatusChip
          tone={decided === 'dissolve' ? 'alert' : decided === 'continue' ? 'good' : 'watch'}
          label={decided ? `Decided: ${decided}` : `Stage: ${view.currentStageLabel}`}
        />
      </div>
    </div>
  );
}
