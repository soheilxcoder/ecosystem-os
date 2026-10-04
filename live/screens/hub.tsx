/**
 * Hub console — live. Everything here hits the real API: the trial board,
 * the rule registry, model health, pilots, and the pod-registration wizard
 * (POST /api/hub/deployment/pods — gated by the real hub.deploy_unit
 * permission, so only dan@example.org can actually launch).
 */
import { useCallback, useEffect, useState } from 'react';
import { useApi, useSession } from '../store';
import { useI18n } from '../../demo/src/i18n';
import { StatusChip } from '../../components/ui/StatusChip';
import { ErrorPanel, Loading, ScreenHeader } from '../ui';
import { holdingFa, podFa } from './dashboard';

interface Trial {
  podId: string;
  podName: string;
  holdingName: string;
  trialId: string;
  decisionDueDate: string;
  daysRemaining: number;
  criteriaMet: number;
  criteriaTotal: number;
  completionPercent: number;
}

interface SetupUser {
  id: string;
  fullName: string;
  email: string;
}

interface ModelHealth {
  activeRuleCount: number;
  pendingChangeCount: number;
}

interface Pilot {
  id: string;
  name: string;
  currentPhase: string;
}

export function HubScreen() {
  const api = useApi();
  const { me } = useSession();
  const { t, num, date, lang } = useI18n();

  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [trialsError, setTrialsError] = useState<unknown>(null);
  const [setupUsers, setSetupUsers] = useState<SetupUser[] | null>(null);
  const [holdings, setHoldings] = useState<Array<{ id: string; name: string }>>([]);
  const [health, setHealth] = useState<ModelHealth | null>(null);
  const [pilots, setPilots] = useState<Pilot[] | null>(null);

  const isDeployment = me?.roles.some((r) => r.roleType === 'hub_deployment') ?? false;
  const isArchitecture = me?.roles.some((r) => r.roleType === 'hub_architecture') ?? false;

  // --- launch form state --------------------------------------------------
  const [podName, setPodName] = useState('');
  const [holdingId, setHoldingId] = useState('');
  const [coachUserId, setCoachUserId] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [memberEmails, setMemberEmails] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setTrialsError(null);
    api
      .get<Trial[]>('/api/hub/deployment/trials')
      .then((rows) => !cancelled && setTrials(rows))
      .catch((err) => !cancelled && setTrialsError(err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!isDeployment) return;
    let cancelled = false;
    api
      .get<{ users: SetupUser[] }>('/api/hub/deployment/setup-data')
      .then((data) => {
        if (cancelled) return;
        setSetupUsers(data.users);
        const coach = data.users.find((u) => u.email.startsWith('cora'));
        if (coach) setCoachUserId(coach.id);
      })
      .catch(() => undefined);
    api
      .get<Pilot[]>('/api/hub/pilots')
      .then((rows) => !cancelled && setPilots(rows))
      .catch(() => !cancelled && setPilots([]));
    return () => {
      cancelled = true;
    };
  }, [api, isDeployment]);

  useEffect(() => {
    if (!me) return;
    setHoldings(me.holdings);
    if (me.holdings[0]) setHoldingId(me.holdings[0].id);
  }, [me]);

  useEffect(() => {
    if (!isArchitecture) return;
    let cancelled = false;
    api
      .get<ModelHealth>('/api/hub/architecture/model-health')
      .then((data) => !cancelled && setHealth(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, isArchitecture]);

  const launch = async () => {
    setLaunching(true);
    setLaunchNotice(null);
    try {
      const emails = memberEmails
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await api.post<{ pod?: { name: string }; name?: string }>(
        '/api/hub/deployment/pods',
        {
          name: podName.trim(),
          holdingId,
          memberEmails: emails.length > 0 ? emails : [leadEmail],
          leadEmail: leadEmail || null,
          coachUserId: coachUserId || null,
          criteria: [
            { label: 'Pod lead selected', met: Boolean(leadEmail) },
            { label: 'Coach assigned', met: Boolean(coachUserId) },
            { label: 'At least 3 founding members', met: emails.length >= 3 },
          ],
        },
      );
      const name = created?.pod?.name ?? created?.name ?? podName.trim();
      setLaunchNotice({
        tone: 'good',
        text: t('deploy.launched', { name: lang === 'fa' ? podFa(name) : name }),
      });
      setPodName('');
      setLeadEmail('');
      setMemberEmails('');
      load();
    } catch (err) {
      setLaunchNotice({ tone: 'critical', text: (err as Error).message });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div>
      <ScreenHeader title={t('hub.h1')} sub={t('hub.sub')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* trial board */}
        <section className="panel p-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink-950">{t('deploy.trialsTitle')}</h2>
          {trialsError ? (
            <div className="mt-3">
              <ErrorPanel error={trialsError} />
            </div>
          ) : trials === null ? (
            <Loading />
          ) : trials.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">{t('live.inboxEmpty')}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {trials.map((trial) => (
                <li key={trial.trialId} className="rounded-md border border-line-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-950">
                      {lang === 'fa' ? podFa(trial.podName) : trial.podName}
                    </span>
                    <StatusChip
                      tone="watch"
                      label={t('live.daysRemaining', { n: num(trial.daysRemaining) })}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {lang === 'fa' ? holdingFa(trial.holdingName) : trial.holdingName} ·{' '}
                    {t('deploy.due', { date: date(trial.decisionDueDate) })}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-status-watch"
                      style={{ width: `${trial.completionPercent}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {t('live.criteriaProgress', {
                      met: num(trial.criteriaMet),
                      total: num(trial.criteriaTotal),
                      percent: num(trial.completionPercent),
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-slate-400">{t('deploy.trialRule')}</p>
        </section>

        {/* side column */}
        <div className="space-y-4">
          <section className="panel p-4">
            <h2 className="text-sm font-medium text-ink-950">{t('live.modelHealth')}</h2>
            {health ? (
              <div className="mt-2 space-y-1.5 text-sm text-slate-600">
                <p>{t('live.activeRules', { n: num(health.activeRuleCount) })}</p>
                <p>{t('live.pendingChanges', { n: num(health.pendingChangeCount) })}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">{t('live.needArchitecture')}</p>
            )}
          </section>
          <section className="panel p-4">
            <h2 className="text-sm font-medium text-ink-950">{t('live.pilots')}</h2>
            {pilots === null ? (
              <p className="mt-2 text-xs text-slate-400">{t('live.needDeployment')}</p>
            ) : pilots.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t('live.inboxEmpty')}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {pilots.map((pilot) => (
                  <li key={pilot.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink-900">{pilot.name}</span>
                    <span className="text-xs text-slate-400">{pilot.currentPhase}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* launch wizard */}
      <section className="mt-6 panel p-5">
        <h2 className="font-display text-lg text-ink-950">{t('live.launchPod')}</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('live.launchPodText')}</p>

        {!isDeployment ? (
          <div className="mt-3 rounded-md border border-status-watch/40 bg-status-watch/10 px-3 py-2 text-xs text-ink-700">
            {t('live.needDeployment')}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <label htmlFor="launch-name" className="mb-1 block text-xs font-medium text-slate-500">
                {t('deploy.podName')}
              </label>
              <input
                id="launch-name"
                type="text"
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder={t('deploy.podNamePh')}
                className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="launch-holding" className="mb-1 block text-xs font-medium text-slate-500">
                  {t('deploy.holding')}
                </label>
                <select
                  id="launch-holding"
                  value={holdingId}
                  onChange={(e) => setHoldingId(e.target.value)}
                  className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none"
                >
                  {holdings.map((holding) => (
                    <option key={holding.id} value={holding.id}>
                      {lang === 'fa' ? holdingFa(holding.name) : holding.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="launch-coach" className="mb-1 block text-xs font-medium text-slate-500">
                  {t('deploy.coach')}
                </label>
                <select
                  id="launch-coach"
                  value={coachUserId}
                  onChange={(e) => setCoachUserId(e.target.value)}
                  className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none"
                >
                  <option value="">—</option>
                  {(setupUsers ?? [])
                    .filter((u) => u.fullName.toLowerCase().includes('coach'))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="launch-lead" className="mb-1 block text-xs font-medium text-slate-500">
                {t('live.lead')} (email)
              </label>
              <input
                id="launch-lead"
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                placeholder="lead@example.org"
                className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20"
              />
            </div>
            <div>
              <label htmlFor="launch-members" className="mb-1 block text-xs font-medium text-slate-500">
                {t('live.members')} (emails, comma-separated)
              </label>
              <input
                id="launch-members"
                type="text"
                value={memberEmails}
                onChange={(e) => setMemberEmails(e.target.value)}
                placeholder="m1@example.org, m2@example.org, m3@example.org"
                className="w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20"
              />
            </div>
            <div className="lg:col-span-2">
              <button
                type="button"
                onClick={() => void launch()}
                disabled={launching || !podName.trim() || !holdingId}
                className="rounded-md bg-signal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-signal-700 disabled:opacity-50"
              >
                {launching ? '…' : t('deploy.launch')}
              </button>
            </div>
            {launchNotice && (
              <div
                className={`rounded-md border px-3 py-2 text-sm lg:col-span-2 ${
                  launchNotice.tone === 'good'
                    ? 'border-status-good/40 bg-status-good/10 text-ink-900'
                    : 'border-status-critical/40 bg-status-critical/10 text-ink-900'
                }`}
              >
                {launchNotice.text}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
