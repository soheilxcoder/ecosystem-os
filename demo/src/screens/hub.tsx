/**
 * Hub Console — four hubs, one surface. Fully bilingual.
 *
 * The Deployment Console section (pod registration + entry trials) is live
 * only for the `hub_deployment` persona (Dan Deploy); every other persona
 * sees the same flow read-only, which mirrors the live platform's
 * `hub.deploy_unit` permission gate.
 */
import { useState } from 'react';
import { StatusChip } from '../../../components/ui/StatusChip';
import { IconArrowRight } from '../../../components/ui/icons';
import type { Persona } from '../data';
import { TODAY } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

/** Add days to an ISO date — tiny helper for the demo trial timelines. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Trial {
  podName: string;
  holdingKey: 'holding.holding-pars' | 'holding.holding-dena';
  coachName: string;
  /** Days elapsed since the trial started (today included as day 1). */
  day: number;
  /** Day-90 decision deadline. */
  dueDate: string;
  criteriaMet: number;
  criteriaTotal: number;
}

const INITIAL_TRIALS: Trial[] = [
  {
    podName: 'pod.pod-cinder',
    holdingKey: 'holding.holding-dena',
    coachName: 'Cora Coach',
    day: 41,
    dueDate: addDays(TODAY, 49),
    criteriaMet: 3,
    criteriaTotal: 3,
  },
];

