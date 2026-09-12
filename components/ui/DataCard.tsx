/**
 * Data Card — 12-DESIGN-SYSTEM.md §4.
 *
 * Used for every score / budget / health number in the product. Deliberately
 * *not* a rounded card with a soft shadow: a 1px hairline border plus a 2px left
 * border in the relevant status color reads as a ledger line item, so the eye
 * learns "bordered = a number I can trust" (§2 Layout concept).
 *
 * States: default / loading (skeleton) / stale (dimmed + timestamp banner).
 */

import type { ReactNode } from 'react';
import type { StatusTone } from './StatusChip';
import { ProvenancePopover } from './ProvenancePopover';

const TONE_BORDER: Record<StatusTone, string> = {
  neutral: '#8B93A1',
  active: '#2B6CB0',
  good: '#1E7A4C',
  watch: '#B7791F',
  alert: '#B23B3B',
};

export interface DataCardProps {
  /** The name of the number, e.g. "Cycle score". */
  label: string;
  /** The number itself (or any formatted value). */
  value?: ReactNode;
  /** Unit or qualifier, e.g. "of 100". */
  unit?: string;
  /** Supporting line under the value. */
  hint?: string;
  tone?: StatusTone;
  loading?: boolean;
  /** Set when the underlying data source is stale or unreachable. */
  stale?: boolean;
  staleMessage?: string;
  provenance?: {
    source: string;
    updatedAt?: string;
    formula?: string;
    reference?: string;
  };
  /** Optional footer row (trend, link, actions). */
  footer?: ReactNode;
  className?: string;
  /** Use the 36/48px "big number" treatment reserved for hero figures. */
  size?: 'default' | 'large';
}

export function DataCard({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  loading = false,
  stale = false,
  staleMessage,
  provenance,
  footer,
  className = '',
  size = 'default',
}: DataCardProps) {
  if (loading) {
    return (
      <div
        className={`data-card p-4 ${className}`}
        style={{ borderLeftColor: 'var(--line-300)' }}
        aria-busy="true"
      >
        <div className="skeleton h-3 w-24 animate-skeleton-pulse" />
        <div className="skeleton mt-3 h-8 w-32 animate-skeleton-pulse" />
        <div className="skeleton mt-3 h-3 w-40 animate-skeleton-pulse" />
      </div>
    );
  }

  return (
    <div
      className={`data-card p-4 ${stale ? 'opacity-70' : ''} ${className}`}
      style={{ borderLeftColor: TONE_BORDER[tone] }}
    >
      {stale && staleMessage ? (
        <p className="mb-2 border-b border-line-200 pb-2 text-xs text-status-watch">
          {staleMessage}
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        {provenance ? <ProvenancePopover {...provenance} /> : null}
      </div>

      {value !== undefined ? (
        <p
          className={`tabular mt-1 font-display ${
            size === 'large' ? 'text-4xl' : 'text-2xl'
          } leading-none text-ink-950`}
        >
          {value}
          {unit ? <span className="ml-1 text-sm font-sans text-slate-500">{unit}</span> : null}
        </p>
      ) : null}

      {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
      {footer ? <div className="mt-3 border-t border-line-200 pt-3">{footer}</div> : null}
    </div>
  );
}
