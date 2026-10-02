/**
 * `/hub/pilots/[pilotId]` — one pilot program, end to end (Module 09).
 *
 * Mirrors the source model's two-part pilot process exactly: eight prep weeks
 * in four phases, one 90-day sprint, then the post-Day-90 decision. Each
 * phase row carries its owner and status; the success-criteria panel tracks
 * the three source-defined measures; the decision recorder enforces who may
 * choose what (expand belongs to the holding executive — the API is the
 * referee, the UI just doesn't overpromise).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type {
  PilotPhase,
  PilotProgram,
} from '../../../../../lib/types-hub';
import { PILOT_PHASE_LABELS, PILOT_PHASE_ORDER } from '../../../../../lib/types-hub';
import { StatusChip } from '../../../../../components/ui/StatusChip';
import {
  CriteriaForm,
  DecisionForm,
  PhaseRowForm,
  SetCurrentPhaseForm,
} from '../../../../../components/hub/PilotForms';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

const STATUS_TONE: Record<string, 'neutral' | 'active' | 'good'> = {
  not_started: 'neutral',
  in_progress: 'active',
  done: 'good',
};

export default async function PilotDetailPage({
  params,
}: {
  params: Promise<{ pilotId: string }>;
}) {
  const { pilotId } = await params;
  const token = await getSessionToken();

  const pilot = await apiRequestOrNull<PilotProgram>(`/api/hub/pilots/${pilotId}`, { token });
  if (!pilot) {
    notFound();
  }

  const decided = pilot.decision !== null;
  const phaseOptions = PILOT_PHASE_ORDER.map((phase) => ({
    value: phase,
    label: PILOT_PHASE_LABELS[phase],
  }));

  const doneCount = PILOT_PHASE_ORDER.filter(
    (phase) => pilot.phaseStatus[phase]?.status === 'done',
  ).length;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <Link href="/hub/pilots" className="text-xs text-ink-700 underline-offset-2 hover:underline">
          ← All pilots
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl text-ink-950">{pilot.name}</h1>
          {pilot.decision ? (
            <StatusChip
              tone={pilot.decision === 'expand' ? 'good' : 'neutral'}
              label={`decision: ${pilot.decision}`}
            />
          ) : (
            <StatusChip tone="active" label={`${doneCount}/6 phases done`} />
          )}
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Eight prep weeks, one 90-day sprint, one decision — tracked phase by phase with named
          owners.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Phase timeline */}
        <section className="lg:col-span-3" aria-labelledby="phases-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="phases-heading" className="font-display text-lg text-ink-950">
              Timeline
            </h2>
            <SetCurrentPhaseForm
              pilotId={pilot.id}
              phases={phaseOptions}
              currentPhase={pilot.currentPhase}
              disabled={decided}
            />
          </div>
          <div className="mt-3 space-y-2">
            {PILOT_PHASE_ORDER.map((phase: PilotPhase, index) => {
              const state = pilot.phaseStatus[phase];
              const isCurrent = pilot.currentPhase === phase;
              return (
                <div
                  key={phase}
                  className={`rounded border bg-surface-white p-3 ${
                    isCurrent && !decided ? 'border-ink-950' : 'border-line-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-950">
                      <span className="mr-2 text-2xs text-slate-500">{index + 1}.</span>
                      {PILOT_PHASE_LABELS[phase]}
                    </h3>
                    <StatusChip
                      tone={STATUS_TONE[state?.status ?? 'not_started'] ?? 'neutral'}
                      label={STATUS_LABEL[state?.status ?? 'not_started'] ?? 'Not started'}
                    />
                  </div>
                  {phase === 'sprint' && pilot.pilotPodId && (
                    <Link
                      href={`/calendar/pod/${pilot.pilotPodId}`}
                      className="mt-1 inline-block text-2xs text-ink-700 underline-offset-2 hover:underline"
                    >
                      Follow the sprint in the pod&apos;s calendar →
                    </Link>
                  )}
                  <div className="mt-2">
                    <PhaseRowForm pilotId={pilot.id} phase={phase} state={state} disabled={decided} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Criteria + decision */}
        <div className="space-y-8 lg:col-span-2">
          <section aria-labelledby="criteria-heading" className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="criteria-heading" className="font-display text-lg text-ink-950">
              Success criteria
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              The three source-defined measures. Baselines go in before the sprint; current values
              fill in as it runs.
            </p>
            <div className="mt-3">
              <CriteriaForm pilotId={pilot.id} criteria={pilot.successCriteria} disabled={decided} />
            </div>
          </section>

          <section aria-labelledby="decision-heading" className="rounded border border-line-200 bg-surface-white p-4">
            <h2 id="decision-heading" className="font-display text-lg text-ink-950">
              Post-Day-90 decision
            </h2>
            {decided ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-ink-950">
                  Decision recorded: <span className="font-medium">{pilot.decision}</span>
                  {pilot.decidedAt && (
                    <span className="text-slate-500"> on {pilot.decidedAt.slice(0, 10)}</span>
                  )}
                </p>
                {pilot.lessonsLearned && (
                  <p className="rounded border border-line-200 bg-paper-100 px-3 py-2 text-xs text-ink-950">
                    {pilot.lessonsLearned}
                  </p>
                )}
                {pilot.decision === 'expand' && (
                  <Link
                    href={`/hub/deployment/new?pilot=${pilot.id}`}
                    className="inline-block rounded bg-ink-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
                  >
                    Open the pre-filled next-unit wizard →
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <DecisionForm pilotId={pilot.id} hasUnit={pilot.pilotPodId !== null} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
