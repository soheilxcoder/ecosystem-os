/** Small shared pieces for live screens: loading, errors, panels. */
import type { ReactNode } from 'react';
import { useI18n } from '../demo/src/i18n';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'en' ? 'fa' : 'en')}
      className="rounded-full border border-line-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-signal-600/50 hover:text-signal-700"
    >
      {lang === 'en' ? 'فارسی' : 'English'}
    </button>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="panel flex items-center gap-3 p-6 text-sm text-slate-500">
      <span className="boot-spinner" aria-hidden />
      {t('live.loading')}
    </div>
  );
}

export interface ApiFailure {
  status?: number;
  code?: string;
  message: string;
}

/** Renders a friendly “forbidden” panel for real 403s, or a generic error. */
export function ErrorPanel({ error, hint }: { error: unknown; hint?: string }) {
  const { t } = useI18n();
  const failure = error as ApiFailure;
  const forbidden = failure?.status === 403;
  return (
    <div className="panel border-s-2 border-s-status-watch p-5">
      <h2 className="font-display text-lg text-ink-950">
        {forbidden ? t('live.noAccess') : t('live.error')}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        {forbidden ? t('live.noAccessText') : failure?.message ?? String(error)}
      </p>
      {hint && <p className="mt-2 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function ScreenHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl text-ink-950">{title}</h1>
        {sub && <p className="mt-1 max-w-prose text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

/** Key/value stat tile used across live screens. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 font-display text-xl text-ink-950">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
