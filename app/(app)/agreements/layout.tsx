/**
 * Agreements area — 04-MODULE-CLOU-AGREEMENTS.md.
 *
 * The [+ New Agreement] button is rendered only for someone who currently holds
 * a Pod Lead seat, because proposing is a Pod Lead action (Module 04 + the
 * permission matrix in 01-INFORMATION-ARCHITECTURE.md §3). Hiding it is honest;
 * the server would refuse the request anyway.
 */

import Link from 'next/link';

import { AgreementTabs } from '../../../components/agreements/AgreementTabs';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { AgreementView } from '../../../lib/agreements';
import type { ApiMe } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AgreementsLayout({ children }: { children: React.ReactNode }) {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  const ledPodIds = (me?.roles ?? [])
    .filter(
      (role) =>
        role.roleType === 'pod_lead' &&
        Boolean(role.scopeId) &&
        role.rotation.state !== 'expired' &&
        role.rotation.state !== 'vacant',
    )
    .map((role) => role.scopeId as string);

  // One inbox per pod the viewer leads — usually exactly one.
  const inboxes = await Promise.all(
    ledPodIds.map((podId) =>
      apiRequestOrNull<AgreementView[]>(`/api/agreements/inbox?podId=${podId}`, { token }),
    ),
  );
  const inboxCount = inboxes.reduce((total, rows) => total + (rows?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Agreements (CLOU)</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-500">
            Bilateral agreements between pods that actually exchange something. Pods that exchange
            nothing are connected only through the shared platform — the graph never pretends
            otherwise.
          </p>
        </div>
        {ledPodIds.length > 0 ? (
          <Link
            href="/agreements/new"
            className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
          >
            + New Agreement
          </Link>
        ) : null}
      </header>

      <AgreementTabs inboxCount={inboxCount} />
      {children}
    </div>
  );
}
