/**
 * i18n-aware copies of the Budget Market visualisations — same geometry,
 * colours and behaviour as production, with every visible string translated
 * and physical direction swapped for logical properties.
 */
import Link from '../shims/link';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useI18n } from '../i18n';
import { STRINGS, type StringKey } from '../i18n/translations';
import { ProvenancePopoverI18n } from './primitives';

/* ------------------------------------------------------------ allocation bar */

export interface AllocationSegment {
  podId: string;
  podName: string;
  holdingName: string | null;
  finalBudget: number;
  shareOfPoolPercent: number;
  capApplied: boolean;
}

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

export function AllocationBarI18n({
  segments,
  totalPool,
  unallocated = 0,
  provisional = false,
  className = '',
}: {
  segments: AllocationSegment[];
  totalPool: number;
  unallocated?: number;
  provisional?: boolean;
  className?: string;
}) {
  const { t, num, money } = useI18n();

  if (totalPool <= 0 || segments.length === 0) {
    return (
      <div
        className={`rounded border border-dashed border-line-300 bg-surface-white px-4 py-6 text-center text-sm text-slate-500 ${className}`}
      >
        {t('budget.emptyAllocation')}
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
        aria-label={t('budget.ariaAllocation', { pool: money(totalPool), n: num(segments.length) })}
      >
        {segments.map((segment, index) => (
          <Link
            key={segment.podId}
            href="/budget/breakdown"
            className="group relative block h-full transition-opacity duration-motion-1 hover:opacity-80 focus-visible:opacity-80"
            style={{ width: scale(segment.finalBudget), backgroundColor: rampColor(index) }}
            title={`${segment.podName} — ${money(segment.finalBudget)} (${num(segment.shareOfPoolPercent)}%)${
              segment.capApplied ? t('budget.ariaCappedSuffix') : ''
            }`}
          >
            <span className="sr-only">
              {t('budget.ariaSegment', {
                pod: segment.podName,
                amount: money(segment.finalBudget),
                share: num(segment.shareOfPoolPercent),
              })}
              {segment.capApplied ? t('budget.ariaCappedSuffix') : ''}
            </span>
            {segment.capApplied && (
              <span aria-hidden className="absolute inset-y-0 end-0 w-[3px] bg-ink-950/45" />
            )}
          </Link>
        ))}
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
              href="/budget/breakdown"
              className="text-ink-700 underline-offset-2 hover:underline"
            >
              {segment.podName}
            </Link>
            <span className="tabular-nums">{num(segment.shareOfPoolPercent)}%</span>
            {segment.capApplied && (
              <span className="rounded border border-line-200 px-1 text-2xs text-slate-500">
                {t('budget.capped')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {provisional && (
        <p className="mt-2 text-xs text-slate-500">
          {t('budget.provisionalNote')}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- lock checklist */

function reasonLabel(reason: string, t: ReturnType<typeof useI18n>['t']): string {
  const key = `lock.reason.${reason}` as StringKey;
  return key in STRINGS ? t(key) : reason.replace(/_/g, ' ');
}

export interface ChecklistBlocker {
  reason: string;
  podId: string | null;
  podName: string | null;
  detail: string;
}

export function LockChecklistI18n({
  cycleNumber,
  status,
  cycleDay,
  phaseName,
  inLockWindow,
  calculated,
  blockers,
  canLock,
  className = '',
}: {
  cycleNumber: number;
  status: 'provisional' | 'locked';
  cycleDay: number | null;
  /** Translated phase label for the lock-window note. */
  phaseName: string;
  inLockWindow: boolean;
  calculated: boolean;
  blockers: ChecklistBlocker[];
  canLock: boolean;
  className?: string;
}) {
  const { t, num } = useI18n();
  const locked = status === 'locked';

  const rows: Array<{ label: string; done: boolean; note: string }> = [
    {
      label: t('lock.row1'),
      done: calculated,
      note: calculated ? t('lock.row1Done') : t('lock.row1Pending'),
    },
    {
      label: t('lock.row2'),
      done: blockers.length === 0,
      note:
        blockers.length === 0
          ? t('lock.row2Done')
          : t('lock.row2Pending', { n: num(blockers.length) }),
    },
    {
      label: t('lock.row3'),
      done: inLockWindow,
      note: inLockWindow
        ? cycleDay !== null
          ? t('lock.row3In', { day: num(cycleDay), phase: phaseName })
          : t('lock.row3InPlain')
        : cycleDay !== null
          ? t('lock.row3Out', { day: num(cycleDay) })
          : t('lock.row3Out', { day: '—' }),
    },
  ];

  return (
    <section
      className={`rounded border border-line-200 bg-surface-white ${className}`}
      style={{ borderInlineStart: '2px solid var(--color-status-watch, #B7791F)' }}
      aria-labelledby="budget-lock-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-200 px-4 py-3">
        <h2 id="budget-lock-heading" className="font-display text-lg text-ink-950">
          {t('lock.heading', { n: num(cycleNumber) })}
        </h2>
        {locked ? (
          <StatusChip tone="good" label={t('lock.locked')} />
        ) : canLock ? (
          <StatusChip tone="active" label={t('lock.ready')} />
        ) : (
          <StatusChip tone="watch" label={t('lock.provisional')} />
        )}
      </header>

      <ul className="divide-y divide-line-200">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-3 px-4 py-2.5">
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-2xs ${
                row.done
                  ? 'border-status-good bg-status-good text-white'
                  : 'border-line-300 bg-surface-white text-transparent'
              }`}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-950">{row.label}</p>
              <p className="text-xs text-slate-500">{row.note}</p>
            </div>
          </li>
        ))}
      </ul>

      {blockers.length > 0 && (
        <div className="border-t border-line-200 px-4 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('lock.missing')}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {blockers.map((blocker, index) => (
              <li key={`${blocker.reason}-${blocker.podId ?? 'org'}-${index}`} className="text-sm">
                <span className="text-ink-950">
                  {reasonLabel(blocker.reason, t)}
                </span>
                {blocker.podName && <span className="text-slate-500"> · {blocker.podName}</span>}
                <span className="block text-xs text-slate-500">{blocker.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------- component bars */

export interface ComponentBarProps {
  label: string;
  weight: number;
  score: number;
  weightedContribution: number;
  explanation: string | null;
  /** Translated normalization label, e.g. «صدک داوری‌شدهٔ همتایان». */
  normalizationLabel: string;
  /** Pre-translated raw inputs for the audit details block. */
  rawInputs: Array<{ label: string; value: string | number }>;
  calculatedAt?: string;
  estimated?: boolean;
  reference?: string;
}

export function ComponentSubBarsI18n({
  components,
  className = '',
}: {
  components: ComponentBarProps[];
  className?: string;
}) {
  const { t, num } = useI18n();

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
                <span className="text-2xs text-slate-500">({num(component.weight)}%)</span>
                {component.estimated && (
                  <span
                    className="rounded border border-status-watch/40 px-1 text-2xs text-ink-700"
                    title={t('breakdown.estimatedTooltip')}
                  >
                    {t('breakdown.estimated')}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm tabular-nums text-ink-950">
                  {num(component.score)}
                  <span className="text-slate-500">/100</span>
                </span>
                <span className="text-2xs text-slate-500">←</span>
                <span className="font-mono text-sm tabular-nums text-signal-600">
                  +{num(component.weightedContribution, 2)}
                </span>
                <ProvenancePopoverI18n
                  source={`${component.normalizationLabel} — ${component.label}`}
                  updatedAt={component.calculatedAt}
                  formula={t('breakdown.componentFormula', {
                    weight: num(component.weight),
                    score: num(component.score),
                  })}
                  reference={component.reference}
                />
              </div>
            </div>

            <div className="relative mt-2 h-2 w-full rounded-sm bg-paper-100">
              <div
                className="absolute inset-y-0 start-0 rounded-sm bg-signal-200"
                style={{ width: `${width}%` }}
                aria-hidden
              />
              <div
                className="absolute inset-y-0 start-0 rounded-sm bg-signal-600"
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
