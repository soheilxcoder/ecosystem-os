'use client';

/**
 * The New Pod / Unit / Holding wizard (Module 09, Deployment sub-console).
 *
 * Five steps mirroring the source model's onboarding sequence:
 *   1. Type          — pod in an existing holding, a brand-new holding, or a
 *                      pilot expansion (pre-filled from a pilot decision)
 *   2. Basics        — name, category, holding, initial members, size band
 *   3. Checklist     — the selection criteria that become the Entry Trial's
 *                      criteria record
 *   4. Platform      — data source, initial coach, trial start date
 *   5. Review        — summary + [Launch Pod], the system's ONLY pod creator
 *
 * The final submit is a plain form POST through the server action, so the
 * launch keeps every guarantee: membership, roles, coach, data source and an
 * Entry Trial, all in one audited step.
 */

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import type { HubActionState } from '../../app/actions/hub';
import { launchPod } from '../../app/actions/hub';
import type { ExpansionPrefill, SetupData } from '../../lib/types-hub';
import type { Holding } from '../../core/types';

export interface DeploymentWizardProps {
  holdings: Holding[];
  setup: SetupData;
  prefill: ExpansionPrefill | null;
  today: string;
}

type LaunchType = 'pod_in_holding' | 'new_holding' | 'pilot_expansion';

/** The four source-model selection criteria, pre-filled as the checklist. */
const DEFAULT_CRITERIA = [
  'Team size within the 15–30 band',
  'Leadership support confirmed (named sponsor)',
  'Financial/CRM system identified as connectable',
  'Non-critical to the holding confirmed',
];

const STEPS = ['Type', 'Basics', 'Checklist', 'Platform', 'Review'] as const;

