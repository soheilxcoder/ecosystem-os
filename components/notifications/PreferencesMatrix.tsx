'use client';

/**
 * Delivery preferences — the 3×3 urgency×channel matrix (Module 11).
 *
 * Each cell is its own tiny form so one toggle cannot block another. The one
 * invariant the module guarantees — urgent items always reach you in-app — is
 * shown here as a locked, always-on switch rather than a disabled control that
 * explains nothing (§12: a locked state states its reason).
 */

import { useActionState } from 'react';
import {
  setNotificationPreference,
  type NotificationActionState,
} from '../../app/actions/notifications';

interface Cell {
  urgency: string;
  channel: string;
  enabled: boolean;
  locked: boolean;
}

const URGENCY_LABEL: Record<string, string> = {
  informational: 'Informational',
  action_required: 'Needs action',
  urgent: 'Urgent',
};

const CHANNEL_LABEL: Record<string, string> = {
  in_app: 'In-app',
  email: 'Email',
  digest: 'Daily digest',
};

function PreferenceCell({ cell }: { cell: Cell }) {
  const [state, action, pending] = useActionState(setNotificationPreference, {});
  const on = cell.locked ? true : cell.enabled;

  if (cell.locked) {
    return (
      <div className="flex items-center justify-center py-2" title="Urgent items are never muted">
        <span className="inline-flex items-center gap-1.5 rounded border border-status-good/40 bg-white px-2 py-1 text-xs text-ink-700">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-status-good" />
          Always on
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="flex items-center justify-center py-2">
      <input type="hidden" name="urgency" value={cell.urgency} />
      <input type="hidden" name="channel" value={cell.channel} />
      <input type="hidden" name="enabled" value={String(!on)} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={on}
        aria-label={`${URGENCY_LABEL[cell.urgency]} via ${CHANNEL_LABEL[cell.channel]}: ${on ? 'on' : 'off'}`}
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 ${
          on ? 'border-signal-600 bg-signal-600' : 'border-line-300 bg-line-200'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
      {state.error ? (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function PreferencesMatrix({ matrix }: { matrix: Cell[] }) {
  const urgencies = ['informational', 'action_required', 'urgent'];
  const channels = ['in_app', 'email', 'digest'];

  const cellFor = (urgency: string, channel: string): Cell | undefined =>
    matrix.find((cell) => cell.urgency === urgency && cell.channel === channel);

  return (
    <div className="overflow-x-auto rounded border border-line-200 bg-surface-white">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <caption className="sr-only">Notification delivery preferences</caption>
        <thead>
          <tr className="border-b border-line-200">
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-slate-500">
              Urgency
            </th>
            {channels.map((channel) => (
              <th
                key={channel}
                scope="col"
                className="px-2 py-2 text-center text-xs font-medium text-slate-500"
              >
                {CHANNEL_LABEL[channel]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {urgencies.map((urgency) => (
            <tr key={urgency} className="border-b border-line-100 last:border-b-0">
              <th scope="row" className="px-4 py-2 text-left text-xs font-medium text-ink-950">
                {URGENCY_LABEL[urgency]}
              </th>
              {channels.map((channel) => {
                const cell = cellFor(urgency, channel);
                return (
                  <td key={channel} className="px-2">
                    {cell ? (
                      <PreferenceCell cell={cell} />
                    ) : (
                      <div className="py-2 text-center text-xs text-slate-500">—</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line-100 px-4 py-2 text-2xs text-slate-500">
        Urgent items always reach you in-app — that one switch is locked. Everything else is yours
        to change.
      </p>
    </div>
  );
}
