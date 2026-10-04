/**
 * Budget market — the real computation, live. Recompute runs the actual
 * budget engine; locking is attempted against the real Day 89–90 window and
 * the real permission gate.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApi, useSession } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader, Stat } from '../ui';
import { holdingFa, podFa } from './dashboard';

interface BudgetCycle {
  id: string;
  cycleNumber: number;
  status: string;
  totalPool: number;
  distributablePool: number;
  reservedForSurvival: number;
  formulaWeights: { financial: number; strategic: number; peer_review: number };
  capAmount: number;
  lockedAt: string | null;
  lockedBy: string | null;
  auditHash: string | null;
}

interface BudgetResult {
  podId: string;
  podName: string;
  holdingName: string;
  unitScore: number;
  survivalBudget: number;
  survivalBudgetApplied: boolean;
  formulaShare: number;
  capApplied: boolean;
  finalBudget: number;
  shareOfPoolPercent: number;
}

interface Checklist {
  cycleDay: number;
  phaseKey: string;
  inLockWindow: boolean;
  blockers: Array<{ reason: string; podName: string | null; detail: string }>;
  canLock: boolean;
}

interface CurrentPayload {
  budgetCycle: BudgetCycle;
  results: BudgetResult[];
  checklist: Checklist;
}

export function BudgetScreen() {
  const api = useApi();
  const { me } = useSession();
  const { t, num, money, lang } = useI18n();
  const [payload, setPayload] = useState<CurrentPayload | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<'compute' | 'lock' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'watch' | 'critical'; text: string } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    api
      .get<CurrentPayload>('/api/budget/cycle/current')
      .then((data) => !cancelled && setPayload(data))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => load(), [load]);

  const recompute = async () => {
    setBusy('compute');
    setNotice(null);
    try {
      await api.post('/api/budget/cycle/compute', {});
      setNotice({ tone: 'good', text: lang === 'fa' ? 'بودجه با موفقیت دوباره محاسبه شد.' : 'Budget recomputed successfully.' });
      load();
    } catch (err) {
      setNotice({ tone: 'critical', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const lock = async () => {
    setBusy('lock');
    setNotice(null);
    try {
      await api.post(`/api/budget/cycle/${payload?.budgetCycle.id}/lock`, {});
      setNotice({ tone: 'good', text: lang === 'fa' ? 'سیکل قفل شد و نتایج اعلام گردید.' : 'Cycle locked — results announced.' });
      load();
    } catch (err) {
      setNotice({ tone: 'watch', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorPanel error={error} />;
  if (!payload) return <Loading />;

  const { budgetCycle, results, checklist } = payload;
  const isArchitect = me?.roles.some((role) => role.roleType === 'hub_architecture') ?? false;

  return (
    <div>
      <ScreenHeader
        title={t('nav.budget')}
        sub={t('live.dataFresh')}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void recompute()}
            disabled={busy !== null}
            className="rounded-md border border-line-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 shadow-sm hover:border-signal-600/60 disabled:opacity-50"
          >
            {busy === 'compute' ? '…' : t('live.compute')}
          </button>
          <button
            type="button"
            onClick={() => void lock()}
            disabled={busy !== null || !checklist.inLockWindow}
            title={t('live.lockWindow')}
            className="rounded-md bg-signal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-signal-700 disabled:opacity-50"
          >
            {busy === 'lock' ? '…' : t('live.lock')}
          </button>
        </div>
      </ScreenHeader>

      {notice && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            notice.tone === 'good'
              ? 'border-status-good/40 bg-status-good/10 text-ink-900'
              : notice.tone === 'critical'
                ? 'border-status-critical/40 bg-status-critical/10 text-ink-900'
                : 'border-status-watch/40 bg-status-watch/10 text-ink-900'
          }`}
        >
          {notice.text}
          {busy !== null ? '' : ''}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t('live.pool')}
          value={money(budgetCycle.totalPool)}
          sub={`${t('live.cycle')} ${num(budgetCycle.cycleNumber)} — ${
            budgetCycle.status === 'locked' ? t('live.locked') : t('live.provisional')
          }`}
        />
        <Stat label={t('live.distributable')} value={money(budgetCycle.distributablePool)} />
        <Stat label={t('live.reserved')} value={money(budgetCycle.reservedForSurvival)} />
        <Stat
          label={t('live.weights')}
          value={`${num(budgetCycle.formulaWeights.financial)}٪ / ${num(budgetCycle.formulaWeights.peer_review)}٪ / ${num(budgetCycle.formulaWeights.strategic)}٪`}
          sub={lang === 'fa' ? 'مالی / داوری همتایان / راهبردی' : 'financial / peer review / strategic'}
        />
      </div>

      {budgetCycle.auditHash && (
        <div className="mt-4 panel p-4 text-xs text-slate-500">
          <span className="font-medium text-ink-950">{t('live.auditHash')}: </span>
          <span className="font-mono">{budgetCycle.auditHash}</span>
          {budgetCycle.lockedBy && (
            <span className="ms-3">
              {t('live.announcedBy')}: {budgetCycle.lockedBy}
            </span>
          )}
        </div>
      )}

      {/* lock checklist */}
      <section className="mt-6 panel p-4">
        <h2 className="text-sm font-medium text-ink-950">
          {lang === 'fa' ? 'چک‌لیست قفل' : 'Lock checklist'} — {t('live.day')} {num(checklist.cycleDay)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusChip
            tone={checklist.inLockWindow ? 'good' : 'neutral'}
            label={
              checklist.inLockWindow
                ? lang === 'fa' ? 'پنجرهٔ قفل باز است' : 'Lock window open'
                : lang === 'fa' ? 'خارج از پنجرهٔ قفل (روز ۸۹–۹۰)' : 'Outside lock window (Day 89–90)'
            }
          />
          <StatusChip
            tone={checklist.blockers.length === 0 ? 'good' : 'watch'}
            label={t('live.blockers') + `: ${num(checklist.blockers.length)}`}
          />
          {!isArchitect && (
            <StatusChip tone="neutral" label={lang === 'fa' ? 'فقط هاب معماری' : 'Architecture Hub only'} />
          )}
        </div>
        {checklist.blockers.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {checklist.blockers.map((blocker, i) => (
              <li key={i} className="rounded-md bg-status-watch/10 px-3 py-2 text-xs text-ink-900">
                {blocker.podName ? `${lang === 'fa' ? podFa(blocker.podName) : blocker.podName} — ` : ''}
                {blocker.detail}
              </li>
            ))}
          </ul>
        )}
        {!isArchitect && <p className="mt-2 text-xs text-slate-400">{t('live.needArchitecture')}</p>}
      </section>

      {/* per-pod results */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink-950">{t('live.podShare')}</h2>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 text-start font-medium">{t('live.podsTitle')}</th>
                <th className="px-4 py-2.5 text-end font-medium max-sm:hidden">
                  {lang === 'fa' ? 'امتیاز واحد' : 'Unit score'}
                </th>
                <th className="px-4 py-2.5 text-end font-medium max-md:hidden">
                  {lang === 'fa' ? 'سهم فرمول' : 'Formula share'}
                </th>
                <th className="px-4 py-2.5 text-end font-medium">
                  {lang === 'fa' ? 'بودجهٔ نهایی' : 'Final budget'}
                </th>
                <th className="px-4 py-2.5 text-end font-medium max-sm:hidden">٪</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.podId} className="border-b border-line-200 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-950">
                      {lang === 'fa' ? podFa(row.podName) : row.podName}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {lang === 'fa' ? holdingFa(row.holdingName) : row.holdingName}
                      {row.capApplied ? ` · ${t('live.cap')}` : ''}
                      {row.survivalBudgetApplied ? ` · ${t('live.reserved')}` : ''}
                    </span>
                  </td>
                  <td className="tabular px-4 py-3 text-end max-sm:hidden">{num(row.unitScore, 1)}</td>
                  <td className="tabular px-4 py-3 text-end text-slate-500 max-md:hidden">
                    {money(row.formulaShare)}
                  </td>
                  <td className="tabular px-4 py-3 text-end font-medium text-ink-950">
                    {money(row.finalBudget)}
                  </td>
                  <td className="tabular px-4 py-3 text-end text-slate-500 max-sm:hidden">
                    {num(row.shareOfPoolPercent, 1)}٪
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
