'use client';

/**
 * Pod forms.
 *
 * Copy follows 12-DESIGN-SYSTEM.md §3: buttons name the exact action, and an
 * out-of-window attempt states what happened and what to do next. The server is
 * the authority — these forms simply surface its answer.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  castVoteAction,
  logCheckinAction,
  savePrioritiesAction,
  savePitchAction,
  submitPitchAction,
  type ActionState,
} from '../../app/actions/pods';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-60"
    >
      {pending ? (pendingLabel ?? 'Working…') : label}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-status-alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="mt-2 text-sm text-status-good">
        {state.success}
      </p>
    );
  }
  return null;
}

export function CheckinForm({ podId, disabled }: { podId: string; disabled?: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(logCheckinAction, {});

  if (disabled) {
    return (
      <p className="text-sm text-slate-500">
        Check-ins are logged during Days 4–80 of the cycle. The button opens when the execution
        window is live.
      </p>
    );
  }

  return (
    <form action={formAction} className="border border-line-200 bg-white p-3">
      <input type="hidden" name="podId" value={podId} />
      <label htmlFor="checkin-body" className="block text-xs text-slate-500">
        Weekly check-in
      </label>
      <textarea
        id="checkin-body"
        name="body"
        rows={3}
        maxLength={500}
        required
        placeholder="What moved this week, and what is blocked?"
        className="mt-1 w-full rounded border border-line-300 px-3 py-2 text-sm text-ink-950 placeholder:text-slate-300"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="atRiskFlag" className="h-4 w-4" />
          Blocked or at risk (notifies the coach)
        </label>
        <SubmitButton label="Log check-in" pendingLabel="Logging…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PrioritiesForm({
  podId,
  initial,
  disabled,
}: {
  podId: string;
  initial: string[];
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(savePrioritiesAction, {});

  if (disabled) {
    return (
      <div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-950">
          {initial.map((priority) => (
            <li key={priority}>{priority}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Set by the Pod Lead during Days 1–3; read-only for the rest of the cycle.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="podId" value={podId} />
      <label htmlFor="priorities" className="block text-xs text-slate-500">
        One priority per line (up to five)
      </label>
      <textarea
        id="priorities"
        name="priorities"
        rows={4}
        defaultValue={initial.join('\n')}
        className="mt-1 w-full rounded border border-line-300 px-3 py-2 text-sm text-ink-950"
      />
      <div className="mt-2">
        <SubmitButton label="Save priorities" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export interface Candidate {
  userId: string;
  fullName: string;
  isOutgoingLead: boolean;
}

export function VoteModal({
  podId,
  candidates,
  tieBreakRule,
  currentVote,
}: {
  podId: string;
  candidates: Candidate[];
  tieBreakRule: string;
  currentVote: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(castVoteAction, {});

  const tieBreakLabel: Record<string, string> = {
    longest_tenure: 'Ties are broken by longest tenure in the pod.',
    lead_tiebreak: 'Ties are broken by the outgoing Pod Lead.',
    random: 'Ties are broken by a draw recorded in the audit log.',
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
      >
        {currentVote ? 'Change your vote' : 'Vote for next Pod Lead'}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vote for the next Pod Lead"
        className="w-full max-w-sm rounded border border-line-200 bg-white p-4 shadow-popover"
      >
        <h3 className="font-display text-lg text-ink-950">Vote for next Pod Lead</h3>
        <p className="mt-1 text-sm text-slate-500">
          Your vote is visible to the pod — the model runs on transparency, not secret ballots.
        </p>

        <form action={formAction} className="mt-3">
          <input type="hidden" name="podId" value={podId} />
          <fieldset className="space-y-2">
            <legend className="sr-only">Candidates</legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.userId}
                className="flex items-center gap-2 rounded border border-line-200 px-3 py-2 text-sm text-ink-950"
              >
                <input
                  type="radio"
                  name="candidateUserId"
                  value={candidate.userId}
                  defaultChecked={currentVote === candidate.userId}
                  className="h-4 w-4"
                />
                <span>
                  {candidate.fullName}
                  {candidate.isOutgoingLead ? (
                    <span className="ml-2 text-xs text-slate-500">current Pod Lead</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>

          <p className="mt-3 border-t border-line-200 pt-2 text-xs text-slate-500">
            {tieBreakLabel[tieBreakRule] ?? tieBreakLabel.longest_tenure}
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700"
            >
              Cancel
            </button>
            <SubmitButton label="Submit vote" pendingLabel="Submitting…" />
          </div>
          <Feedback state={state} />
        </form>
      </div>
    </div>
  );
}

export function PitchEditor({
  podId,
  cycleId,
  initial,
  readOnly,
  allowSubmit,
}: {
  podId: string;
  cycleId: string;
  initial: {
    previousSummary: string;
    keyResults: Array<{ metric: string; target: string; actual: string }>;
    nextPlan: string;
    budgetContext: string;
  };
  readOnly: boolean;
  allowSubmit: boolean;
}) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(savePitchAction, {});
  const [submitState, submitAction] = useActionState<ActionState, FormData>(submitPitchAction, {});

  return (
    <div className="space-y-4">
      <form action={saveAction} className="space-y-4 border border-line-200 bg-white p-4">
        <input type="hidden" name="podId" value={podId} />
        <input type="hidden" name="cycleId" value={cycleId} />

        <Field
          id="previousSummary"
          name="previousSummary"
          label="Previous period performance summary"
          hint="Around 300 words. Peer validators read this first."
          rows={6}
          defaultValue={initial.previousSummary}
          readOnly={readOnly}
        />

        <Field
          id="keyResults"
          name="keyResults"
          label="Key results achieved"
          hint="One per line, as: metric | target | actual"
          rows={5}
          defaultValue={initial.keyResults
            .map((row) => `${row.metric} | ${row.target} | ${row.actual}`)
            .join('\n')}
          readOnly={readOnly}
        />

        <Field
          id="nextPlan"
          name="nextPlan"
          label="Next period plan"
          rows={6}
          defaultValue={initial.nextPlan}
          readOnly={readOnly}
        />

        <Field
          id="budgetContext"
          name="budgetContext"
          label="Budget request context (optional)"
          hint="Context for reviewers only — the budget itself is formula-driven and cannot be requested here."
          rows={4}
          defaultValue={initial.budgetContext}
          readOnly={readOnly}
        />

        {!readOnly ? (
          <div className="flex items-center gap-2">
            <SubmitButton label="Save draft" pendingLabel="Saving…" />
          </div>
        ) : null}
        <Feedback state={saveState} />
      </form>

      {allowSubmit && !readOnly ? (
        <form
          action={submitAction}
          className="flex flex-wrap items-center gap-3 border border-line-200 bg-white p-4"
        >
          <input type="hidden" name="podId" value={podId} />
          <input type="hidden" name="cycleId" value={cycleId} />
          <p className="min-w-0 flex-1 text-sm text-slate-500">
            Submitting locks the pitch. It cannot be edited afterwards.
          </p>
          <SubmitButton label="Submit final pitch" pendingLabel="Submitting…" />
          <Feedback state={submitState} />
        </form>
      ) : null}
    </div>
  );
}

function Field({
  id,
  name,
  label,
  hint,
  rows,
  defaultValue,
  readOnly,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  rows: number;
  defaultValue?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-950">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        readOnly={readOnly}
        className={`mt-1 w-full rounded border border-line-300 px-3 py-2 text-sm text-ink-950 ${
          readOnly ? 'bg-paper-100 text-slate-500' : ''
        }`}
      />
    </div>
  );
}
