/**
 * Org-wide allocation bar — 05-MODULE-BUDGET-MARKET.md, `/budget/current-cycle`
 * layout item 2.
 *
 * One horizontal bar, one segment per pod, widths proportional to each pod's
 * share of the total pool. Hand-built: no chart library is needed for a single
 * stacked bar, and building it here keeps the segment boundaries exact rather
 * than subject to a library's padding and rounding.
 *
 * Colour is a **single-hue ramp**, not the status palette. Segments distinguish
 * pods from each other, which is a categorical encoding; the five status tokens
 * are reserved for state (12-DESIGN-SYSTEM.md §2.4: "status colour is earned,
 * not decorative"). Using status-green for the biggest pod would read as "this
 * pod is healthy", which is a different claim.
 *
 * Any remainder the ceiling made undistributable is drawn as its own hatched
 * segment. It is part of the pool, so hiding it would make the bar lie about the
 * total; drawing it in a pod colour would imply somebody received it.
 */

import Link from 'next/link';

export interface AllocationSegment {
  podId: string;
  podName: string;
  holdingName: string | null;
  finalBudget: number;
  shareOfPoolPercent: number;
  capApplied: boolean;
}

export interface AllocationBarProps {
  segments: AllocationSegment[];
  totalPool: number;
  /** Pool nobody could receive because every pod sat at the ceiling. */
  unallocated?: number;
  /** Set when the cycle is still provisional and the numbers may move. */
  provisional?: boolean;
  className?: string;
}

/** A single-hue ramp over the signal colour, darkest first. */
const RAMP = [
  '#17584A',
  '#1E6F5C',
  '#2C8471',
  '#4A9A88',
  '#6FB0A1',
  '#96C6BB',
  '#BADBD3',
  '#D6EAE5',
];

const HEIGHT = 34;

function rampColor(index: number): string {
  return RAMP[index % RAMP.length]!;
}

export function AllocationBar({
  segments,
  totalPool,
  unallocated = 0,
  provisional = false,
  className = '',
}: AllocationBarProps) {
  if (totalPool <= 0 || segments.length === 0) {
    return (
      <div
        className={`rounded border border-dashed border-line-300 bg-surface-white px-4 py-6 text-center text-sm text-slate-500 ${className}`}
      >
        No allocation to draw yet — the Architecture Hub sets the pool and runs the
        calculation for the active cycle.
      </div>
    );
  }

  const scale = (amount: number): string => `${((amount / totalPool) * 100).toFixed(4)}%`;

  return (
    <div className={className}>
      <div
        className="flex w-full overflow-hidden rounded border border-line-200 bg-paper-100"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={
          `Allocation of ${totalPool.toLocaleString('en-US')} across ${segments.length} pod` +
          `${segments.length === 1 ? '' : 's'}` +
          (unallocated > 0
            ? `, with ${unallocated.toLocaleString('en-US')} undistributable under the ceiling`
            : '')
        }
      >
        {segments.map((segment, index) => (
          <Link
            key={segment.podId}
            href={`/budget/${segment.podId}/breakdown`}
            className="group relative block h-full transition-opacity duration-motion-1 hover:opacity-80 focus-visible:opacity-80"
            style={{ width: scale(segment.finalBudget), backgroundColor: rampColor(index) }}
            title={`${segment.podName} — ${segment.finalBudget.toLocaleString('en-US')} (${segment.shareOfPoolPercent}%)${
              segment.capApplied ? ' · capped at the ceiling' : ''
            }`}
          >
            <span className="sr-only">
              {segment.podName}: {segment.finalBudget.toLocaleString('en-US')} of the pool (
              {segment.shareOfPoolPercent}
              %)
              {segment.capApplied ? ', capped at the ceiling' : ''}. Open the full calculation.
            </span>
            {/* A capped segment gets a notch so the ceiling is visible without
                relying on colour alone (12-DESIGN-SYSTEM.md §7: colour is never
                the only signal). */}
            {segment.capApplied && (
              <span
                aria-hidden
                className="absolute inset-y-0 right-0 w-[3px] bg-ink-950/45"
              />
            )}
          </Link>
        ))}

        {unallocated > 0 && (
          <div
            className="h-full border-l border-line-300"
            style={{
              width: scale(unallocated),
              backgroundImage:
                'repeating-linear-gradient(45deg, #E3E6E2 0 4px, #F7F8F6 4px 8px)',
            }}
            title={`Unallocated — ${unallocated.toLocaleString('en-US')} nobody could receive`}
          >
            <span className="sr-only">
              {unallocated.toLocaleString('en-US')} of the pool could not be distributed: every pod
              already sits at the ceiling, so there is nobody under it to receive the excess.
            </span>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
        {segments.map((segment, index) => (
          <li key={segment.podId} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: rampColor(index) }}
            />
            <Link
              href={`/budget/${segment.podId}/breakdown`}
              className="text-ink-700 underline-offset-2 hover:underline"
            >
              {segment.podName}
            </Link>
            <span className="tabular-nums">{segment.shareOfPoolPercent}%</span>
            {segment.capApplied && (
              <span className="rounded border border-line-200 px-1 text-2xs text-slate-500">
                capped
              </span>
            )}
          </li>
        ))}
        {unallocated > 0 && (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm border border-line-300"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, #E3E6E2 0 3px, #F7F8F6 3px 6px)',
              }}
            />
            <span className="text-ink-700">Unallocated</span>
            <span className="tabular-nums">
              {((unallocated / totalPool) * 100).toFixed(1)}%
            </span>
          </li>
        )}
      </ul>

      {provisional && (
        <p className="mt-2 text-xs text-slate-500">
          Provisional — these shares move as peer reviews and financial syncs arrive, until the
          cycle locks on Day 90.
        </p>
      )}
    </div>
  );
}
