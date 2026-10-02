'use client';

/**
 * Author a lesson learned (Module 10). Lessons are the one archive record a
 * person writes by hand; everything else is indexed from events. The two fields
 * mirror the module's question: what happened, and what would we do differently.
 */

import { useActionState } from 'react';
import { createLesson, type LessonActionState } from '../../app/actions/archive';

const INITIAL: LessonActionState = {};

export function LessonForm({ className = '' }: { className?: string }) {
  const [state, action, pending] = useActionState(createLesson, INITIAL);

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="lesson-heading"
    >
      <h2 id="lesson-heading" className="font-display text-base text-ink-950">
        Record a lesson
      </h2>
      <p className="mt-1 text-2xs text-slate-500">
        Written once, searchable forever. Keep it concrete — future pods will read it verbatim.
      </p>

      <div className="mt-3">
        <label htmlFor="whatHappened" className="text-xs font-medium text-ink-700">
          What happened
        </label>
        <textarea
          id="whatHappened"
          name="whatHappened"
          required
          rows={3}
          placeholder="e.g. We pitched without a previous summary and reviewers could not judge our baseline."
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="whatWedDoDifferently" className="text-xs font-medium text-ink-700">
          What we&apos;d do differently <span className="text-slate-500">(optional)</span>
        </label>
        <textarea
          id="whatWedDoDifferently"
          name="whatWedDoDifferently"
          rows={2}
          placeholder="e.g. Always carry last cycle's summary into the pitch draft."
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="tags" className="text-xs font-medium text-ink-700">
          Tags <span className="text-slate-500">(comma separated, optional)</span>
        </label>
        <input
          id="tags"
          name="tags"
          placeholder="pitch, onboarding"
          className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
        />
      </div>

      {state.error && (
        <p
          className="mt-3 rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950"
          role="alert"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          className="mt-3 rounded border border-status-good/40 bg-white px-3 py-2 text-sm text-ink-950"
          role="status"
        >
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-50"
      >
        {pending ? 'Recording…' : 'Record lesson'}
      </button>
    </form>
  );
}
