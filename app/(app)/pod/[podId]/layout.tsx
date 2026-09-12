/** Pod tabs (03-MODULE-PODS-TEAMS.md screen 1, item 7). */

import Link from 'next/link';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';

export default async function PodLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ podId: string }>;
}) {
  const { podId } = await params;
  const token = await getSessionToken();

  const tabs = [
    { href: `/pod/${podId}/overview`, label: 'Overview', available: true },
    { href: `/pod/${podId}/members`, label: 'Members', available: true },
    { href: `/pod/${podId}/history`, label: 'Pitch History', available: true },
    { href: `/agreements?pod=${podId}`, label: 'CLOU Agreements', available: false },
    { href: `/coaching?pod=${podId}`, label: 'Coaching', available: false },
  ];

  // Loaded for the header only; a missing pod still renders the shell.
  const overview = await apiRequestOrNull<{ pod: { name: string } }>(
    `/api/pods/${podId}/overview`,
    { token },
  );

  return (
    <div className="mx-auto max-w-6xl">
      <nav aria-label="Pod sections" className="mb-4 flex flex-wrap gap-1 border-b border-line-200">
        {tabs.map((tab) =>
          tab.available ? (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-t border-b-2 border-transparent px-3 py-2 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-700"
            >
              {tab.label}
            </Link>
          ) : (
            <span
              key={tab.href}
              aria-disabled="true"
              className="cursor-not-allowed px-3 py-2 text-sm text-slate-300"
              title="Arrives with its module in a later phase"
            >
              {tab.label}
            </span>
          ),
        )}
      </nav>
      {overview ? null : null}
      {children}
    </div>
  );
}
