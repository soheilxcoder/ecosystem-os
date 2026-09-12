'use client';

/**
 * Proposal wizard — 04-MODULE-CLOU-AGREEMENTS.md, screen `/agreements/new`.
 *
 * Step 1 carries the module's guardrail: until the proposer has written down
 * what is actually exchanged, [Continue] stays disabled with the reason stated
 * inline. The same `validateCloudTerms()` call runs on the server, so skipping
 * the UI does not skip the rule.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import {
  proposeAgreementAction,
  type AgreementActionState,
} from '../../app/actions/agreements';
import { describeCadence, describePricing, serviceFlow, validateCloudTerms } from '../../core/agreements';
import { TermsFields, initialTermsValue, type TermsValue } from './TermsFields';

export interface WizardPod {
  id: string;
  name: string;
  holdingName: string;
}

const STEP_LABELS = ['Select counterparty', 'Define terms', 'Review & send', 'Confirmation'];

export function AgreementWizard({ pods, myPods }: { pods: WizardPod[]; myPods: WizardPod[] }) {
  const [state, formAction] = useActionState<AgreementActionState, FormData>(
    proposeAgreementAction,
    {},
  );
  const [step, setStep] = useState(0);
  const [podAId, setPodAId] = useState(myPods[0]?.id ?? '');
  const [podBId, setPodBId] = useState('');
  const [terms, setTerms] = useState<TermsValue>(initialTermsValue());

  const podA = myPods.find((pod) => pod.id === podAId) ?? null;
  const podB = pods.find((pod) => pod.id === podBId) ?? null;
  const counterparties = pods.filter((pod) => pod.id !== podAId);

  // The guardrail, evaluated with the same function the API uses.
  const exchange = validateCloudTerms({ serviceDescription: terms.serviceDescription });
  const canLeaveStepOne = Boolean(podAId && podBId) && exchange.ok;

  // Once the proposal is away, the wizard is finished — regardless of which
  // step the browser was on when the action resolved.
  const sent = Boolean(state.agreementId);

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex flex-wrap gap-2 text-xs" aria-label="Proposal steps">
        {STEP_LABELS.map((label, index) => {
          const current = sent ? index === 3 : index === step;
          const done = sent ? index < 3 : index < step;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`border px-2 py-1 ${
                current
                  ? 'border-signal-600 bg-signal-50 text-ink-950'
                  : done
                    ? 'border-line-200 bg-white text-slate-500'
                    : 'border-line-200 bg-white text-slate-300'
              }`}
            >
              {index + 1}. {label}
            </li>
          );
        })}
      </ol>

      {sent ? (
        <Confirmation
          agreementId={state.agreementId!}
          counterpartyName={state.counterpartyName ?? podB?.name ?? 'the other pod'}
        />
      ) : (
        <form action={formAction} className="border border-line-200 bg-white p-4">
          <input type="hidden" name="podAId" value={podAId} />
          <input type="hidden" name="podBId" value={podBId} />
          <input type="hidden" name="counterpartyName" value={podB?.name ?? ''} />

          {step === 0 ? (
            <section aria-labelledby="step-1">
              <h2 id="step-1" className="font-display text-lg text-ink-950">
                1. Select counterparty
              </h2>

              {myPods.length > 1 ? (
                <div className="mt-4">
                  <label htmlFor="wizard-pod-a" className="block text-xs font-medium text-ink-700">
                    Your pod
                  </label>
                  <select
                    id="wizard-pod-a"
                    className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
                    value={podAId}
                    onChange={(event) => {
                      setPodAId(event.target.value);
                      if (event.target.value === podBId) setPodBId('');
                    }}
                  >
                    {myPods.map((pod) => (
                      <option key={pod.id} value={pod.id}>
                        {pod.name} · {pod.holdingName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : podA ? (
                <p className="mt-4 text-sm text-slate-500">
                  Proposing on behalf of <span className="text-ink-950">{podA.name}</span> — the pod
                  whose Pod Lead seat you currently hold.
                </p>
              ) : null}

              <div className="mt-4">
                <label htmlFor="wizard-pod-b" className="block text-xs font-medium text-ink-700">
                  Counterparty pod
                </label>
                <select
                  id="wizard-pod-b"
                  className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
                  value={podBId}
                  onChange={(event) => setPodBId(event.target.value)}
                >
                  <option value="">Choose a pod…</option>
                  {counterparties.map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.name} · {pod.holdingName}
                    </option>
                  ))}
                </select>
              </div>

              {/* The guardrail. */}
              <div className="mt-4">
                <label
                  htmlFor="wizard-exchange"
                  className="block text-xs font-medium text-ink-700"
                >
                  What service or good does this exchange involve?{' '}
                  <span className="text-status-alert">*</span>
                </label>
                <textarea
                  id="wizard-exchange"
                  name="serviceDescription"
                  rows={3}
                  className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
                  value={terms.serviceDescription}
                  onChange={(event) =>
                    setTerms({ ...terms, serviceDescription: event.target.value })
                  }
                />
                {!exchange.ok ? (
                  <p id="wizard-exchange-hint" className="mt-1 text-xs text-status-alert">
                    {exchange.message}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    You can expand this into the full service description in the next step.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canLeaveStepOne}
                  onClick={() => setStep(1)}
                  className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-describedby={exchange.ok ? undefined : 'wizard-exchange-hint'}
                >
                  Continue
                </button>
                {!canLeaveStepOne ? (
                  <span className="text-xs text-slate-500">
                    {!podBId
                      ? 'Choose the pod you actually exchange with.'
                      : 'A CLOU requires a real, described exchange — this isn’t required for pods that don’t exchange services.'}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="step-2">
              <h2 id="step-2" className="font-display text-lg text-ink-950">
                2. Define terms
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {podA?.name} ↔ {podB?.name}
              </p>
              <div className="mt-4">
                <TermsFields
                  value={terms}
                  onChange={setTerms}
                  podAName={podA?.name ?? 'Pod A'}
                  podBName={podB?.name ?? 'Pod B'}
                  idPrefix="wizard"
                />
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
                >
                  Review
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="step-3">
              <h2 id="step-3" className="font-display text-lg text-ink-950">
                3. Review &amp; send
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Read-only summary. Sending notifies the counterparty pod&apos;s current Pod Lead.
              </p>

              <dl className="mt-4 divide-y divide-line-200 border border-line-200">
                <Row label="Agreement name">
                  {terms.name.trim() || `${podA?.name} ↔ ${podB?.name} — auto-named`}
                </Row>
                <Row label="Between">
                  {podA?.name} ({podA?.holdingName}) and {podB?.name} ({podB?.holdingName})
                </Row>
                <Row label="Service description">{terms.serviceDescription}</Row>
                <Row label="Direction">
                  {directionSummary(terms.direction, podA?.name ?? 'Pod A', podB?.name ?? 'Pod B')}
                </Row>
                <Row label="Cadence">
                  {describeCadence(terms.cadence, terms.frequency || null)}
                </Row>
                <Row label="Pricing">
                  {describePricing({
                    model: terms.pricingModel || null,
                    amount: terms.pricingAmount,
                    unit: terms.pricingUnit,
                    notes: terms.pricingNotes,
                  })}
                </Row>
                <Row label="Escalation contacts">
                  Each pod&apos;s current Pod Lead, resolved live — never a name frozen into the
                  agreement.
                </Row>
              </dl>

              {state.error ? (
                <p role="alert" className="mt-3 text-sm text-status-alert">
                  {state.error}
                </p>
              ) : null}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700"
                >
                  Back
                </button>
                <SendButton />
              </div>
            </section>
          ) : null}

          {/* The review step above is a courtesy, not the record: the terms
              travel as hidden fields so what the user approved is what is sent,
              and the server re-validates all of it anyway. */}
          {step === 2 ? <HiddenTerms terms={terms} /> : null}
        </form>
      )}
    </div>
  );
}

