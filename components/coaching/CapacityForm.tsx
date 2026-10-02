'use client';

/**
 * A coach states their own capacity (07 §roster). Self-reported and never
 * inferred — the Hub reads it, it does not set it.
 */

import { useActionState } from 'react';
import { setCoachCapacityAction, type CapacityActionState } from '../../app/actions/coaching';

const INITIAL: CapacityActionState = {};

export function CapacityForm({
  currentCapacity,
  schedulingUrl,
  className = '',
}: {
  currentCapacity?: 'comfortable' | 'stretched' | null;
  schedulingUrl?: string | null;
  className?: string;
}) {
  const [state, action, pending] = useActionState(setCoachCapacityAction, INITIAL);

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="capacity-heading"
    >
      <h2 id="capacity-heading" className="font-display text-base text-ink-950">
        Your capacity
      </h2>
      <p className="mt-1 text-2xs text-slate-500">
        Self-reported. The Coaching Hub uses it to balance assignments; it never overrides it.
      </p>

      <div className="mt-3">
        <label htmlFor="capacity" className="text-xs font-medium text-ink-700">
          Right now I am
        </label>
        <select
          id="capacity"
          name="capacity"
          defaultValue={currentCapacity ?? 'comfortable'}
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        >
          <option value="comfortable">Comfortable</option>
          <option value="stretched">Stretched</option>
        </select>
      </div>

      <div className="mt-3">
        <label htmlFor="schedulingUrl" className="text-xs font-medium text-ink-700">
          Scheduling link <span className="text-slate-500">(optional)</span>
        </label>
        <input
          id="schedulingUrl"
          name="schedulingUrl"
          type="url"
          defaultValue={schedulingUrl ?? ''}
          placeholder="https://…"
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
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
        Save
      </button>
    </form>
  );
}
