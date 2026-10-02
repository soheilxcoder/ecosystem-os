'use client';

/**
 * The breakdown screen's export controls.
 *
 * 05-MODULE-BUDGET-MARKET.md asks for a "[Download as PDF]" button "for pods
 * that want to archive/share their calculation externally". The repo carries no
 * PDF library, and inventing one for a single button would be the wrong trade —
 * so this drives the browser's own print pipeline, which produces a real PDF and
 * needs no dependency.
 *
 * The button is labelled for what it actually does. A control called "Download
 * as PDF" that hands over a JSON file would be exactly the kind of quiet
 * mismatch this module exists to eliminate.
 */

export interface BreakdownExportProps {
  /** The API path carrying the machine-readable calculation. */
  jsonHref: string;
  jsonFilename: string;
}

export function BreakdownExport({ jsonHref, jsonFilename }: BreakdownExportProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 transition-colors duration-motion-1 hover:border-signal-600 hover:text-signal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-600"
      >
        Print / Save as PDF
      </button>
      <a
        href={jsonHref}
        download={jsonFilename}
        className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 transition-colors duration-motion-1 hover:border-signal-600 hover:text-signal-600"
      >
        Download the calculation (JSON)
      </a>
    </div>
  );
}
