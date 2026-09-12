/**
 * Rotation Badge — 12-DESIGN-SYSTEM.md §2.4 "Rotation is drawn, not written".
 *
 * Anywhere a Pod Lead, Peer Validator or Coach seat appears, it renders with a
 * small radial countdown ring — the one place the spec says a custom glyph is
 * worth the investment, because it appears dozens of times and materially
 * reinforces "nothing here is permanent".
 */

import type { RotationInfo } from '../../core/rotation';
import { rotationLabel } from '../../core/rotation';

const SIZE = 18;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toneFor(state: RotationInfo['state']): string {
  switch (state) {
    case 'ending_soon':
      return '#B7791F'; // amber — rotation is about to turn over
    case 'expired':
      return '#8B93A1';
    case 'vacant':
      return '#8B93A1';
    case 'open_ended':
      return '#2B6CB0';
    default:
      return '#1E6F5C';
  }
}

export interface RotationBadgeProps {
  /** Role name shown in the pill, e.g. "Pod Lead". */
  role: string;
  info: RotationInfo;
  className?: string;
  /** Hide the text countdown and keep only the ring (very dense tables). */
  compact?: boolean;
}

export function RotationBadge({ role, info, className = '', compact = false }: RotationBadgeProps) {
  const color = toneFor(info.state);
  const progress = info.progress ?? 0;
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
  const label = rotationLabel(info);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-line-200 bg-white px-2 py-0.5 text-xs ${className}`}
      title={`${role} — ${label}`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
        className="shrink-0"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--line-200)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="font-medium text-ink-700">{role}</span>
      {compact ? null : <span className="tabular text-slate-500">{label}</span>}
    </span>
  );
}
