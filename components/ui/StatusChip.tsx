/**
 * Status Chip — 12-DESIGN-SYSTEM.md §4.
 *
 * Five tones only, and color is never the sole signal: every chip pairs its dot
 * with a text label (§6 accessibility floor).
 */

import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'active' | 'good' | 'watch' | 'alert';

const TONE_STYLES: Record<StatusTone, { dot: string; border: string; text: string }> = {
  // draft / not started
  neutral: { dot: '#8B93A1', border: 'rgba(139,147,161,0.35)', text: 'var(--ink-700)' },
  // in progress / active
  active: { dot: '#2B6CB0', border: 'rgba(43,108,176,0.35)', text: 'var(--ink-700)' },
  // completed / passed / healthy
  good: { dot: '#1E7A4C', border: 'rgba(30,122,76,0.35)', text: 'var(--ink-700)' },
  // flagged / at risk
  watch: { dot: '#B7791F', border: 'rgba(183,121,31,0.4)', text: 'var(--ink-700)' },
  // action required
  alert: { dot: '#B23B3B', border: 'rgba(178,59,59,0.4)', text: 'var(--ink-700)' },
};

export interface StatusChipProps {
  tone: StatusTone;
  label: string;
  /** Optional short meta line, e.g. a date. */
  meta?: string;
  className?: string;
  children?: ReactNode;
}

export function StatusChip({ tone, label, meta, className = '', children }: StatusChipProps) {
  const style = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border bg-white px-2 py-0.5 text-xs ${className}`}
      style={{ borderColor: style.border, color: style.text }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      <span className="font-medium">{label}</span>
      {meta ? <span className="text-slate-500">{meta}</span> : null}
      {children}
    </span>
  );
}

/** Maps a pod's lifecycle status onto the chip vocabulary. */
export function podStatusTone(status: string): StatusTone {
  switch (status) {
    case 'trial':
      return 'active';
    case 'active':
      return 'good';
    case 'accountability':
      return 'watch';
    case 'dissolved':
      return 'neutral';
    default:
      return 'neutral';
  }
}
