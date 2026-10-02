'use client';

/**
 * The session-log form (07 screen 3).
 *
 * The two save buttons are genuinely distinct:
 *   - **[Save private]** keeps everything to the coach. The pod's history will
 *     show that a session happened, and nothing more.
 *   - **[Save & share summary with pod]** additionally releases the short
 *     pod-visible summary.
 *
 * Sharing is a deliberate act, never accidental — the summary field only travels
 * when the share button is pressed, and the server action enforces the same
 * distinction (`intent`), so the two states are never conflated on the way to
 * the database.
 */

import { useActionState, useState } from 'react';
import { logCoachingSession, type LogSessionActionState } from '../../app/actions/coaching';

const INITIAL: LogSessionActionState = {};

export interface LogSessionFormProps {
  podId: string;
  podName: string;
  /** Today (YYYY-MM-DD) so the date field has a sensible default. */
  today?: string | null;
  /** Pre-select a session request this form is answering. */
  requestId?: string | null;
  defaultSessionType?: string;
  className?: string;
}

export function LogSessionForm({
  podId,
  podName,
  today,
  requestId = null,
  defaultSessionType = 'check_in',
  className = '',
}: LogSessionFormProps) {
  const [state, action, pending] = useActionState(logCoachingSession, INITIAL);
  // Which summary is visible depends on nothing — both buttons share the form,
  // but the summary field is labelled as the thing the pod will actually see.
  const [showSummary, setShowSummary] = useState(false);

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="log-session-heading"
    >
      <h2 id="log-session-heading" className="font-display text-lg text-ink-950">
        Log a session · {podName}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Private notes never leave you and the Coaching Hub. The pod only ever sees the summary you
        choose to share.
      </p>

      <input type="hidden" name="podId" value={podId} />
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`occurredAt-${podId}`} className="text-xs font-medium text-ink-700">
            Date
          </label>
          <input
            id={`occurredAt-${podId}`}
            name="occurredAt"
            type="date"
            defaultValue={today ?? undefined}
            required
            className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`sessionType-${podId}`} className="text-xs font-medium text-ink-700">
            Type
          </label>
          <select
            id={`sessionType-${podId}`}
            name="sessionType"
            defaultValue={defaultSessionType}
            className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          >
            <option value="check_in">Check-in</option>
            <option value="conflict_support">Conflict support</option>
            <option value="skill_development">Skill development</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={`privateNotes-${podId}`} className="text-xs font-medium text-ink-700">
          Private notes <span className="text-slate-500">(never pod-visible)</span>
        </label>
        <textarea
          id={`privateNotes-${podId}`}
          name="privateNotes"
          rows={4}
          required
          placeholder="Your working memory for this session…"
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
      </div>

      <div className="mt-3 rounded border border-line-200 bg-paper-100 p-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`podVisibleSummary-${podId}`} className="text-xs font-medium text-ink-700">
            Pod-visible summary <span className="text-slate-500">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => setShowSummary((v) => !v)}
            className="text-xs text-signal-600 underline-offset-2 hover:underline"
          >
            {showSummary ? 'Hide' : 'Write one'}
          </button>
        </div>
        {showSummary && (
          <textarea
            id={`podVisibleSummary-${podId}`}
            name="podVisibleSummary"
            rows={2}
            placeholder="A short note the pod will see in their history…"
            className="mt-2 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          />
        )}
        <p className="mt-2 text-2xs text-slate-500">
          If you share, the summary is what the pod reads. If you don&apos;t, they see only that a
          session happened.
        </p>
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="private"
          disabled={pending}
          className="rounded border border-line-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:border-signal-600 hover:text-signal-600 disabled:opacity-50"
        >
          Save private
        </button>
        <button
          type="submit"
          name="intent"
          value="share"
          disabled={pending}
          className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-50"
        >
          Save &amp; share summary with pod
        </button>
      </div>
    </form>
  );
}
