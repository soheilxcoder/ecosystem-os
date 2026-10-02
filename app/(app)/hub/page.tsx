/**
 * `/hub` — the Strategic Hub Console front door (Module 09).
 *
 * Four hubs, one console — and a console that is deliberately NOT a general
 * admin override. Each card below links to exactly the surface the source
 * model assigns to that hub, with live counts so the state is visible before
 * you click. Sections the signed-in seat cannot open simply do not render
 * data they are not entitled to.
 */

import Link from 'next/link';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type {
  InvestorReport,
  ModelHealth,
  PilotProgram,
  TrialStatusRow,
} from '../../../lib/types-hub';
import { StatusChip } from '../../../components/ui/StatusChip';
import { IconArrowRight } from '../../../components/ui/icons';
import { WideScreenNotice } from '../../../components/layout/WideScreenNotice';

export const dynamic = 'force-dynamic';

export default async function HubConsolePage() {
  const token = await getSessionToken();
  const [trials, pilots, health, reports] = await Promise.all([
    apiRequestOrNull<TrialStatusRow[]>('/api/hub/deployment/trials', { token }),
    apiRequestOrNull<PilotProgram[]>('/api/hub/pilots', { token }),
    apiRequestOrNull<ModelHealth>('/api/hub/architecture/model-health', { token }),
    apiRequestOrNull<InvestorReport[]>('/api/hub/strategic/reports', { token }),
  ]);

  const trialRows = trials;
  const pilotRows = pilots;
  const healthData = health;
  const reportRows = reports;

  const hasAnyAccess = trialRows !== null || pilotRows !== null || healthData !== null || reportRows !== null;

  if (!hasAnyAccess) {
    return (
    <div className="mx-auto max-w-6xl">
      <WideScreenNotice surface="The Hub Console" />
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Hub Console</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Company X&apos;s four hubs, one surface.
        </p>
      </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Company X seats only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            The console is scoped to the Architecture, Deployment, Coaching and Strategic
            Interactions hubs. Pod members see everything the platform makes public — just not
            through this door.
          </p>
        </div>
      </div>
    );
  }

  const undecidedPilots = (pilotRows ?? []).filter((p) => p.decision === null);
  const draftReports = (reportRows ?? []).filter((r) => !r.published);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Hub Console</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Company X&apos;s four hubs. This console launches, tracks and reports — it never edits a
          pod&apos;s score, budget or governance outcome.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Architecture hub */}
        <Link
          href="/hub/architecture"
          className="group rounded border border-line-200 bg-surface-white p-4 transition hover:border-line-300"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Architecture Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 transition group-hover:text-ink-950" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Rule versioning and the model&apos;s health — what governs, and what is about to change.
          </p>
          {healthData && (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip tone="neutral" label={`${healthData.activeRuleCount} versioned rules`} />
              <StatusChip
                tone={healthData.pendingChangeCount > 0 ? 'watch' : 'good'}
                label={
                  healthData.pendingChangeCount > 0
                    ? `${healthData.pendingChangeCount} pending change(s)`
                    : 'No pending changes'
                }
              />
            </div>
          )}
        </Link>

        {/* Deployment hub */}
        <Link
          href="/hub/deployment"
          className="group rounded border border-line-200 bg-surface-white p-4 transition hover:border-line-300"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Deployment Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 transition group-hover:text-ink-950" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The only door new pods come through — and the trial tracker that follows each one to
            Day 90.
          </p>
          {trialRows && (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip
                tone={trialRows.length > 0 ? 'active' : 'neutral'}
                label={`${trialRows.length} pod(s) in trial`}
              />
              {trialRows.some((t) => (t.daysRemaining ?? 999) <= 14) && (
                <StatusChip tone="alert" label="Decision due soon" />
              )}
            </div>
          )}
        </Link>

        {/* Coaching hub */}
        <Link
          href="/hub/coaching-roster"
          className="group rounded border border-line-200 bg-surface-white p-4 transition hover:border-line-300"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Coaching Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 transition group-hover:text-ink-950" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The assignment matrix — every coach with their pods, every pod with its coach.
          </p>
          <p className="mt-3 text-2xs uppercase tracking-wide text-slate-500">
            Fully specified in Module 07
          </p>
        </Link>

        {/* Strategic Interactions hub */}
        <Link
          href="/hub/strategic-interactions"
          className="group rounded border border-line-200 bg-surface-white p-4 transition hover:border-line-300"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">Strategic Interactions Hub</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 transition group-hover:text-ink-950" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Aggregated investor reporting, the investor portal and the external contact log.
          </p>
          {reportRows && (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip tone="neutral" label={`${reportRows.length} report(s)`} />
              {draftReports.length > 0 && (
                <StatusChip tone="watch" label={`${draftReports.length} draft(s) unpublished`} />
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Pilots strip */}
      {pilotRows && pilotRows.length > 0 && (
        <section className="mt-6" aria-labelledby="pilots-heading">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="pilots-heading" className="font-display text-lg text-ink-950">
              Pilot programs
            </h2>
            <Link href="/hub/pilots" className="text-xs text-ink-700 underline-offset-2 hover:underline">
              Open pilots →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pilotRows.map((pilot) => (
              <Link
                key={pilot.id}
                href={`/hub/pilots/${pilot.id}`}
                className="rounded border border-line-200 bg-surface-white p-3 transition hover:border-line-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-950">{pilot.name}</h3>
                  {pilot.decision ? (
                    <StatusChip
                      tone={pilot.decision === 'expand' ? 'good' : 'neutral'}
                      label={pilot.decision}
                    />
                  ) : (
                    <StatusChip tone="active" label="running" />
                  )}
                </div>
                <p className="mt-1 text-2xs text-slate-500">
                  {pilot.decision
                    ? `Decision recorded: ${pilot.decision}`
                    : `Current phase: ${pilot.currentPhase.replace(/_/g, ' ')}`}
                  {undecidedPilots.some((p) => p.id === pilot.id) && ' · no decision yet'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
