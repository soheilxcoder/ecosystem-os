'use client';

/**
 * Budget simulator — 05-MODULE-BUDGET-MARKET.md, `/budget/simulator`.
 *
 * "Lets a Pod Lead answer 'if we improve our peer review score by 10 points,
 * roughly how much more budget would that mean?' without needing a spreadsheet
 * or a finance person."
 *
 * Three things this must not do, all of which are structural rather than
 * stylistic:
 *
 *  - It must not touch real data. The sliders start from the pod's current
 *    scores so the comparison is meaningful, but the values submitted are the
 *    slider positions and nothing is read back into the allocation.
 *  - It must not look like a form that saves. There is no submit-and-done state;
 *    the result stays on screen beside the disclaimer.
 *  - It must not hide its own assumption. The denominator is every other pod's
 *    real score, so the answer is only valid while those stay put — the API
 *    returns that sentence and it is rendered verbatim.
 */

import { useActionState, useEffect, useState } from 'react';
import { simulateBudget, type SimulateActionState } from '../../app/actions/budget';
import { ArithmeticStrip } from './ArithmeticStrip';

export interface SimulatorProps {
  pods: Array<{ id: string; name: string }>;
  /** The pod the viewer belongs to, preselected when present. */
  defaultPodId?: string | null;
  /** Current component scores per pod, so the sliders start from reality. */
  currentScores: Record<string, { financial: number; peer_review: number; strategic: number }>;
  disabled?: boolean;
}

const INITIAL: SimulateActionState = {};

const SLIDERS = [
  { key: 'financial', label: 'Financial performance', weight: 40 },
  { key: 'peer_review', label: 'Peer review', weight: 35 },
  { key: 'strategic', label: 'Strategic alignment', weight: 25 },
] as const;

type SliderKey = (typeof SLIDERS)[number]['key'];

export function Simulator({ pods, defaultPodId, currentScores, disabled = false }: SimulatorProps) {
  const [podId, setPodId] = useState(defaultPodId ?? pods[0]?.id ?? '');
  const [values, setValues] = useState<Record<SliderKey, number>>({
    financial: 50,
    peer_review: 50,
    strategic: 50,
  });
  const [state, action, pending] = useActionState(simulateBudget, INITIAL);

  // Moving to a different pod resets the sliders to that pod's real scores, so
  // the starting point of a what-if is always the actual current position
  // rather than wherever the last pod's sliders happened to be.
  useEffect(() => {
    const current = currentScores[podId];
    setValues({
      financial: current?.financial ?? 50,
      peer_review: current?.peer_review ?? 50,
      strategic: current?.strategic ?? 50,
    });
  }, [podId, currentScores]);

  const baseline = currentScores[podId];

  return (
    <div className="space-y-4">
      <div
        className="rounded border border-status-watch/40 bg-surface-white px-4 py-3 text-sm text-ink-700"
        role="note"
      >
        This is a planning tool only. It does not submit anything and has no effect on real scores
        or budgets.
      </div>

      <form action={action} className="space-y-5">
        <input type="hidden" name="targetPodId" value={podId} />

        <div>
          <label htmlFor="simulator-pod" className="block text-sm text-ink-950">
            Pod to simulate
          </label>
          <select
            id="simulator-pod"
            name="pod"
            value={podId}
            disabled={disabled}
            onChange={(event) => setPodId(event.target.value)}
            className="mt-1 w-full rounded border border-line-300 bg-surface-white px-3 py-2 text-sm text-ink-950 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/30 sm:max-w-xs"
          >
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {SLIDERS.map((slider) => {
            const value = values[slider.key];
            const before = baseline?.[slider.key];
            const moved = before !== undefined && before !== value;

            return (
              <div key={slider.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={`slider-${slider.key}`} className="text-sm text-ink-950">
                    {slider.label}
                    <span className="ml-1.5 text-2xs text-slate-500">({slider.weight}%)</span>
                  </label>
                  <span className="font-mono text-sm tabular-nums text-ink-950">
                    {value}
                    {moved && (
                      <span className="ml-1.5 text-xs text-signal-600">
                        {value > before! ? '▲' : '▼'} {Math.abs(value - before!)}
                      </span>
                    )}
                  </span>
                </div>
                <input
                  id={`slider-${slider.key}`}
                  name={slider.key}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  disabled={disabled}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      [slider.key]: Number(event.target.value),
                    }))
                  }
                  className="mt-2 w-full accent-signal-600"
                  aria-valuetext={`${value} out of 100${moved ? `, changed from ${before}` : ''}`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={disabled || pending || !podId}
            className="rounded bg-signal-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-motion-1 hover:bg-signal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Estimating…' : 'Estimate the effect'}
          </button>
          <span className="text-xs text-slate-500">
            Nothing is saved. Re-run it as often as you like.
          </span>
        </div>
      </form>

      {state.error && (
        <p role="alert" className="rounded border border-status-alert/40 bg-surface-white px-4 py-3 text-sm text-ink-950">
          {state.error}
        </p>
      )}

      {state.result && (
        <section
          className="rounded border border-line-200 bg-surface-white p-4"
          aria-live="polite"
          aria-label="Simulation result"
        >
          <h3 className="font-display text-lg text-ink-950">Estimated Unit Score</h3>

          <div className="mt-3">
            <ArithmeticStrip
              clauses={[
                { weight: 0.4, score: values.financial, label: 'financial performance' },
                { weight: 0.35, score: values.peer_review, label: 'peer review' },
                { weight: 0.25, score: values.strategic, label: 'strategic alignment' },
              ]}
              result={state.result.simulatedUnitScore}
              locked
            />
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Budget today</dt>
              <dd className="font-display text-2xl tabular-nums text-ink-950">
                {state.result.currentFinalBudget.toLocaleString('en-US')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Estimated budget</dt>
              <dd className="font-display text-2xl tabular-nums text-ink-950">
                {state.result.simulatedFinalBudget.toLocaleString('en-US')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Difference</dt>
              <dd
                className="font-display text-2xl tabular-nums"
                style={{
                  color:
                    state.result.delta > 0
                      ? 'var(--color-status-good, #1E7A4C)'
                      : state.result.delta < 0
                        ? 'var(--color-status-alert, #B23B3B)'
                        : 'var(--color-slate-500, #5B6672)',
                }}
              >
                {state.result.delta > 0 ? '▲' : state.result.delta < 0 ? '▼' : '·'}{' '}
                {Math.abs(state.result.delta).toLocaleString('en-US')}
                <span className="ml-1 text-sm text-slate-500">
                  ({state.result.deltaPercent > 0 ? '+' : ''}
                  {state.result.deltaPercent}%)
                </span>
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-slate-500">{state.result.assumption}</p>

          {state.result.capApplied && (
            <p className="mt-2 text-xs text-ink-700">
              At these scores the pod would reach the ceiling, so part of the gain is clipped and
              redistributed to the pods still under it — the estimated budget already reflects that.
            </p>
          )}

          <p className="mt-3 border-t border-line-200 pt-3 text-xs text-slate-500">
            Denominator: {state.result.podCount} pods, pool of{' '}
            {state.result.totalPool.toLocaleString('en-US')}.
          </p>
        </section>
      )}
    </div>
  );
}
