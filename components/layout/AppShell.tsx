/**
 * Application shell.
 *
 * Server component: it loads the signed-in user's context once and hands it to
 * the client-side chrome. Data comes from `/api/me`, whose roles already carry
 * their rotation countdown, so no badge can be rendered without one.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { signOutAction } from '../../app/actions/auth';
import type { ApiMe } from '../../lib/types';

export interface AppShellProps {
  me: ApiMe | null;
  children: ReactNode;
  /** Set when /api/me could not be reached, so stale data is never shown silently. */
  apiUnavailable?: boolean;
}

export function AppShell({ me, children, apiUnavailable = false }: AppShellProps) {
  const userName = me?.user?.fullName ?? 'Signed in';
  const userEmail = me?.user?.email ?? '';
  const holdings = me?.holdings ?? [];

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar
        userName={userName}
        userEmail={userEmail}
        orgName="Company X"
        holdings={holdings}
        activeHoldingId={holdings[0]?.id ?? null}
        isHubUser={me?.isHubUser ?? false}
        notificationCount={0}
        urgentCount={0}
        signOutAction={signOutAction}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {apiUnavailable ? (
          <div
            role="status"
            className="border-b border-status-watch/40 bg-status-watch/10 px-6 py-2 text-sm text-ink-950"
          >
            Some data could not be refreshed — the platform API is unreachable. Nothing below is
            live data.
          </div>
        ) : null}

        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line-200 bg-white px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-950">Ecosystem OS</p>
            {me ? (
              <p className="tabular text-xs text-slate-500">
                Cycle day — available from phase 1
              </p>
            ) : null}
          </div>
          <Link
            href="/settings"
            className="hidden text-sm text-slate-500 hover:text-signal-600 md:block"
          >
            Settings
          </Link>
        </header>

        <main className="flex-1 px-6 py-6 pb-24 md:pb-8">{children}</main>
      </div>

      <BottomTabBar isHubUser={me?.isHubUser ?? false} notificationCount={0} />
    </div>
  );
}