export function HubScreen({ persona }: { persona: Persona }) {
  const { t, num, date } = useI18n();
  const names = useNames();
  const restricted = !persona.isHubUser;
  const canDeploy = persona.roleType === 'hub_deployment';

  // --- deployment console demo state -------------------------------------
  const [podName, setPodName] = useState('');
  const [holdingKey, setHoldingKey] =
    useState<Trial['holdingKey']>('holding.holding-pars');
  const [coachName, setCoachName] = useState('Cora Coach');
  const [criteria, setCriteria] = useState([true, true, true]);
  const [trials, setTrials] = useState<Trial[]>(INITIAL_TRIALS);
  const [launchedName, setLaunchedName] = useState<string | null>(null);

  const criteriaMetCount = criteria.filter(Boolean).length;
  const effectiveName = podName.trim() || 'Flint';

  const launchPod = () => {
    if (!canDeploy) return;
    setTrials((prev) => [
      ...prev,
      {
        podName: effectiveName,
        holdingKey,
        coachName,
        day: 1,
        dueDate: addDays(TODAY, 89),
        criteriaMet: criteriaMetCount,
        criteriaTotal: 3,
      },
    ]);
    setLaunchedName(effectiveName);
    setPodName('');
    setCriteria([true, true, true]);
  };

  const inputCls =
    'w-full rounded-md border border-line-200 bg-white px-3 py-2 text-sm text-ink-950 focus:border-signal-600 focus:outline-none focus:ring-2 focus:ring-signal-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
  const labelCls = 'mb-1 block text-xs font-medium text-slate-500';
  const criterionKeys = ['deploy.c1', 'deploy.c2', 'deploy.c3'] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('hub.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('hub.sub')}</p>
      </header>

      {restricted && (
        <div className="mb-6 rounded border border-status-watch/40 bg-status-watch/10 px-4 py-3 text-sm text-ink-700">
          {t('hub.restricted', { role: t(persona.roleKey) })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="panel panel-hover p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.arch')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.archDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label={t('hub.rules', { n: num(42) })} />
            <StatusChip tone="watch" label={t('hub.pending', { n: num(1) })} />
          </div>
        </section>

        <section className="panel panel-hover p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.deploy')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.deployDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="active" label={t('hub.trial')} />
            <StatusChip tone="neutral" label={t('hub.pilots')} />
          </div>
        </section>

        <section className="panel panel-hover p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.coaching')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.coachingDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="good" label={t('hub.coverage')} />
            <StatusChip tone="watch" label={t('hub.rotateSoon')} />
          </div>
        </section>

        <section className="panel panel-hover p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-lg text-ink-950">{t('hub.strategic')}</h2>
            <IconArrowRight size={16} className="mt-1 text-slate-500 rtl:-scale-x-100" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{t('hub.strategicDesc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="neutral" label={t('hub.draftReport')} />
            <StatusChip tone="good" label={t('hub.published')} />
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ deployment console */}
      <section className="mt-6 panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-ink-950">{t('deploy.title')}</h2>
          <StatusChip tone={canDeploy ? 'good' : 'neutral'} label={t('status.trial')} />
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('deploy.sub')}</p>

        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            canDeploy
              ? 'border-status-good/40 bg-status-good/10 text-ink-700'
              : 'border-status-watch/40 bg-status-watch/10 text-ink-700'
          }`}
        >
          {canDeploy
            ? t('deploy.live')
            : t('deploy.gated', { role: t(persona.roleKey) })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* left column — the registration wizard */}
          <fieldset disabled={!canDeploy} className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="deploy-name" className={labelCls}>
                {t('deploy.podName')}
              </label>
              <input
                id="deploy-name"
                type="text"
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder={t('deploy.podNamePh')}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="deploy-holding" className={labelCls}>
                  {t('deploy.holding')}
                </label>
                <select
                  id="deploy-holding"
                  value={holdingKey}
                  onChange={(e) =>
                    setHoldingKey(e.target.value as Trial['holdingKey'])
                  }
                  className={inputCls}
                >
                  <option value="holding.holding-pars">{t('holding.holding-pars')}</option>
                  <option value="holding.holding-dena">{t('holding.holding-dena')}</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400">{t('deploy.newHolding')}</p>
              </div>
              <div>
                <label htmlFor="deploy-coach" className={labelCls}>
                  {t('deploy.coach')}
                </label>
                <select
                  id="deploy-coach"
                  value={coachName}
                  onChange={(e) => setCoachName(e.target.value)}
                  className={inputCls}
                >
                  <option value="Cora Coach">{names.personName('Cora Coach')}</option>
                  <option value="Darvish Coach">{names.personName('Darvish Coach')}</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400">{t('deploy.coachNote')}</p>
              </div>
            </div>
            <div>
              <span className={labelCls}>{t('deploy.criteria')}</span>
              <ul className="space-y-1.5">
                {criterionKeys.map((key, i) => (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={criteria[i]}
                        onChange={(e) =>
                          setCriteria((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                        }
                        className="h-4 w-4 rounded border-line-300 accent-signal-600"
                      />
                      {t(key)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={launchPod}
                className="rounded-md bg-signal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-signal-700 focus:outline-none focus:ring-2 focus:ring-signal-600/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('deploy.launch')}
              </button>
              <StatusChip
                tone={criteriaMetCount === 3 ? 'good' : 'watch'}
                label={t('deploy.criteriaMet', { n: num(criteriaMetCount), m: num(3) })}
              />
            </div>
            {launchedName && (
              <div className="rounded-md border border-status-good/40 bg-status-good/10 px-3 py-2 text-sm text-ink-700">
                {t('deploy.launched', { name: launchedName })}
              </div>
            )}
          </fieldset>

          {/* right column — entry trial board */}
          <div>
            <h3 className="text-sm font-medium text-ink-950">{t('deploy.trialsTitle')}</h3>
            <ul className="mt-2 space-y-3">
              {trials.map((trial, idx) => (
                <li
                  key={`${trial.podName}-${idx}`}
                  className="rounded-md border border-line-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-950">
                      {trial.podName.startsWith('pod.')
                        ? names.podName(trial.podName)
                        : trial.podName}
                    </span>
                    <StatusChip tone="watch" label={t('deploy.dayOf', { d: num(trial.day) })} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t(trial.holdingKey)} · {names.personName(trial.coachName)} ·{' '}
                    {t('deploy.criteriaMet', {
                      n: num(trial.criteriaMet),
                      m: num(trial.criteriaTotal),
                    })}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-status-watch transition-all"
                      style={{ width: `${Math.min(100, (trial.day / 90) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {t('deploy.due', { date: date(trial.dueDate) })}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-prose text-xs leading-relaxed text-slate-400">
              {t('deploy.trialRule')}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 panel panel-hover p-4">
        <h2 className="text-sm font-medium text-ink-950">{t('hub.notAdmin')}</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-500">{t('hub.notAdminText')}</p>
      </section>
    </div>
  );
}
