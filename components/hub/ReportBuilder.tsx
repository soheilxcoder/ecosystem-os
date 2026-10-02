'use client';

/**
 * The investor report builder (Module 09, Strategic Interactions).
 *
 * Aggregation is the whole point: the builder lets the hub pick a window and a
 * scope of holdings/pods, and the API refuses anything that would resolve to
 * fewer pods than the org's `investor_min_aggregation` rule. The error the
 * server returns IS the guarantee, so it is shown verbatim.
 */

import { useActionState } from 'react';
import { generateReport, type HubActionState } from '../../app/actions/hub';

export interface ScopeOption {
  id: string;
  label: string;
  kind: 'holding' | 'pod';
}

export function ReportBuilder({
  options,
  defaultFrom,
  defaultTo,
}: {
  options: ScopeOption[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, formAction, pending] = useActionState<HubActionState, FormData>(generateReport, {});

  const holdings = options.filter((o) => o.kind === 'holding');
  const pods = options.filter((o) => o.kind === 'pod');

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="dateFrom">
            Window start
          </label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={defaultFrom}
            required
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="dateTo">
            Window end
          </label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={defaultTo}
            required
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-ink-950">Scope</legend>
        <p className="mt-1 text-2xs text-slate-500">
          Leave everything unchecked to aggregate the whole org. A scope that resolves to a single
          pod is refused by the API — that is the point.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="text-2xs uppercase tracking-wide text-slate-500">Holdings</p>
            {holdings.map((option) => (
              <label key={option.id} className="mt-1 flex items-center gap-2 text-sm text-ink-950">
                <input type="checkbox" name="holdingId" value={option.id} />
                {option.label}
              </label>
            ))}
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-slate-500">Individual pods</p>
            {pods.map((option) => (
              <label key={option.id} className="mt-1 flex items-center gap-2 text-sm text-ink-950">
                <input type="checkbox" name="podId" value={option.id} />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {state.error && (
        <p className="rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded border border-status-good/40 bg-white px-3 py-2 text-sm text-ink-950">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-ink-950 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Generating…' : 'Generate report'}
      </button>
    </form>
  );
}
