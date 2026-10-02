/**
 * i18n-aware copies of small UI primitives.
 *
 * Same markup, same design tokens as the production components — with the
 * chrome strings pulled from the translation table and physical classes
 * swapped for logical ones so RTL (فارسی) mirrors correctly.
 */
import { useId, useRef, useState, type ReactNode } from 'react';
import type { StatusTone } from '../../../components/ui/StatusChip';
import { IconInfo } from '../../../components/ui/icons';
import type { RotationInfo } from '../../../core/rotation';
import type { PhaseDefinition } from '../../../core/calendar';
import { useI18n } from '../i18n';

/* ---------------------------------------------------------------- provenance */

const TONE_BORDER: Record<StatusTone, string> = {
  neutral: '#8B93A1',
  active: '#2B6CB0',
  good: '#1E7A4C',
  watch: '#B7791F',
  alert: '#B23B3B',
};

export interface ProvenanceI18nProps {
  source: string;
  updatedAt?: string;
  formula?: string;
  reference?: string;
  className?: string;
}

export function ProvenancePopoverI18n({
  source,
  updatedAt,
  formula,
  reference,
  className = '',
}: ProvenanceI18nProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = t('provenance.aria');

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
            className="absolute start-1/2 top-6 z-20 w-72 -translate-x-1/2 rounded border border-line-200 bg-white p-3 text-xs shadow-popover rtl:translate-x-1/2"
          >
            <dl className="space-y-2">
              <div>
                <dt className="text-slate-500">{t('provenance.source')}</dt>
                <dd className="text-ink-950">{source}</dd>
              </div>
              {updatedAt ? (
                <div>
                  <dt className="text-slate-500">{t('provenance.updated')}</dt>
                  <dd className="tabular text-ink-950">{updatedAt}</dd>
                </div>
              ) : null}
              {formula ? (
                <div>
                  <dt className="text-slate-500">{t('provenance.formula')}</dt>
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

/* --------------------------------------------------------------- data card */

export interface DataCardI18nProps {
  label: string;
  value?: ReactNode;
  unit?: string;
  hint?: string;
  tone?: StatusTone;
  provenance?: {
    source: string;
    updatedAt?: string;
    formula?: string;
    reference?: string;
  };
  footer?: ReactNode;
  className?: string;
  size?: 'default' | 'large';
}

export function DataCardI18n({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  provenance,
  footer,
  className = '',
  size = 'default',
}: DataCardI18nProps) {
  return (
    <div
      className={`data-card p-4 ${className}`}
      style={{ borderInlineStartColor: TONE_BORDER[tone] }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        {provenance ? <ProvenancePopoverI18n {...provenance} /> : null}
      </div>

      {value !== undefined ? (
        <p
          className={`tabular mt-1 font-display ${
            size === 'large' ? 'text-4xl' : 'text-2xl'
          } leading-none text-ink-950`}
        >
          {value}
          {unit ? <span className="ms-1 text-sm font-sans text-slate-500">{unit}</span> : null}
        </p>
      ) : null}

      {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
      {footer ? <div className="mt-3 border-t border-line-200 pt-3">{footer}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------- rotation badge */

function toneFor(state: RotationInfo['state']): string {
  switch (state) {
    case 'ending_soon':
      return '#B7791F';
    case 'expired':
    case 'vacant':
      return '#8B93A1';
    case 'open_ended':
      return '#2B6CB0';
    default:
      return '#1E6F5C';
  }
}

const SIZE = 18;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RotationBadgeI18n({
  role,
  info,
  label,
  className = '',
}: {
  role: string;
  info: RotationInfo;
  /** Translated countdown label, e.g. «۱۴ روز مانده». */
  label: string;
  className?: string;
}) {
  const color = toneFor(info.state);
  const progress = info.progress ?? 0;
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

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
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--line-200)" strokeWidth={STROKE} />
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
      <span className="tabular text-slate-500">{label}</span>
    </span>
  );
}

/** Translate a rotation countdown the way core/rotation does, per language. */
export function rotationLabelI18n(
  info: RotationInfo,
  t: (key: 'rotation.none' | 'rotation.openEnded' | 'rotation.ended' | 'rotation.endsToday' | 'rotation.oneDay' | 'rotation.daysLeft', vars?: Record<string, string | number>) => string,
  num: (value: number) => string,
): string {
  switch (info.state) {
    case 'vacant':
      return t('rotation.none');
    case 'open_ended':
      return t('rotation.openEnded');
    case 'expired':
      return t('rotation.ended');
    case 'ending_soon':
    case 'active':
      if (info.daysRemaining === 0) return t('rotation.endsToday');
      if (info.daysRemaining === 1) return t('rotation.oneDay');
      return t('rotation.daysLeft', { n: num(info.daysRemaining ?? 0) });
    default:
      return '';
  }
}

/* ------------------------------------------------------------ phase legend */

export function PhaseLegendI18n({
  phases,
  day,
}: {
  phases: PhaseDefinition[];
  day: number;
}) {
  const { t } = useI18n();
  return (
    <ul className="space-y-1">
      {phases.map((phase) => {
        const isCurrent = day >= phase.startDay && day <= phase.endDay;
        const isElapsed = day > phase.endDay;
        return (
          <li
            key={phase.id}
            className={`phase-legend-item flex items-start gap-2 border-l-2 py-1 pl-2 ${
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
                <span className="block text-xs text-slate-500">{t('calendar.complete')}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
