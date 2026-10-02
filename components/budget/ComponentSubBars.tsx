/**
 * The three weighted component sub-bars — 05-MODULE-BUDGET-MARKET.md,
 * `/budget/current-cycle` layout item 4 and `/budget/:podId/breakdown` steps 1–3.
 *
 * Each row shows three things the spec asks for explicitly: the raw component
 * score on the 0–100 scale, the weighted contribution, and a one-line "why".
 * The bar's length is the raw score and its filled portion is the weighted
 * contribution, so the two numbers the reader has to relate are drawn in the
 * same unit rather than one being a number and the other a shape.
 *
 * An estimated component — one whose input was missing and fell back to the
 * midpoint — is marked in the row itself. Scoring a pod on an estimate is
 * legitimate while a cycle is provisional and illegitimate once it is announced,
 * so the reader has to be able to tell which kind of number they are looking at.
 */

import { ProvenancePopover } from '../ui/ProvenancePopover';

export interface ComponentBarProps {
  label: string;
  /** Whole percentage weight, e.g. 40. */
  weight: number;
  /** Raw score, 0–100. */
  score: number;
  /** weight/100 × score — the clause's contribution to the Unit Score. */
  weightedContribution: number;
  /** The one-line "why" the spec requires on every sub-bar. */
  explanation: string | null;
  /** How the raw input became this score. */
  normalizationMethod: string;
  /** The values behind the score, for the provenance popover. */
  rawInputs: Record<string, unknown>;
  calculatedAt?: string;
  /** True when the input was missing and the score is a midpoint estimate. */
  estimated?: boolean;
  reference?: string;
}

export interface ComponentSubBarsProps {
  components: ComponentBarProps[];
  className?: string;
}

export function ComponentSubBars({ components, className = '' }: ComponentSubBarsProps) {
  return (
    <ul className={`divide-y divide-line-200 ${className}`}>
      {components.map((component) => {
        const width = Math.min(100, Math.max(0, component.score));
        const contributionWidth = Math.min(100, Math.max(0, component.weightedContribution));

        return (
          <li key={component.label} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-ink-950">{component.label}</span>
                <span className="text-2xs text-slate-500">({component.weight}%)</span>
                {component.estimated && (
                  <span
                    className="rounded border border-status-watch/40 px-1 text-2xs text-ink-700"
                    title="This component's input was missing, so it is shown at the midpoint. It can inform a provisional estimate but blocks the cycle from locking."
                  >
                    estimated
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm tabular-nums text-ink-950">
                  {component.score}
                  <span className="text-slate-500">/100</span>
                </span>
                <span className="text-2xs text-slate-500">→</span>
                <span className="font-mono text-sm tabular-nums text-signal-600">
                  +{component.weightedContribution}
                </span>
                <ProvenancePopover
                  source={`${component.normalizationMethod.replace(/_/g, ' ')} — ${component.label.toLowerCase()}`}
                  updatedAt={component.calculatedAt}
                  formula={`${component.weight}% weight × ${component.score} raw score`}
                  reference={component.reference}
                />
              </div>
            </div>

            {/* Two stacked tracks: the outer is the raw score, the inner the
                weighted contribution. Same unit, so the relationship is visible
                instead of having to be computed in the reader's head. */}
            <div className="relative mt-2 h-2 w-full rounded-sm bg-paper-100">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-signal-200"
                style={{ width: `${width}%` }}
                aria-hidden
              />
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-signal-600"
                style={{ width: `${contributionWidth}%` }}
                aria-hidden
              />
            </div>

            {component.explanation && (
              <p className="mt-1.5 text-xs text-slate-500">{component.explanation}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