export function DeploymentWizard({ holdings, setup, prefill, today }: DeploymentWizardProps) {
  const [step, setStep] = useState(0);
  const [launchType, setLaunchType] = useState<LaunchType>(
    prefill ? 'pilot_expansion' : 'pod_in_holding',
  );
  const [name, setName] = useState(prefill?.suggestedName ?? '');
  const [categoryTag, setCategoryTag] = useState('');
  const [holdingId, setHoldingId] = useState(
    prefill?.holdingId ?? holdings[0]?.id ?? '',
  );
  const [newHoldingName, setNewHoldingName] = useState('');
  const [memberEmails, setMemberEmails] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [criteria, setCriteria] = useState<string[]>(
    prefill ? [...DEFAULT_CRITERIA] : [...DEFAULT_CRITERIA],
  );
  const [criteriaMet, setCriteriaMet] = useState<boolean[]>(DEFAULT_CRITERIA.map(() => false));
  const [dataSourceSystem, setDataSourceSystem] = useState('');
  const [coachUserId, setCoachUserId] = useState('');
  const [trialStartDate, setTrialStartDate] = useState(today);
  const [formError, setFormError] = useState<string | null>(null);

  const [actionState, formAction, pending] = useActionState<HubActionState, FormData>(launchPod, {});

  const memberCount = useMemo(
    () =>
      memberEmails
        .split(/[\n,;]+/)
        .map((email) => email.trim())
        .filter(Boolean).length,
    [memberEmails],
  );

  const sizeNumber = teamSize.trim() === '' ? null : Number(teamSize);
  const sizeOutsideBand = sizeNumber !== null && (sizeNumber < 15 || sizeNumber > 30);

  const coaches = setup.roster.coaches;

  function validateCurrentStep(): string | null {
    if (step === 0) {
      if (launchType === 'new_holding' && !newHoldingName.trim()) {
        return 'Give the new holding a name.';
      }
      if (launchType !== 'new_holding' && !holdingId) {
        return 'Choose the holding for this unit.';
      }
    }
    if (step === 1) {
      if (!name.trim()) return 'The new pod needs a name.';
      if (memberCount === 0) return 'List at least one initial member email.';
      if (leadEmail.trim() && !memberEmails.toLowerCase().includes(leadEmail.trim().toLowerCase())) {
        return 'The initial Pod Lead must be one of the initial members.';
      }
    }
    if (step === 2) {
      if (criteria.every((c) => !c.trim())) {
        return 'Keep at least one selection criterion — it becomes the trial checklist.';
      }
    }
    if (step === 3) {
      if (trialStartDate === '') return 'The trial needs a start date.';
    }
    return null;
  }

  function next() {
    const error = validateCurrentStep();
    setFormError(error);
    if (!error) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Step indicator */}
      <ol className="flex flex-wrap items-center gap-2" aria-label="Wizard steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-2xs font-medium ${
                index === step
                  ? 'bg-ink-950 text-white'
                  : index < step
                    ? 'bg-ink-100 text-ink-950'
                    : 'bg-paper-100 text-slate-500'
              }`}
              aria-current={index === step ? 'step' : undefined}
            >
              {index + 1}
            </span>
            <span
              className={`text-xs ${index === step ? 'font-medium text-ink-950' : 'text-slate-500'}`}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && <span className="h-px w-4 bg-line-200" aria-hidden />}
          </li>
        ))}
      </ol>

      {prefill && (
        <div className="rounded border border-line-200 bg-paper-100 px-4 py-3 text-sm text-ink-950">
          <p className="font-medium">Expanding pilot “{prefill.pilotName}”</p>
          {prefill.lessonsLearned && (
            <p className="mt-1 text-xs text-slate-600">
              Lessons carried into this unit&apos;s archive: {prefill.lessonsLearned}
            </p>
          )}
        </div>
      )}

      {/* --- Step 1: Type --------------------------------------------------- */}
      {step === 0 && (
        <fieldset className="rounded border border-line-200 bg-surface-white p-4">
          <legend className="px-1 font-display text-lg text-ink-950">What are we launching?</legend>
          <div className="mt-3 space-y-2">
            {(
              [
                {
                  value: 'pod_in_holding',
                  title: 'New pod in an existing holding',
                  note: 'The common path — a unit inside a holding that already exists.',
                },
                {
                  value: 'new_holding',
                  title: 'New holding (from-zero founding)',
                  note: 'Creates the holding first, then the pod inside it.',
                },
                {
                  value: 'pilot_expansion',
                  title: 'Pilot expansion — next unit',
                  note: prefill
                    ? `Pre-filled from “${prefill.pilotName}”; lessons travel into the new pod's archive.`
                    : 'Open this wizard from an expanded pilot to use the prefill.',
                },
              ] as Array<{ value: LaunchType; title: string; note: string }>
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                  launchType === option.value
                    ? 'border-ink-950 bg-paper-100'
                    : 'border-line-200 bg-surface-white'
                }`}
              >
                <input
                  type="radio"
                  name="launchType"
                  value={option.value}
                  checked={launchType === option.value}
                  onChange={() => setLaunchType(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-950">{option.title}</span>
                  <span className="block text-xs text-slate-500">{option.note}</span>
                </span>
              </label>
            ))}
          </div>

          {launchType === 'new_holding' ? (
            <div className="mt-4">
              <label className="block text-xs font-medium text-ink-950" htmlFor="newHoldingName">
                New holding name
              </label>
              <input
                id="newHoldingName"
                name="newHoldingName"
                value={newHoldingName}
                onChange={(event) => setNewHoldingName(event.target.value)}
                placeholder="e.g. Holding Dena South"
                className="mt-1 w-full max-w-sm rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          ) : (
            <div className="mt-4">
              <label className="block text-xs font-medium text-ink-950" htmlFor="holdingId">
                Holding
              </label>
              <select
                id="holdingId"
                name="holdingId"
                value={holdingId}
                onChange={(event) => setHoldingId(event.target.value)}
                className="mt-1 w-full max-w-sm rounded border border-line-300 px-2.5 py-1.5 text-sm"
              >
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.id}>
                    {holding.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>
      )}

      {/* --- Step 2: Basics -------------------------------------------------- */}
      {step === 1 && (
        <fieldset className="rounded border border-line-200 bg-surface-white p-4">
          <legend className="px-1 font-display text-lg text-ink-950">Basics</legend>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="name">
                Pod name
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Pod Flint"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="categoryTag">
                Category tag <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="categoryTag"
                name="categoryTag"
                value={categoryTag}
                onChange={(event) => setCategoryTag(event.target.value)}
                placeholder="e.g. manufacturing"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-950" htmlFor="memberEmails">
                Initial members — one email per line
              </label>
              <textarea
                id="memberEmails"
                name="memberEmails"
                value={memberEmails}
                onChange={(event) => setMemberEmails(event.target.value)}
                rows={4}
                placeholder={'noor@example.org\nomar@example.org\nquinn@example.org'}
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
              <p className="mt-1 text-2xs text-slate-500">
                {memberCount} member(s) listed. People must have an org account — inviting
                brand-new users happens at sign-in, not here.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="leadEmail">
                Initial Pod Lead <span className="font-normal text-slate-500">(one of the members)</span>
              </label>
              <input
                id="leadEmail"
                name="leadEmail"
                value={leadEmail}
                onChange={(event) => setLeadEmail(event.target.value)}
                placeholder="email of one member"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="teamSize">
                Planned team size <span className="font-normal text-slate-500">(guidance)</span>
              </label>
              <input
                id="teamSize"
                name="teamSize"
                value={teamSize}
                onChange={(event) => setTeamSize(event.target.value)}
                inputMode="numeric"
                placeholder="15–30"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          {sizeOutsideBand && (
            <p className="mt-3 rounded border border-status-watch/40 bg-white px-3 py-2 text-xs text-ink-950">
              Outside the usual 15–30 pilot band — fine to proceed, but worth a second look at the
              selection checklist before launch.
            </p>
          )}
        </fieldset>
      )}

      {/* --- Step 3: Selection criteria checklist ---------------------------- */}
      {step === 2 && (
        <fieldset className="rounded border border-line-200 bg-surface-white p-4">
          <legend className="px-1 font-display text-lg text-ink-950">Selection criteria checklist</legend>
          <p className="mt-1 text-xs text-slate-500">
            This checklist becomes the Entry Trial&apos;s criteria record — tick what is already
            true; unticked items stay open on the trial tracker.
          </p>
          <div className="mt-3 space-y-2">
            {criteria.map((label, index) => (
              <div key={index} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name={`criteriaMet_${index}`}
                  value="on"
                  checked={criteriaMet[index] ?? false}
                  onChange={(event) => {
                    const nextMet = [...criteriaMet];
                    nextMet[index] = event.target.checked;
                    setCriteriaMet(nextMet);
                  }}
                  className="mt-1"
                />
                <input
                  type="text"
                  name={`criteriaLabel_${index}`}
                  value={label}
                  onChange={(event) => {
                    const nextLabels = [...criteria];
                    nextLabels[index] = event.target.value;
                    setCriteria(nextLabels);
                  }}
                  placeholder="Criterion"
                  className="w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setCriteria([...criteria, '']);
              setCriteriaMet([...criteriaMet, false]);
            }}
            className="mt-3 rounded border border-line-300 px-2.5 py-1 text-xs text-ink-700 hover:border-line-400"
          >
            + Add criterion
          </button>
          <input type="hidden" name="criteriaCount" value={criteria.length} />
        </fieldset>
      )}

      {/* --- Step 4: Platform setup ------------------------------------------ */}
      {step === 3 && (
        <fieldset className="rounded border border-line-200 bg-surface-white p-4">
          <legend className="px-1 font-display text-lg text-ink-950">Platform setup</legend>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="dataSourceSystem">
                Financial / CRM data source
              </label>
              <input
                id="dataSourceSystem"
                name="dataSourceSystem"
                value={dataSourceSystem}
                onChange={(event) => setDataSourceSystem(event.target.value)}
                placeholder="e.g. Main CRM (leave empty if none yet)"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
              <p className="mt-1 text-2xs text-slate-500">
                Connecting marks the source as “awaiting first sync” — budget scoring waits for
                real numbers, never invented ones.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="coachUserId">
                Initial coach (from the roster)
              </label>
              <select
                id="coachUserId"
                name="coachUserId"
                value={coachUserId}
                onChange={(event) => setCoachUserId(event.target.value)}
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">No coach yet</option>
                {coaches.map((coach) => (
                  <option key={coach.coachUserId} value={coach.coachUserId}>
                    {coach.fullName} — {coach.pods.length} pod(s), {coach.capacity}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="trialStartDate">
                Trial start date
              </label>
              <input
                id="trialStartDate"
                name="trialStartDate"
                type="date"
                value={trialStartDate}
                onChange={(event) => setTrialStartDate(event.target.value)}
                className="mt-1 w-full max-w-[200px] rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
              <p className="mt-1 text-2xs text-slate-500">Defaults to today; the 90-day clock runs from here.</p>
            </div>
          </div>
        </fieldset>
      )}

      {/* --- Step 5: Review & launch ------------------------------------------ */}
      {step === 4 && (
        <fieldset className="rounded border border-line-200 bg-surface-white p-4">
          <legend className="px-1 font-display text-lg text-ink-950">Review &amp; launch</legend>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Type</dt>
              <dd className="text-ink-950">
                {launchType === 'new_holding'
                  ? `New holding “${newHoldingName || '—'}” + first pod`
                  : launchType === 'pilot_expansion'
                    ? `Pilot expansion (${prefill?.pilotName ?? '—'})`
                    : 'New pod in an existing holding'}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="text-ink-950">{name || '—'}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Members</dt>
              <dd className="text-ink-950">
                {memberCount} member(s){leadEmail ? ` · lead ${leadEmail}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Trial</dt>
              <dd className="text-ink-950">
                starts {trialStartDate || today} · {criteria.filter((c) => c.trim()).length}-item
                checklist · {criteriaMet.filter(Boolean).length} already met
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Data source</dt>
              <dd className="text-ink-950">{dataSourceSystem || 'None connected yet'}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-slate-500">Coach</dt>
              <dd className="text-ink-950">
                {coaches.find((c) => c.coachUserId === coachUserId)?.fullName ?? 'Not assigned yet'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded border border-line-200 bg-paper-100 px-3 py-2 text-xs text-slate-600">
            Launching creates the pod in trial status with membership, seats, coach, data-source
            marker and Entry Trial in one audited action — and announces it to the whole org.
          </p>
        </fieldset>
      )}

      {/* Serialization for the server action */}
      <input type="hidden" name="pilotId" value={prefill && launchType === 'pilot_expansion' ? prefill.pilotId : ''} />
      {launchType !== 'new_holding' && <input type="hidden" name="holdingId" value={holdingId} />}
      {launchType === 'new_holding' && <input type="hidden" name="newHoldingName" value={newHoldingName} />}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="categoryTag" value={categoryTag} />
      <input type="hidden" name="memberEmails" value={memberEmails} />
      <input type="hidden" name="leadEmail" value={leadEmail} />
      <input type="hidden" name="dataSourceSystem" value={dataSourceSystem} />
      <input type="hidden" name="coachUserId" value={coachUserId} />
      <input type="hidden" name="trialStartDate" value={trialStartDate} />
      <input
        type="hidden"
        name="criteriaJson"
        value={JSON.stringify(
          criteria
            .map((label, index) => ({ label: label.trim(), met: criteriaMet[index] ?? false }))
            .filter((item) => item.label !== '')
            .map((item) => ({ label: item.label, met: item.met ? true : null })),
        )}
      />

      {/* Errors */}
      {(formError || actionState.error) && (
        <p className="rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950" role="alert">
          {formError ?? actionState.error}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded border border-line-300 px-3 py-1.5 text-sm text-ink-700 disabled:opacity-40"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800"
          >
            Continue →
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
          >
            {pending ? 'Launching…' : 'Launch Pod'}
          </button>
        )}
      </div>
    </form>
  );
}