/** Keeps the approved terms in the payload when the editors are unmounted. */
function HiddenTerms({ terms }: { terms: TermsValue }) {
  return (
    <>
      <input type="hidden" name="name" value={terms.name} />
      <input type="hidden" name="serviceDescription" value={terms.serviceDescription} />
      <input type="hidden" name="direction" value={terms.direction} />
      <input type="hidden" name="cadence" value={terms.cadence} />
      <input type="hidden" name="frequency" value={terms.frequency} />
      <input type="hidden" name="pricingModel" value={terms.pricingModel} />
      <input type="hidden" name="pricingAmount" value={terms.pricingAmount} />
      <input type="hidden" name="pricingUnit" value={terms.pricingUnit} />
      <input type="hidden" name="pricingNotes" value={terms.pricingNotes} />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-ink-950 sm:col-span-2">{children}</dd>
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700 disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send Proposal'}
    </button>
  );
}

function directionSummary(
  direction: TermsValue['direction'],
  podAName: string,
  podBName: string,
): string {
  const flow = serviceFlow(direction, podAName, podBName);
  return flow.bidirectional
    ? `${flow.fromName} ↔ ${flow.toName} (both serve each other)`
    : `${flow.fromName} → ${flow.toName}`;
}

function Confirmation({
  agreementId,
  counterpartyName,
}: {
  agreementId: string;
  counterpartyName: string;
}) {
  return (
    <section className="border border-line-200 bg-white p-4">
      <h2 className="font-display text-lg text-ink-950">4. Proposal sent</h2>
      <p className="mt-2 text-sm text-ink-950">
        Proposal sent to <span className="font-medium">{counterpartyName}</span>. You&apos;ll be
        notified when they respond.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/agreements/${agreementId}`}
          className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
        >
          View the proposal
        </Link>
        <Link
          href="/agreements/active"
          className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700"
        >
          Back to Agreements
        </Link>
      </div>
    </section>
  );
}
