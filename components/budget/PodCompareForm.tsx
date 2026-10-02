/**
 * The history screen's pod and comparison filter — 05-MODULE-BUDGET-MARKET.md,
 * `/budget/history`: "Filter: compare against another pod (side-by-side chart) —
 * available to any user, reinforcing organization-wide transparency."
 *
 * A plain GET form rather than a client component: the filter is navigation, so
 * it works without JavaScript, produces a shareable URL, and cannot disagree
 * with what the server rendered.
 */

export interface PodCompareFormProps {
  pods: Array<{ id: string; name: string }>;
  selectedPodId: string | null;
  comparePodId: string | null;
  overlayComponents: boolean;
}

export function PodCompareForm({
  pods,
  selectedPodId,
  comparePodId,
  overlayComponents,
}: PodCompareFormProps) {
  if (pods.length === 0) return null;

  return (
    <form
      method="get"
      action="/budget/history"
      className="flex flex-wrap items-end gap-3 rounded border border-line-200 bg-surface-white p-4"
      aria-label="Choose which pods to compare"
    >
      <div>
        <label htmlFor="history-pod" className="block text-xs text-slate-500">
          Pod
        </label>
        <select
          id="history-pod"
          name="podId"
          defaultValue={selectedPodId ?? ''}
          className="mt-1 rounded border border-line-300 bg-surface-white px-3 py-2 text-sm text-ink-950 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/30"
        >
          {pods.map((pod) => (
            <option key={pod.id} value={pod.id}>
              {pod.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="history-compare" className="block text-xs text-slate-500">
          Compare with
        </label>
        <select
          id="history-compare"
          name="compare"
          defaultValue={comparePodId ?? ''}
          className="mt-1 rounded border border-line-300 bg-surface-white px-3 py-2 text-sm text-ink-950 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/30"
        >
          <option value="">No comparison</option>
          {pods
            .filter((pod) => pod.id !== selectedPodId)
            .map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
        </select>
      </div>

      {/* Carried through so applying a filter does not silently reset the
          component overlay the reader had chosen. */}
      <input type="hidden" name="overlay" value={overlayComponents ? 'on' : 'off'} />

      <button
        type="submit"
        className="rounded border border-line-300 bg-surface-white px-4 py-2 text-sm font-medium text-ink-950 transition-colors duration-motion-1 hover:border-signal-600 hover:text-signal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-600"
      >
        Apply
      </button>

      <p className="w-full text-xs text-slate-500">
        Any pod&apos;s history is readable by anyone in the organisation. Cross-pod visibility is the
        default here, not a privilege to request.
      </p>
    </form>
  );
}
