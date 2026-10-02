/**
 * Score and budget trend — 05-MODULE-BUDGET-MARKET.md, `/budget/history`.
 *
 * Hand-built SVG. The repo carries no chart library, and the two things this has
 * to do — plot a pod's Unit Score across cycles and optionally overlay its three
 * component sub-scores — are both ordinary line work that a dependency would not
 * do more correctly.
 *
 * The Unit Score line is the signal colour and the component lines are slate at
 * reduced weight, because the components are the *explanation* of the score
 * rather than three more series competing with it. Colours are never the only
 * channel: every line is also listed with its latest value underneath, and each
 * point carries a <title> so the value is reachable without hover.
 */

export interface ScoreTrendPoint {
  cycleNumber: number;
  unitScore: number | null;
  finalBudget: number | null;
  components: Partial<Record<'financial' | 'peer_review' | 'strategic', number>>;
  status: 'provisional' | 'locked';
}

export interface ScoreTrendProps {
  points: ScoreTrendPoint[];
  /** Show the three component lines as well as the Unit Score. */
  overlayComponents?: boolean;
  height?: number;
  className?: string;
}

const WIDTH = 720;
const PADDING = { top: 14, right: 16, bottom: 26, left: 34 };

const SERIES = [
  { key: 'unit', label: 'Unit Score', color: '#1E6F5C', width: 2 },
  { key: 'financial', label: 'Financial (40%)', color: '#5B6672', width: 1.25 },
  { key: 'peer_review', label: 'Peer review (35%)', color: '#98A1AC', width: 1.25 },
  { key: 'strategic', label: 'Strategic (25%)', color: '#CFD4CE', width: 1.25 },
] as const;

export function ScoreTrend({
  points,
  overlayComponents = false,
  height = 220,
  className = '',
}: ScoreTrendProps) {
  const plotted = points
    .filter((point) => point.unitScore !== null)
    // Chart left to right in cycle order even though the API returns newest first.
    .slice()
    .sort((a, b) => a.cycleNumber - b.cycleNumber);

  if (plotted.length === 0) {
    return (
      <div
        className={`rounded border border-dashed border-line-300 bg-surface-white px-4 py-8 text-center text-sm text-slate-500 ${className}`}
      >
        No completed cycles yet — the trend appears once a second cycle has been calculated.
      </div>
    );
  }

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const x = (index: number): number =>
    plotted.length === 1
      ? PADDING.left + innerWidth / 2
      : PADDING.left + (index / (plotted.length - 1)) * innerWidth;
  const y = (score: number): number => PADDING.top + innerHeight - (score / 100) * innerHeight;

  /**
   * Build an SVG path from a series that may contain gaps.
   *
   * A missing value breaks the path into a new subpath rather than being drawn
   * as zero: a cycle with no score is not a score of nothing, and connecting
   * across it would invent a trend that never happened.
   */
  const path = (values: Array<number | null | undefined>): string => {
    const commands: string[] = [];
    let penDown = false;

    values.forEach((value, index) => {
      if (value === null || value === undefined || !Number.isFinite(value)) {
        penDown = false;
        return;
      }
      const point = `${x(index).toFixed(2)},${y(value).toFixed(2)}`;
      commands.push(`${penDown ? 'L' : 'M'}${point}`);
      penDown = true;
    });

    return commands.join(' ');
  };

  const unitPath = path(plotted.map((point) => point.unitScore));
  const gridlines = [0, 25, 50, 75, 100];

  const latest = plotted[plotted.length - 1]!;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          `Unit Score across ${plotted.length} cycle${plotted.length === 1 ? '' : 's'}, ` +
          `most recent ${latest.unitScore} in cycle ${latest.cycleNumber}`
        }
      >
        {gridlines.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(value)}
              y2={y(value)}
              stroke="#E3E6E2"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className="fill-[#98A1AC] text-[10px]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {value}
            </text>
          </g>
        ))}

        {overlayComponents &&
          (['financial', 'peer_review', 'strategic'] as const).map((key, index) => (
            <path
              key={key}
              d={path(plotted.map((point) => point.components[key]))}
              fill="none"
              stroke={SERIES[index + 1]!.color}
              strokeWidth={SERIES[index + 1]!.width}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

        <path
          d={unitPath}
          fill="none"
          stroke={SERIES[0].color}
          strokeWidth={SERIES[0].width}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {plotted.map((point, index) => (
          <g key={point.cycleNumber}>
            <circle
              cx={x(index)}
              cy={y(point.unitScore ?? 0)}
              r={3}
              fill="#FFFFFF"
              stroke={SERIES[0].color}
              strokeWidth={1.5}
            >
              <title>{`Cycle ${point.cycleNumber}: Unit Score ${point.unitScore}${
                point.status === 'provisional' ? ' (provisional)' : ''
              }`}</title>
            </circle>
            {/* A provisional cycle's marker is hollow-dashed so an estimate is
                never drawn identically to an announced number. */}
            {point.status === 'provisional' && (
              <circle
                cx={x(index)}
                cy={y(point.unitScore ?? 0)}
                r={6}
                fill="none"
                stroke="#B7791F"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            )}
            <text
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[#5B6672] text-[10px]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {point.cycleNumber}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ backgroundColor: SERIES[0].color }} />
          Unit Score
          <span className="tabular-nums text-ink-700">{latest.unitScore}</span>
        </span>
        {overlayComponents &&
          (['financial', 'peer_review', 'strategic'] as const).map((key, index) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4"
                style={{ backgroundColor: SERIES[index + 1]!.color }}
              />
              {SERIES[index + 1]!.label}
              <span className="tabular-nums text-ink-700">
                {latest.components[key] ?? '—'}
              </span>
            </span>
          ))}
        <span className="text-2xs">Cycle →</span>
      </figcaption>
    </figure>
  );
}
