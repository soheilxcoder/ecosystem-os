/**
 * `/hub/deployment/new` — the five-step launch wizard (Module 09).
 *
 * This page is the ONLY place in the product where a pod can be created. The
 * server component gathers everything the wizard needs (holdings, member
 * directory, coach roster, and — when arriving from an "expand" decision —
 * the pilot's prefill) and hands it to the client wizard. The launch itself
 * goes through the `launchPod` server action, so the browser never talks to
 * the API directly.
 */

import Link from 'next/link';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type { Holding } from '../../../../../core/types';
import type { ExpansionPrefill, SetupData } from '../../../../../lib/types-hub';
import { DeploymentWizard } from '../../../../../components/hub/DeploymentWizard';

export const dynamic = 'force-dynamic';

interface MePayload {
  holdings: Holding[];
  today: string;
}

export default async function NewDeploymentPage({
  searchParams,
}: {
  searchParams: Promise<{ pilot?: string }>;
}) {
  const token = await getSessionToken();
  const { pilot: pilotId } = await searchParams;

  const [me, setup, prefill] = await Promise.all([
    apiRequestOrNull<MePayload>('/api/me', { token }),
    apiRequestOrNull<SetupData>('/api/hub/deployment/setup-data', { token }),
    pilotId
      ? apiRequestOrNull<ExpansionPrefill>(`/api/hub/pilots/${pilotId}/expansion-prefill`, { token })
      : Promise.resolve(null),
  ]);

  if (!setup || !me) {
    return (
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-950">New pod / unit</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            The five-step launch wizard.
          </p>
        </header>
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">Deployment Hub only</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            Launching units requires the <code className="text-xs">hub.deploy_unit</code> seat.
            Sign in with a Deployment Hub account to continue.
          </p>
          <Link
            href="/hub/deployment"
            className="mt-4 inline-block text-sm text-ink-700 underline-offset-2 hover:underline"
          >
            ← Back to the trial tracker
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">New pod / unit</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Five steps: type, basics, selection checklist, platform setup, launch. Step 5 is the
            only place in the system where a pod is created.
          </p>
        </div>
        <Link
          href="/hub/deployment"
          className="text-sm text-ink-700 underline-offset-2 hover:underline"
        >
          ← Trial tracker
        </Link>
      </header>

      <DeploymentWizard holdings={me.holdings} setup={setup} prefill={prefill} today={me.today} />
    </div>
  );
}
