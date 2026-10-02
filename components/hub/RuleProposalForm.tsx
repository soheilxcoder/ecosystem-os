'use client';

/**
 * The rule proposal form (Module 08 Rule Versioning, surfaced in the
 * Architecture Hub). Rule changes are versioned, justified, public to the
 * whole org and — the one constitutional guarantee this form is built around —
 * never effective before the NEXT cycle.
 */

import { useActionState } from 'react';
import { proposeRuleChangeAction, type HubActionState } from '../../app/actions/hub';

export interface RuleOption {
  key: string;
  label: string;
  currentValue: unknown;
}

export function RuleProposalForm({
  rules,
  nextCycleNumber,
}: {
  rules: RuleOption[];
  nextCycleNumber: number;
}) {
  const [state, formAction, pending] = useActionState<HubActionState, FormData>(
    proposeRuleChangeAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="ruleName">
            Rule
          </label>
          <select
            id="ruleName"
            name="ruleName"
            required
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          >
            {rules.map((rule) => (
              <option key={rule.key} value={rule.key}>
                {rule.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-950" htmlFor="newValue">
            New value
          </label>
          <input
            id="newValue"
            name="newValue"
            required
            placeholder='e.g. 3 or "random" or {"p2_end": 78}'
            className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
          />
          <p className="mt-1 text-2xs text-slate-500">
            Numbers, booleans and objects are parsed as JSON; anything else stays text.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor="justification">
          Justification
        </label>
        <textarea
          id="justification"
          name="justification"
          required
          minLength={10}
          rows={2}
          placeholder="Why this change, in the org's words — it is stored with the version."
          className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
        />
      </div>

      <input type="hidden" name="effectiveCycleNumber" value={nextCycleNumber} />

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
        {pending ? 'Proposing…' : 'Propose rule change'}
      </button>
      <p className="text-2xs text-slate-500">
        Takes effect in cycle {nextCycleNumber} at the earliest — never the current cycle.
      </p>
    </form>
  );
}
