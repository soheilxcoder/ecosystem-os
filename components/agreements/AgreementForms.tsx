'use client';

/**
 * Agreement actions (Module 04).
 *
 * Every control here is a plain form: the server decides whether the action is
 * allowed and what it means, so the same markup works with or without client
 * JavaScript.
 *
 * Two rules are made visible rather than merely enforced:
 *  - a decline must carry a one-line reason, which the proposing pod can read
 *  - archiving takes a confirmation from *both* pods; one confirmation is
 *    recorded and then waits
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  archiveAgreementAction,
  renegotiateAgreementAction,
  renewAgreementAction,
  respondToAgreementAction,
  type AgreementActionState,
} from '../../app/actions/agreements';
import {
  DIRECTION_LABELS,
  describeCadence,
  describePricing,
  serviceFlow,
} from '../../core/agreements';
import { TermsFields, initialTermsValue, type TermsValue } from './TermsFields';
import type { CloudDirection, CloudFrequency, CloudPricingTerms } from '../../core/types';

export interface AgreementSummary {
  id: string;
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  cadence: 'one_time' | 'recurring';
  frequency: CloudFrequency | null;
  pricingTerms: CloudPricingTerms;
  podAId: string;
  podBId: string;
  podAName: string;
  podBName: string;
  status: string;
  renewalDate: string | null;
}

function SubmitButton({ label, pendingLabel, variant = 'primary' }: {
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  const styles =
    variant === 'primary'
      ? 'bg-signal-600 text-white hover:bg-signal-700'
      : variant === 'danger'
        ? 'border border-status-alert text-status-alert hover:bg-red-50'
        : 'border border-line-200 text-ink-700 hover:border-signal-600';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${styles}`}
    >
      {pending ? (pendingLabel ?? 'Working…') : label}
    </button>
  );
}

function Feedback({ state }: { state: AgreementActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-status-alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="mt-2 text-sm text-status-good">
        {state.success}
      </p>
    );
  }
  return null;
}

/** Read-only rendering of the negotiable terms. */
export function TermsSummary({
  agreement,
}: {
  agreement: Pick<
    AgreementSummary,
    'serviceDescription' | 'direction' | 'cadence' | 'frequency' | 'pricingTerms' | 'podAName' | 'podBName'
  >;
}) {
  const flow = serviceFlow(agreement.direction, agreement.podAName, agreement.podBName);
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-slate-500">Exchange</dt>
        <dd className="text-ink-950">{agreement.serviceDescription}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Direction</dt>
        <dd className="text-ink-950">
          {flow.bidirectional
            ? `${flow.fromName} ↔ ${flow.toName}`
            : `${flow.fromName} → ${flow.toName}`}
          <span className="block text-xs text-slate-500">
            {DIRECTION_LABELS[agreement.direction]}
          </span>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Cadence &amp; pricing</dt>
        <dd className="text-ink-950">
          {describeCadence(agreement.cadence, agreement.frequency)}
          <span className="block text-xs text-slate-500">
            {describePricing(agreement.pricingTerms)}
          </span>
        </dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Inbox response: accept / counter / decline
// ---------------------------------------------------------------------------

export function ProposalResponse({
  agreement,
  actorPodId,
}: {
  agreement: AgreementSummary;
  actorPodId: string;
}) {
  const [state, formAction] = useActionState<AgreementActionState, FormData>(
    respondToAgreementAction,
    {},
  );
  const [counter, setCounter] = useState(false);
  const [terms, setTerms] = useState<TermsValue>(
    initialTermsValue({
      name: agreement.name,
      serviceDescription: agreement.serviceDescription,
      direction: agreement.direction,
      cadence: agreement.cadence,
      frequency: agreement.frequency,
      pricingTerms: agreement.pricingTerms,
    }),
  );

  if (state.success && !state.error) {
    return (
      <div className="border border-line-200 bg-white p-3">
        <p role="status" className="text-sm text-status-good">
          {state.success}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="agreementId" value={agreement.id} />
      <input type="hidden" name="actorPodId" value={actorPodId} />
      {counter ? <input type="hidden" name="decision" value="counter" /> : null}

      {counter ? (
        <div className="border border-line-200 p-3">
          <h4 className="text-xs font-medium text-ink-700">Counter-proposal</h4>
          <div className="mt-2">
            <TermsFields
              value={terms}
              onChange={setTerms}
              showName={false}
              podAName={agreement.podAName}
              podBName={agreement.podBName}
              idPrefix={`counter-${agreement.id}`}
            />
          </div>
        </div>
      ) : null}

      {!counter ? (
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="submit"
            name="decision"
            value="accept"
            className="rounded bg-signal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => setCounter(true)}
            className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600"
          >
            Counter-propose
          </button>
          <div className="min-w-[16rem] flex-1">
            <label
              htmlFor={`decline-note-${agreement.id}`}
              className="block text-xs font-medium text-ink-700"
            >
              Decline with a reason <span className="text-status-alert">*</span>
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`decline-note-${agreement.id}`}
                name="note"
                className="w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
                placeholder="Why this doesn’t work for your pod"
              />
              <button
                type="submit"
                name="decision"
                value="decline"
                className="shrink-0 rounded border border-status-alert px-3 py-1.5 text-sm text-status-alert hover:bg-red-50"
              >
                Decline
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The reason is stored and shown to the proposing pod — no silent rejections.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <SubmitButton label="Send counter-proposal" pendingLabel="Sending…" />
          <button
            type="button"
            onClick={() => setCounter(false)}
            className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700"
          >
            Cancel
          </button>
        </div>
      )}

      <Feedback state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Actions on a live agreement: renegotiate / renew / archive
// ---------------------------------------------------------------------------

export function AgreementActions({
  agreement,
  actorPodId,
  canRenew,
  confirmedPodIds,
  today,
}: {
  agreement: AgreementSummary;
  actorPodId: string;
  canRenew: boolean;
  confirmedPodIds: string[];
  today: string;
}) {
  const [renegotiateState, renegotiateAction] = useActionState<AgreementActionState, FormData>(
    renegotiateAgreementAction,
    {},
  );
  const [archiveState, archiveAction] = useActionState<AgreementActionState, FormData>(
    archiveAgreementAction,
    {},
  );
  const [renewState, renewAction] = useActionState<AgreementActionState, FormData>(
    renewAgreementAction,
    {},
  );
  const [terms, setTerms] = useState<TermsValue>(
    initialTermsValue({
      name: agreement.name,
      serviceDescription: agreement.serviceDescription,
      direction: agreement.direction,
      cadence: agreement.cadence,
      frequency: agreement.frequency,
      pricingTerms: agreement.pricingTerms,
    }),
  );

  const otherPodId = actorPodId === agreement.podAId ? agreement.podBId : agreement.podAId;
  const otherPodName =
    otherPodId === agreement.podAId ? agreement.podAName : agreement.podBName;
  const iHaveConfirmed = confirmedPodIds.includes(actorPodId);

  return (
    <div className="space-y-3">
      {canRenew ? (
        <form action={renewAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="agreementId" value={agreement.id} />
          <input type="hidden" name="actorPodId" value={actorPodId} />
          <SubmitButton label="Renew this agreement" pendingLabel="Renewing…" />
          <span className="text-xs text-slate-500">
            Its renewal date ({agreement.renewalDate}) has passed — it stays listed as expired until
            renewed or archived.
          </span>
          <Feedback state={renewState} />
        </form>
      ) : null}

      <details className="border border-line-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-950">
          Request renegotiation
        </summary>
        <form action={renegotiateAction} className="space-y-3 border-t border-line-200 p-3">
          <input type="hidden" name="agreementId" value={agreement.id} />
          <input type="hidden" name="actorPodId" value={actorPodId} />
          <p className="text-xs text-slate-500">
            Change only what needs changing. {otherPodName} then accepts, counters or declines.
          </p>
          <TermsFields
            value={terms}
            onChange={setTerms}
            showName={false}
            podAName={agreement.podAName}
            podBName={agreement.podBName}
            idPrefix={`reneg-${agreement.id}`}
          />
          <label htmlFor={`reneg-note-${agreement.id}`} className="block text-xs text-ink-700">
            Note for the other pod (optional)
          </label>
          <input
            id={`reneg-note-${agreement.id}`}
            name="note"
            className="w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
          />
          <SubmitButton label="Send renegotiation request" pendingLabel="Sending…" />
          <Feedback state={renegotiateState} />
        </form>
      </details>

      <details className="border border-line-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-950">
          Archive this agreement
        </summary>
        <div className="space-y-3 border-t border-line-200 p-3">
          <p className="text-xs text-slate-500">
            Ending an agreement takes a confirmation from both pods. Neither side can remove it
            alone.
          </p>
          <ul className="text-xs text-slate-500">
            <li>
              {agreement.podAName}: {confirmedPodIds.includes(agreement.podAId) ? 'confirmed' : 'not yet confirmed'}
            </li>
            <li>
              {agreement.podBName}: {confirmedPodIds.includes(agreement.podBId) ? 'confirmed' : 'not yet confirmed'}
            </li>
          </ul>

          {iHaveConfirmed ? (
            <p role="status" className="text-sm text-status-good">
              Your pod has confirmed — waiting for {otherPodName}.
            </p>
          ) : (
            <form action={archiveAction} className="space-y-2">
              <input type="hidden" name="agreementId" value={agreement.id} />
              <input type="hidden" name="actorPodId" value={actorPodId} />
              <label
                htmlFor={`archive-note-${agreement.id}`}
                className="block text-xs text-ink-700"
              >
                Reason (optional, visible to both pods)
              </label>
              <input
                id={`archive-note-${agreement.id}`}
                name="note"
                className="w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
              />
              <SubmitButton
                label={`Confirm archive on behalf of ${
                  actorPodId === agreement.podAId ? agreement.podAName : agreement.podBName
                }`}
                pendingLabel="Recording…"
                variant="danger"
              />
              <Feedback state={archiveState} />
            </form>
          )}
          {iHaveConfirmed ? <Feedback state={archiveState} /> : null}
          <p className="text-xs text-slate-500">Today is {today}.</p>
        </div>
      </details>
    </div>
  );
}
