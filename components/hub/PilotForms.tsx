'use client';

/**
 * Pilot program forms (Module 09).
 *
 * The pilot lifecycle is tracked here exactly as the source model runs it:
 * six phases with owners and statuses, the three success criteria as numbers
 * the hub maintains, and the post-Day-90 decision recorder. "Expand" is only
 * offered as a button anyone can press — but the API accepts it only from the
 * holding executive's seat, so the UI stays honest without hiding authority.
 */

import { useActionState } from 'react';
import {
  createPilotAction,
  recordDecisionAction,
  updatePilotCriteriaAction,
  updatePilotPhaseAction,
  type HubActionState,
} from '../../app/actions/hub';
import type {
  PilotPhase,
  PilotPhaseState,
  PilotSuccessCriteria,
} from '../../lib/types-hub';

export function CreatePilotForm({ holdings }: { holdings: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState<HubActionState, FormData>(createPilotAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor="pilotName">
          Pilot name
        </label>
        <input
          id="pilotName"
          name="name"
          required
          placeholder='e.g. "Pars Pilot"'
          className="mt-1 w-56 rounded border border-line-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor="pilotHolding">
          Target holding
        </label>
        <select
          id="pilotHolding"
          name="holdingId"
          className="mt-1 w-48 rounded border border-line-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— none —</option>
          {holdings.map((holding) => (
            <option key={holding.id} value={holding.id}>
              {holding.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-ink-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create pilot'}
      </button>
      {state.error && <p className="w-full text-xs text-status-alert">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-ink-700">{state.success}</p>}
    </form>
  );
}

export function PhaseRowForm({
  pilotId,
  phase,
  state,
  disabled,
}: {
  pilotId: string;
  phase: PilotPhase;
  state: PilotPhaseState | undefined;
  disabled: boolean;
}) {
  return (
    <form action={updatePilotPhaseAction.bind(null, pilotId)} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="phase" value={phase} />
      <select
        name="status"
        defaultValue={state?.status ?? 'not_started'}
        disabled={disabled}
        className="rounded border border-line-300 px-2 py-1 text-2xs"
        aria-label={`Status for ${phase}`}
      >
        <option value="not_started">Not started</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
      </select>
      <input
        type="text"
        name="owner"
        defaultValue={state?.owner ?? ''}
        disabled={disabled}
        placeholder="Owner, e.g. Deployment Hub + VC CEO"
        className="min-w-[220px] flex-1 rounded border border-line-300 px-2 py-1 text-2xs"
        aria-label={`Owner for ${phase}`}
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded border border-line-300 px-2 py-1 text-2xs text-ink-700 hover:border-line-400 disabled:opacity-40"
      >
        Save
      </button>
    </form>
  );
}

export function SetCurrentPhaseForm({
  pilotId,
  phases,
  currentPhase,
  disabled,
}: {
  pilotId: string;
  phases: Array<{ value: PilotPhase; label: string }>;
  currentPhase: PilotPhase;
  disabled: boolean;
}) {
  return (
    <form action={updatePilotPhaseAction.bind(null, pilotId)} className="flex items-center gap-2">
      <label htmlFor={`currentPhase-${pilotId}`} className="text-2xs uppercase tracking-wide text-slate-500">
        Current phase
      </label>
      <select
        id={`currentPhase-${pilotId}`}
        name="currentPhase"
        defaultValue={currentPhase}
        disabled={disabled}
        className="rounded border border-line-300 px-2 py-1 text-xs"
      >
        {phases.map((phase) => (
          <option key={phase.value} value={phase.value}>
            {phase.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled}
        className="rounded border border-line-300 px-2 py-1 text-2xs text-ink-700 hover:border-line-400 disabled:opacity-40"
      >
        Set
      </button>
    </form>
  );
}

export function CriteriaForm({
  pilotId,
  criteria,
  disabled,
}: {
  pilotId: string;
  criteria: PilotSuccessCriteria;
  disabled: boolean;
}) {
  const fields: Array<{ key: keyof PilotSuccessCriteria; label: string; hint: string }> = [
    {
      key: 'decisionTimeBaseline',
      label: 'Decision time — baseline (days)',
      hint: 'Traditional structure, measured before the pilot',
    },
    {
      key: 'decisionTimeCurrent',
      label: 'Decision time — current (days)',
      hint: 'Manual entry, or computed from timestamped decision logs',
    },
    {
      key: 'satisfactionScore',
      label: 'Pod satisfaction survey (0–10)',
      hint: 'Sent at sprint end',
    },
    {
      key: 'profitBudgetRatioBaseline',
      label: 'Profit-to-budget ratio — baseline',
      hint: 'This same team under the old structure',
    },
    {
      key: 'profitBudgetRatioCurrent',
      label: 'Profit-to-budget ratio — current',
      hint: 'Compared automatically against Module 5 at cycle lock',
    },
  ];

  return (
    <form action={updatePilotCriteriaAction.bind(null, pilotId)} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-ink-950" htmlFor={`${pilotId}-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`${pilotId}-${field.key}`}
              name={field.key}
              type="number"
              step="any"
              disabled={disabled}
              defaultValue={criteria[field.key] ?? ''}
              className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm disabled:bg-paper-100"
            />
            <p className="mt-0.5 text-2xs text-slate-500">{field.hint}</p>
          </div>
        ))}
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800 disabled:opacity-40"
      >
        Save success criteria
      </button>
    </form>
  );
}

export function DecisionForm({
  pilotId,
  hasUnit,
}: {
  pilotId: string;
  hasUnit: boolean;
}) {
  const [state, formAction, pending] = useActionState<HubActionState, FormData>(
    recordDecisionAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="pilotId" value={pilotId} />
      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor={`decision-${pilotId}`}>
          Decision
        </label>
        <select
          id={`decision-${pilotId}`}
          name="decision"
          required
          className="mt-1 w-full max-w-xs rounded border border-line-300 px-2.5 py-1.5 text-sm"
        >
          <option value="stop">Stop</option>
          <option value="repeat">Repeat</option>
          <option value="expand" disabled={!hasUnit}>
            Expand to next unit{hasUnit ? '' : ' (launch the pilot unit first)'}
          </option>
        </select>
        <p className="mt-1 text-2xs text-slate-500">
          Stop and repeat are the Deployment Hub&apos;s call; expand commits the holding&apos;s
          resources and therefore needs the holding executive.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-950" htmlFor={`lessons-${pilotId}`}>
          Lessons learned <span className="font-normal text-slate-500">(carried into the next unit)</span>
        </label>
        <textarea
          id={`lessons-${pilotId}`}
          name="lessonsLearned"
          rows={3}
          className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
        />
      </div>
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
        className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? 'Recording…' : 'Record decision'}
      </button>
    </form>
  );
}
