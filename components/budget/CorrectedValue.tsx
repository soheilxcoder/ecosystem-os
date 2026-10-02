/**
 * Side-by-side rendering of a corrected number (13-TECHNICAL-ARCHITECTURE §7).
 *
 * A Correction Record never overwrites the original row — so wherever a
 * corrected figure is displayed, the reader sees BOTH values: the original,
 * struck through and labelled "superseded", and the corrected figure with the
 * decision date and the reason. If no approved correction touches the field,
 * the value renders exactly as it always did.
 */

import type { CorrectionRecord } from '../../lib/types-hub';

interface CorrectedValueProps {
  /** The value the screen would normally show (the frozen original). */
  value: number;
  /** Approved corrections for this pod, any entity type. */
  corrections: CorrectionRecord[];
  /** The budget-result field this cell shows (`final_budget`, ...). */
  field: string;
  format: (value: number) => string;
}

export function CorrectedValue({ value, corrections, field, format }: CorrectedValueProps) {
  const correction = corrections.find(
    (c) => c.originalEntityType === 'budget_result' && c.fieldCorrected === field,
  );

  if (!correction) {
    return <>{format(value)}</>;
  }

  const corrected = Number(correction.correctedValue);
  const decidedOn = correction.decidedAt
    ? new Date(correction.decidedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <span
      className="inline-flex flex-col items-end gap-0.5"
      title={`Corrected${decidedOn ? ` on ${decidedOn}` : ''}: ${correction.reason}`}
    >
      <span>
        <s className="text-slate-500">{format(value)}</s>{' '}
        <span className="text-ink-950">{Number.isFinite(corrected) ? format(corrected) : String(correction.correctedValue)}</span>
        <span className="ml-1 rounded border border-status-watch/40 bg-surface-white px-1 text-2xs text-slate-500">
          corrected
        </span>
      </span>
      <span className="max-w-56 truncate text-2xs text-slate-500">
        superseded{decidedOn ? ` · ${decidedOn}` : ''} — {correction.reason}
      </span>
    </span>
  );
}
