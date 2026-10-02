'use client';

/**
 * A pod asks its coach for a session (07 screen 1). The request lands in the
 * coach's console; nothing is scheduled automatically.
 */

import { useActionState } from 'react';
import { requestCoachingSession, type RequestSessionActionState } from '../../app/actions/coaching';

const INITIAL: RequestSessionActionState = {};

export function RequestSessionForm({
  podId,
  className = '',
}: {
  podId: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(requestCoachingSession, INITIAL);

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="request-session-heading"
    >
      <h2 id="request-session-heading" className="font-display text-base text-ink-950">
        Request a session
      </h2>
      <input type="hidden" name="podId" value={podId} />

      <div className="mt-3">
        <label htmlFor={`topic-${podId}`} className="text-xs font-medium text-ink-700">
          What do you want to work on?
        </label>
        <textarea
          id={`topic-${podId}`}
          name="topic"
          rows={2}
          required
          placeholder="One or two sentences is enough…"
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`urgency-${podId}`} className="text-xs font-medium text-ink-700">
            Urgency
          </label>
          <select
            id={`urgency-${podId}`}
            name="urgency"
            defaultValue="normal"
            className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label htmlFor={`preferredTimes-${podId}`} className="text-xs font-medium text-ink-700">
            Preferred times <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id={`preferredTimes-${podId}`}
            name="preferredTimes"
            type="text"
            placeholder="e.g. weekday mornings"
            className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          />
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded border border-status-good/40 bg-white px-3 py-2 text-sm text-ink-950" role="status">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-50"
      >
        Send request
      </button>
    </form>
  );
}
