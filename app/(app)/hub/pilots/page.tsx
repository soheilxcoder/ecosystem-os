/**
 * `/hub/pilots` — the pilot program index (Module 09).
 *
 * Every named pilot the org is running, with its phase, decision state and a
 * link into the full timeline. New pilots are created right here; the
 * source-model lifecycle (8 prep weeks + 90-day sprint + decision) lives on
 * each pilot's own page.
 */

import Link from 'next/link';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { Holding } from '../../../../core/types';
import type { PilotProgram } from '../../../../lib/types-hub';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { CreatePilotForm } from '../../../../components/hub/PilotForms';

export const dynamic = 'force-dynamic';

interface MePayload {
  holdings: Holding[];
}

const DECISION_TONE: Record<NonNullable<PilotProgram['decision']>, 'good' | 'neutral' | 'watch'> = {
  expand: 'good',
  repeat: 'watch',
  stop: 'neutral',
};

export default async function PilotsPage() {
  const token = await getSessionToken();
  const [pilots, me] = await Promise.all([
    apiRequestOrNull<PilotProgram[]>('/api/hub/pilots', { token }),
    apiRequestOrNull<MePayload>('/api/me', { token }),
  ]);

  if (!pilots) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">Pilot programs</h1>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Deployment Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Pilots are the Deployment Hub&apos;s instrument. Sign in with that seat to track them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Pilot programs</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Named pilots tracked end-to-end: selection through the post-Day-90 decision.
          </p>
        </div>
        <Link href="/hub" className="text-sm text-ink-700 underline-offset-2 hover:underline">
          ← Hub console
        </Link>
      </header>

      <section className="mb-6 rounded border border-line-200 bg-surface-white p-4" aria-labelledby="create-heading">
        <h2 id="create-heading" className="font-display text-base text-ink-950">
          Start a new pilot
        </h2>
        <div className="mt-3">
          <CreatePilotForm holdings={me?.holdings ?? []} />
        </div>
      </section>

      {pilots.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">No pilots yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Create the first pilot above — it gets the full eight-week prep plus 90-day sprint
            timeline automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pilots.map((pilot) => (
            <Link
              key={pilot.id}
              href={`/hub/pilots/${pilot.id}`}
              className="group rounded border border-line-200 bg-surface-white p-4 transition hover:border-line-300"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-ink-950">{pilot.name}</h2>
                {pilot.decision ? (
                  <StatusChip tone={DECISION_TONE[pilot.decision]} label={pilot.decision} />
                ) : (
                  <StatusChip tone="active" label="running" />
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {pilot.decision
                  ? `Decision recorded${pilot.decidedAt ? ` ${pilot.decidedAt.slice(0, 10)}` : ''}: ${pilot.decision}`
                  : `Phase: ${pilot.currentPhase.replace(/_/g, ' ')}`}
              </p>
              <p className="mt-1 text-2xs text-slate-500">
                {pilot.pilotPodId ? 'Pilot unit launched' : 'No pilot unit launched yet'}
                {pilot.decision === 'expand' && ' · expansion wizard ready'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
