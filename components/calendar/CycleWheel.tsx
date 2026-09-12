/**
 * Cycle Wheel — 06-MODULE-SPRINT-CALENDAR.md, 12-DESIGN-SYSTEM.md §4.
 *
 * A radial ring of the five cycle phases, proportionally sized to their day
 * ranges, with a marker for today. Hand-built SVG: no chart library renders
 * this shape, and the spec calls for it specifically.
 *
 * Deliberately monochrome — elapsed and current phases in the signal colour,
 * upcoming ones in the neutral line colour. Status colours stay reserved for
 * status (§2.4: "status colour is earned, not decorative").
 *
 * Below 480px the wheel is replaced by `PipelineBar`, because a ring this dense
 * is unreadable on a narrow screen.
 */

import type { PhaseDefinition } from '../../core/calendar';

export interface CycleWheelProps {
  phases: PhaseDefinition[];
  day: number;
  totalDays: number;
  /** Rendered in the middle of the ring. */
  label?: string;
  size?: number;
}

const SIZE = 240;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CycleWheel({
  phases,
  day,
  totalDays,
  label,
  size = SIZE,
}: CycleWheelProps) {
  const safeDay = Math.min(Math.max(day, 0), totalDays);
  let offset = 0;

  return (
    <div className="hidden xs:block">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Cycle progress: day ${safeDay} of ${totalDays}${
          label ? `, ${label}` : ''
        }`}
        className="mx-auto"
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--line-200)"
            strokeWidth={STROKE}
          />

          {phases.map((phase) => {
            const length = phase.endDay - phase.startDay + 1;
            const fraction = length / totalDays;
            const dash = fraction * CIRCUMFERENCE;
            const isCurrent = safeDay >= phase.startDay && safeDay <= phase.endDay;
            const isElapsed = safeDay > phase.endDay;
            const strokeWidth = isCurrent ? STROKE + 6 : STROKE;
            // Keep the thicker current arc inside the same ring radius.
            const radius = isCurrent ? RADIUS : RADIUS;

            const element = (
              <circle
                key={phase.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={isElapsed || isCurrent ? 'var(--signal-600)' : 'var(--line-300)'}
                strokeOpacity={isCurrent ? 1 : isElapsed ? 0.55 : 1}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${phase.name} — days ${phase.startDay}–${phase.endDay}`}</title>
              </circle>
            );
            offset += dash;
            return element;
          })}

          {/* Today marker */}
          {safeDay > 0 ? (
            <g transform={`rotate(${(safeDay / totalDays) * 360} ${SIZE / 2} ${SIZE / 2})`}>
              <line
                x1={SIZE / 2}
                y1={STROKE / 2 - 6}
                x2={SIZE / 2}
                y2={STROKE + 10}
                stroke="var(--ink-950)"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </g>

        <text
          x={SIZE / 2}
          y={SIZE / 2 - 6}
          textAnchor="middle"
          className="font-display"
          style={{ fontSize: '2.25rem', fill: 'var(--ink-950)' }}
        >
          {safeDay}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 18}
          textAnchor="middle"
          style={{ fontSize: '0.75rem', fill: 'var(--slate-500)' }}
        >
          {`of ${totalDays} days`}
        </text>
      </svg>
    </div>
  );
}

/**
 * Linear fallback — the same five segments, used below 480px and anywhere a
 * compact representation is needed (the dashboard's cycle widget reuses this).
 */
export function PipelineBar({
  phases,
  day,
  totalDays,
}: {
  phases: PhaseDefinition[];
  day: number;
  totalDays: number;
}) {
  const safeDay = Math.min(Math.max(day, 0), totalDays);

  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden border border-line-200 bg-white">
        {phases.map((phase) => {
          const length = phase.endDay - phase.startDay + 1;
          const isCurrent = safeDay >= phase.startDay && safeDay <= phase.endDay;
          const isElapsed = safeDay > phase.endDay;
          return (
            <div
              key={phase.id}
              className="relative flex items-center justify-center"
              style={{
                width: `${(length / totalDays) * 100}%`,
                backgroundColor: isElapsed
                  ? 'rgba(30,111,92,0.55)'
                  : isCurrent
                    ? 'var(--signal-600)'
                    : 'var(--line-200)',
                borderRight: '1px solid #FFFFFF',
              }}
              title={`${phase.name} — days ${phase.startDay}–${phase.endDay}`}
            >
              {isCurrent ? (
                <span className="text-[10px] font-medium text-white">Day {safeDay}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-slate-500">
        <span>Day 1</span>
        <span className="tabular">
          Day {safeDay} of {totalDays}
        </span>
        <span>Day {totalDays}</span>
      </div>
    </div>
  );
}

/** Legend: the accessible, always-visible companion to the wheel. */
export function PhaseLegend({
  phases,
  day,
}: {
  phases: PhaseDefinition[];
  day: number;
}) {
  return (
    <ul className="space-y-1">
      {phases.map((phase) => {
        const isCurrent = day >= phase.startDay && day <= phase.endDay;
        const isElapsed = day > phase.endDay;
        return (
          <li
            key={phase.id}
            className={`flex items-start gap-2 border-l-2 py-1 pl-2 ${
              isCurrent ? 'border-signal-600' : 'border-line-200'
            }`}
          >
            <span
              className={`tabular w-16 shrink-0 text-xs ${
                isCurrent ? 'text-ink-950' : 'text-slate-500'
              }`}
            >
              {phase.startDay}–{phase.endDay}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm ${isCurrent ? 'font-medium text-ink-950' : 'text-ink-700'}`}
              >
                {phase.name}
              </span>
              {isCurrent ? (
                <span className="block text-xs text-slate-500">{phase.summary}</span>
              ) : null}
              {isElapsed ? (
                <span className="block text-xs text-slate-500">Complete</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
