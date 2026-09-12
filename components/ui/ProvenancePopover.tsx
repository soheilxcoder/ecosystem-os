/**
 * Provenance Popover — 12-DESIGN-SYSTEM.md §4.
 *
 * "The formula is always one click away": every computed number in the product
 * carries this affordance, showing where the number came from, when it was last
 * calculated, and the formula that produced it (00-OVERVIEW.md §5.1).
 */

'use client';

import { useId, useRef, useState } from 'react';
import { IconInfo } from './icons';

export interface ProvenancePopoverProps {
  /** Human-readable description of the sources, e.g. "Financial sync, Q2". */
  source: string;
  /** When the number was last calculated. */
  updatedAt?: string;
  /** The formula or rule that produced the number. */
  formula?: string;
  /** Optional link to the appendix / rule version. */
  reference?: string;
  label?: string;
  className?: string;
}

export function ProvenancePopover({
  source,
  updatedAt,
  formula,
  reference,
  label = 'Where this number comes from',
  className = '',
}: ProvenancePopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-signal-600"
      >
        <IconInfo size={16} />
      </button>

      {open ? (
        <>
          {/* Click-away layer; the popover also closes on Escape. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            id={popoverId}
            role="dialog"
            aria-label={label}
            className="absolute left-1/2 top-6 z-20 w-72 -translate-x-1/2 rounded border border-line-200 bg-white p-3 text-left text-xs shadow-popover"
          >
            <dl className="space-y-2">
              <div>
                <dt className="text-slate-500">Calculated from</dt>
                <dd className="text-ink-950">{source}</dd>
              </div>
              {updatedAt ? (
                <div>
                  <dt className="text-slate-500">Last updated</dt>
                  <dd className="tabular text-ink-950">{updatedAt}</dd>
                </div>
              ) : null}
              {formula ? (
                <div>
                  <dt className="text-slate-500">Formula</dt>
                  <dd className="text-ink-950">{formula}</dd>
                </div>
              ) : null}
            </dl>
            {reference ? (
              <p className="mt-2 border-t border-line-200 pt-2 text-slate-500">{reference}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </span>
  );
}
