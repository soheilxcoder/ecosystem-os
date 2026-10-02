/**
 * Notifications — the inbox: urgency chips, unread highlighting, tabs and
 * the preferences matrix. Fully bilingual.
 */
import { StatusChip } from '../../../components/ui/StatusChip';
import { NOTIFICATIONS, TODAY } from '../data';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/translations';

const DEEP_LINKS: Record<string, string | undefined> = {
  'review.reminder': '/review',
  'connector.failure': '/hub',
  'coaching.scheduled': '/coaching',
  'budget.computed': '/budget',
  'pitch.submitted': '/pod/pod-basalt',
};

export function NotificationsScreen() {
  const { t, num } = useI18n();
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const needsAction = NOTIFICATIONS.filter((n) => n.urgency === 'urgent');

  const urgencyTone = (urgency: string) =>
    urgency === 'urgent' ? 'alert' : urgency === 'high' ? 'watch' : 'neutral';
  const urgencyLabel = (urgency: string): string =>
    urgency === 'urgent'
      ? t('notifications.urgent')
      : urgency === 'high'
        ? t('notifications.high')
        : t('notifications.info');

  const timeAgo = (iso: string): string => {
    const minutes = Math.max(1, Math.round((Date.parse(TODAY) - Date.parse(iso)) / 60_000));
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('notifications.agoHours', { n: num(hours) });
    const days = Math.round(hours / 24);
    return t('notifications.agoDays', { n: num(days) });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-950">{t('notifications.h1')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unread > 0 ? t('notifications.unread', { n: num(unread) }) : t('notifications.caughtUp')}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-line-300 bg-white px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600 hover:text-signal-600"
        >
          {t('notifications.markAll')}
        </button>
      </header>

      <nav aria-label="Notification views" className="mb-4 flex gap-1 border-b border-line-200">
        <span
          aria-current="page"
          className="-mb-px border-b-2 border-signal-600 px-3 py-2 text-sm font-medium text-signal-600"
        >
          {t('notifications.tabAll')}
        </span>
        <span className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500">
          {t('notifications.tabAction', { n: num(needsAction.length) })}
        </span>
      </nav>

      <ul className="space-y-2">
        {NOTIFICATIONS.map((item) => (
          <li
            key={item.id}
            className={`rounded border bg-surface-white p-4 ${
              item.read ? 'border-line-200' : 'border-signal-600/40'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={urgencyTone(item.urgency)} label={urgencyLabel(item.urgency)} />
                  {!item.read && (
                    <span className="text-2xs font-medium uppercase tracking-wide text-signal-600">
                      {t('notifications.new')}
                    </span>
                  )}
                  <span className="text-2xs text-slate-500">{timeAgo(item.createdAt)}</span>
                </div>
                <p className={`mt-1.5 text-sm ${item.read ? 'text-ink-700' : 'font-medium text-ink-950'}`}>
                  {t(`notification.${item.id}.title` as StringKey)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t(`notification.${item.id}.body` as StringKey)}
                </p>
              </div>

              {DEEP_LINKS[item.kind] && (
                <a
                  href={`#${DEEP_LINKS[item.kind]}`}
                  className="shrink-0 rounded bg-signal-600 px-3 py-1 text-2xs font-medium text-white hover:bg-signal-700"
                >
                  {t('notifications.open')}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-10" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="font-display text-lg text-ink-950">
          {t('notifications.prefsH2')}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('notifications.prefsSub')}</p>
        <div className="mt-3 overflow-x-auto rounded border border-line-200 bg-white">
          <table className="w-full min-w-105 text-sm">
            <thead>
              <tr className="border-b border-line-200 text-start text-xs text-slate-500">
                <th scope="col" className="px-3 py-2 text-start font-medium">{t('notifications.colUrgency')}</th>
                <th scope="col" className="px-3 py-2 text-center font-medium">{t('notifications.colInApp')}</th>
                <th scope="col" className="px-3 py-2 text-center font-medium">{t('notifications.colEmail')}</th>
                <th scope="col" className="px-3 py-2 text-center font-medium">{t('notifications.colPush')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {[
                { urgency: t('notifications.urgent'), channels: ['notifications.channelAlways', 'notifications.channelYes', 'notifications.channelYes'] },
                { urgency: t('notifications.high'), channels: ['notifications.channelOn', 'notifications.channelYes', 'notifications.channelOff'] },
                { urgency: t('notifications.info'), channels: ['notifications.channelOn', 'notifications.channelDaily', 'notifications.channelOff'] },
              ].map((row) => (
                <tr key={row.urgency}>
                  <th scope="row" className="px-3 py-2 text-start font-normal text-ink-950">
                    {row.urgency}
                  </th>
                  {row.channels.map((channel, i) => (
                    <td key={i} className="px-3 py-2 text-center text-xs text-ink-700">
                      {t(channel as StringKey)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
