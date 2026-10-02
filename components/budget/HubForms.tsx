'use client';

/**
 * Architecture Hub controls for the budget cycle (Module 05).
 *
 * Two forms, both of which state their consequence before they are used:
 *
 *  - `ComputeCycleForm` sets the total allocatable pool and runs the
 *    calculation. Recalculating a provisional cycle is normal; recalculating a
 *    locked one is refused by the service, and the form says so up front.
 *  - `LockCycleForm` makes the numbers immutable. It renders disabled unless the
 *    checklist says the cycle may lock, and the reason is printed beside it
 *    rather than left to the reader to guess from a greyed-out button.
 *
 * The "force" override exists because a real organisation sometimes has to
 * announce a cycle with a gap in it. It is a separate checkbox with its own
 * warning, it is sent explicitly, and the service writes what it overrode into
 * the audit log — an override that is invisible is indistinguishable from a
 * quiet edit.
 */

import { useActionState } from 'react';
import {
  computeBudgetCycle,
  lockBudgetCycle,
  type ComputeActionState,
  type LockActionState,
} from '../../app/actions/budget';

export interface ComputeCycleFormProps {
  /** The active sprint cycle to calculate against. */
  cycleId?: string | null;
  cycleNumber?: number | null;
  /** Today, so the form can say which cycle day it is. */
  today?: string | null;
  /** Pre-fill with the pool already set, when a cycle exists. */
  currentPool?: number;
  className?: string;
}

const COMPUTE_INITIAL: ComputeActionState = {};

export function ComputeCycleForm({
  cycleId,
  cycleNumber,
  today,
  currentPool,
  className = '',
}: ComputeCycleFormProps) {
  const [state, action, pending] = useActionState(computeBudgetCycle, COMPUTE_INITIAL);

  if (!cycleId || !cycleNumber) {
    return (
      <div
        className={`rounded border border-dashed border-line-300 bg-surface-white px-4 py-3 text-sm text-slate-500 ${className}`}
      >
        No active sprint cycle — start one on the Sprint Calendar before a budget can be calculated.
      </div>
    );
  }

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="compute-budget-heading"
    >
      <h2 id="compute-budget-heading" className="font-display text-lg text-ink-950">
        Set the pool and calculate
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Cycle {cycleNumber}
        {today ? ` · today is ${today}` : ''}. Every pod keeps its Survival Budget whatever pool is
        set here; the pool divides what is left.
      </p>

      <input type="hidden" name="cycleId" value={cycleId} />
      <input type="hidden" name="cycleNumber" value={cycleNumber} />

      <div className="mt-3">
        <label htmlFor="total-pool" className="block text-sm text-ink-950">
          Total allocatable budget
        </label>
        <input
          id="total-pool"
          name="totalPool"
          type="number"
          min={0}
          step={1000}
          required
          defaultValue={currentPool ?? undefined}
          placeholder="900000000"
          className="mt-1 w-full rounded border border-line-300 bg-surface-white px-3 py-2 font-mono text-sm tabular-nums text-ink-950 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/30"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded bg-signal-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-motion-1 hover:bg-signal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Calculating…' : currentPool ? 'Recalculate' : 'Run the calculation'}
      </button>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-status-alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <div className="mt-3 text-sm" role="status">
          <p className="text-ink-950">{state.success}</p>
          {typeof state.unallocated === 'number' && state.unallocated > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {state.unallocated.toLocaleString('en-US')} of the pool could not be distributed —
              every pod reached the ceiling.
            </p>
          )}
          {state.blockers && state.blockers.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {state.blockers.map((blocker, index) => (
                <li key={index}>· {blocker}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

export interface LockCycleFormProps {
  budgetCycleId: string;
  canLock: boolean;
  blockerCount: number;
  className?: string;
}

const LOCK_INITIAL: LockActionState = {};

export function LockCycleForm({
  budgetCycleId,
  canLock,
  blockerCount,
  className = '',
}: LockCycleFormProps) {
  const [state, action, pending] = useActionState(lockBudgetCycle, LOCK_INITIAL);

  return (
    <form
      action={action}
      className={`rounded border border-line-200 bg-surface-white p-4 ${className}`}
      aria-labelledby="lock-budget-heading"
    >
      <h2 id="lock-budget-heading" className="font-display text-lg text-ink-950">
        Lock the cycle
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Locking makes every number immutable and issues an audit reference. The only way to change a
        locked figure afterwards is a correction record confirmed by two different people.
      </p>

      <input type="hidden" name="budgetCycleId" value={budgetCycleId} />

      {!canLock && (
        <p className="mt-3 text-xs text-status-watch">
          {blockerCount > 0
            ? `${blockerCount} input${blockerCount === 1 ? '' : 's'} still unresolved — see the checklist above.`
            : 'The calculation has not run for this cycle yet.'}
        </p>
      )}

      <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <input type="checkbox" name="force" className="mt-0.5 accent-status-watch" />
        <span>
          Lock anyway, with these inputs unresolved. This is an override: it is recorded in the audit
          log together with exactly what it overrode.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded border border-line-300 bg-surface-white px-4 py-2 text-sm font-medium text-ink-950 transition-colors duration-motion-1 hover:border-signal-600 hover:text-signal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Locking…' : 'Lock on Day 90'}
      </button>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-status-alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <div className="mt-3 text-sm" role="status">
          <p className="text-ink-950">{state.success}</p>
          {state.auditHash && (
            <p className="mt-1 font-mono text-xs text-slate-500">{state.auditHash}</p>
          )}
        </div>
      )}
    </form>
  );
}
