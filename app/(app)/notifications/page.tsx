/**
 * `/notifications` — Module 11 inbox.
 *
 * Two tabs, shaped by the module: `All` (everything you were told) and
 * `Needs action` (action-required/urgent items whose action is still
 * outstanding). The Needs-Action list cannot lie — the server re-checks each
 * item's underlying entity before returning, so an item only disappears when
 * the action is genuinely done.
 *
 * Delivery preferences sit below as the urgency×channel matrix. The one locked
 * cell (urgent + in-app) is shown as always-on, because urgent items are never
 * muted.
 */

import Link from 'next/link';

import { StatusChip, type StatusTone } from '../../../components/ui/StatusChip';
import { MarkReadButton } from '../../../components/notifications/MarkReadButton';
import { PreferencesMatrix } from '../../../components/notifications/PreferencesMatrix';
import { markAllNotificationsRead } from '../../../app/actions/notifications';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';

export const dynamic = 'force-dynamic';

interface NotificationItem {
  id: string;
  triggerType: string;
  urgency: 'informational' | 'action_required' | 'urgent';
  title: string;
  contextText: string | null;
  deepLink: string | null;
  readAt: string | null;
  actionedAt: string | null;
  createdAt: string;
}

interface NotificationsPayload {
  tab: 'all' | 'needs_action';
  unread: number;
  items: NotificationItem[];
}

interface PreferencesPayload {
  matrix: Array<{ urgency: string; channel: string; enabled: boolean; locked: boolean }>;
}

function urgencyTone(urgency: NotificationItem['urgency']): StatusTone {
  return urgency === 'urgent' ? 'alert' : urgency === 'action_required' ? 'watch' : 'neutral';
}

function urgencyLabel(urgency: NotificationItem['urgency']): string {
  return urgency === 'urgent' ? 'Urgent' : urgency === 'action_required' ? 'Needs action' : 'Info';
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === 'needs_action' ? 'needs_action' : 'all';

  const token = await getSessionToken();
  const [inbox, preferences] = await Promise.all([
    apiRequestOrNull<NotificationsPayload>(`/api/notifications?tab=${tab}`, { token }),
    apiRequestOrNull<PreferencesPayload>('/api/notifications/preferences', { token }),
  ]);

  if (!inbox) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl text-ink-950">Notifications</h1>
        <div className="mt-6 rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <p className="text-sm text-slate-500">
            The notification service is unreachable right now — nothing here is live.
          </p>
        </div>
      </div>
    );
  }

  const items = inbox.items;
  const outstanding = tab === 'needs_action';

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {inbox.unread > 0 ? `${inbox.unread} unread` : 'You are all caught up'}
          </p>
        </div>
        <form action={markAllNotificationsRead}>
          <button
            type="submit"
            className="rounded border border-line-300 bg-white px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
          >
            Mark all read
          </button>
        </form>
      </header>

      {/* Tabs */}
      <nav aria-label="Notification views" className="mb-4 flex gap-1 border-b border-line-200">
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'needs_action', label: 'Needs action' },
          ] as const
        ).map(({ key, label }) => {
          const active = tab === key;
          return (
            <Link
              key={key}
              href={key === 'all' ? '/notifications' : `/notifications?tab=${key}`}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                active ? 'border-signal-600 text-signal-600' : 'border-transparent text-slate-500 hover:text-ink-700'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-12 text-center">
          <h2 className="font-display text-base text-ink-950">
            {outstanding ? 'Nothing needs your action' : 'No notifications yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            {outstanding
              ? 'When a pitch window opens, a review is assigned, or a decision lands, it shows up here — and leaves only when you have handled it.'
              : 'When something in the ecosystem changes and you are the one who should know, it will appear here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded border bg-surface-white p-4 ${
                item.readAt ? 'border-line-200' : 'border-signal-600/40'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={urgencyTone(item.urgency)} label={urgencyLabel(item.urgency)} />
                    {!item.readAt && (
                      <span className="text-2xs font-medium uppercase tracking-wide text-signal-600">
                        New
                      </span>
                    )}
                    <span className="text-2xs text-slate-500">{timeAgo(item.createdAt)}</span>
                  </div>
                  <p className={`mt-1.5 text-sm ${item.readAt ? 'text-ink-700' : 'font-medium text-ink-950'}`}>
                    {item.title}
                  </p>
                  {item.contextText ? (
                    <p className="mt-0.5 text-xs text-slate-500">{item.contextText}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.deepLink ? (
                    <Link
                      href={item.deepLink}
                      className="rounded bg-signal-600 px-3 py-1 text-2xs font-medium text-white hover:bg-signal-700"
                    >
                      Open
                    </Link>
                  ) : null}
                  {!item.readAt ? <MarkReadButton id={item.id} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Preferences */}
      <section className="mt-10" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="font-display text-lg text-ink-950">
          How you hear about things
        </h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Choose the channels for each urgency. Urgent items always reach you in-app — that row
          cannot be turned off.
        </p>
        <div className="mt-3">
          {preferences ? (
            <PreferencesMatrix matrix={preferences.matrix} />
          ) : (
            <p className="text-sm text-slate-500">Preferences could not be loaded.</p>
          )}
        </div>
      </section>
    </div>
  );
}
