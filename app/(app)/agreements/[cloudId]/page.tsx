/**
 * `/agreements/:cloudId` — agreement detail (Module 04, screen 4).
 *
 * Everything here is resolved live: the escalation contacts are read from the
 * current Pod Lead rotation (with its countdown) rather than from a snapshot
 * stored when the agreement was signed, and the status history is the event log
 * rather than a mutable column. A signed agreement therefore cannot go stale
 * just because a seat rotated.
 */

import Link from 'next/link';

import { AgreementActions, TermsSummary } from '../../../../components/agreements/AgreementForms';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { RotationBadge } from '../../../../components/ui/RotationBadge';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import {
  AGREEMENT_STATUS_OPTIONS,
  agreementStatusTone,
  type AgreementDetailPayload,
} from '../../../../lib/agreements';
import { formatDateTime, formatShortDate, todayISO } from '../../../../core/time';
import { computeRotation } from '../../../../core/rotation';
import { describeCadence } from '../../../../core/agreements';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  proposed: 'Proposed',
  countered: 'Counter-proposed',
  accepted: 'Accepted',
  declined: 'Declined',
  renegotiated: 'Renegotiation requested',
  renewed: 'Renewed',
  archived: 'Archived',
};

const EVENT_TONES: Record<string, 'neutral' | 'active' | 'good' | 'watch' | 'alert'> = {
  proposed: 'active',
  countered: 'watch',
  accepted: 'good',
  declined: 'alert',
  renegotiated: 'watch',
  renewed: 'good',
  archived: 'neutral',
};

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ cloudId: string }>;
}) {
  const { cloudId } = await params;
  const token = await getSessionToken();
  const detail = await apiRequestOrNull<AgreementDetailPayload>(`/api/agreements/${cloudId}`, {
    token,
  });

  if (!detail) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">This agreement is not available.</p>
        <p className="mt-2 text-sm text-slate-500">
          It may have been removed, or the API is unreachable.{' '}
          <Link href="/agreements/active" className="text-signal-600 underline">
            Back to Agreements
          </Link>
        </p>
      </div>
    );
  }

  const { agreement, events, escalation, archiveConfirmations, viewerPodIds } = detail;
  const today = todayISO();
  const myPods = viewerPodIds.filter(
    (podId) => podId === agreement.podAId || podId === agreement.podBId,
  );
  const actorPodId = myPods[0] ?? null;
  const iAmParty = myPods.length > 0;
  const inForce = agreement.status === 'active' || agreement.status === 'renegotiating';
  const awaitingMe = Boolean(actorPodId && agreement.awaitingPodId === actorPodId);
  const canRenew =
    inForce &&
    Boolean(agreement.renewalDate && agreement.renewalDate < today) &&
    agreement.status === 'active';

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink-950">{agreement.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {agreement.podAName} ({agreement.podAHoldingName}) ↔ {agreement.podBName} (
              {agreement.podBHoldingName}) · {describeCadence(agreement.cadence, agreement.frequency)}
            </p>
          </div>
          <StatusChip
            tone={agreementStatusTone(agreement.displayStatus)}
            label={
              AGREEMENT_STATUS_OPTIONS.find((option) => option.value === agreement.displayStatus)
                ?.label ?? agreement.displayStatus
            }
          />
        </div>

        {awaitingMe ? (
          <p
            role="status"
            className="mt-3 border border-status-watch bg-white px-3 py-2 text-sm text-ink-950"
          >
            This proposal is waiting on your pod.{' '}
            <Link href="/agreements/proposals" className="text-signal-600 underline">
              Open the proposals inbox
            </Link>{' '}
            to respond.
          </p>
        ) : null}
      </header>

      <section className="border border-line-200 bg-white p-4">
        <h3 className="text-sm font-medium text-ink-700">Terms</h3>
        <div className="mt-3">
          <TermsSummary agreement={agreement} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line-200 pt-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Start date</dt>
            <dd className="tabular text-ink-950">
              {agreement.startDate ? formatShortDate(agreement.startDate) : 'Not started'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Renewal date</dt>
            <dd className="tabular text-ink-950">
              {agreement.renewalDate ? formatShortDate(agreement.renewalDate) : 'One-time — no renewal'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Last updated</dt>
            <dd className="tabular text-ink-950">{formatDateTime(agreement.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="border border-line-200 bg-white p-4">
        <h3 className="text-sm font-medium text-ink-700">Escalation contacts</h3>
        <p className="mt-1 text-xs text-slate-500">
          Resolved live from each pod&apos;s current Pod Lead — never a name frozen into the
          agreement at signature time.
        </p>
        <ul className="mt-3 divide-y divide-line-200">
          {escalation.map((contact) => {
            const rotation = contact.startDate
              ? computeRotation(contact.startDate, contact.endDate, today)
              : computeRotation(null, null, today);
            return (
              <li
                key={contact.podId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="text-sm text-ink-950">{contact.podName}</p>
                  <p className="text-xs text-slate-500">
                    {contact.userId ? contact.fullName : 'Seat currently vacant'}
                    {contact.userId ? ` · ${contact.email}` : ''}
                  </p>
                </div>
                {contact.userId ? (
                  <RotationBadge role={contact.role} info={rotation} />
                ) : (
                  <StatusChip tone="neutral" label="No current Pod Lead" />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border border-line-200 bg-white p-4">
        <h3 className="text-sm font-medium text-ink-700">Activity log</h3>
        <ol className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-line-200 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  tone={EVENT_TONES[event.eventType] ?? 'neutral'}
                  label={EVENT_LABELS[event.eventType] ?? event.eventType}
                />
                <span className="tabular text-xs text-slate-500">
                  {formatDateTime(event.createdAt)}
                </span>
                <span className="text-xs text-slate-500">
                  {event.actorName ?? 'System'} · {agreement.podAName}/{agreement.podBName}
                </span>
              </div>
              {event.note ? <p className="mt-1 text-sm text-ink-950">{event.note}</p> : null}
              {event.terms?.serviceDescription ? (
                <p className="mt-1 text-xs text-slate-500">
                  Terms at this point: {event.terms.serviceDescription}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="border border-line-200 bg-white p-4">
        <h3 className="text-sm font-medium text-ink-700">Actions</h3>
        {iAmParty && actorPodId ? (
          <>
            {inForce ? (
              <div className="mt-3">
                <AgreementActions
                  agreement={agreement}
                  actorPodId={actorPodId}
                  canRenew={canRenew}
                  confirmedPodIds={archiveConfirmations.map((row) => row.podId)}
                  today={today}
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {agreement.status === 'archived'
                  ? 'This agreement has been archived by mutual confirmation. Its history stays readable.'
                  : agreement.status === 'declined'
                    ? 'This proposal was declined. The reason is in the activity log above.'
                    : 'This proposal has not been accepted yet, so there is nothing to renegotiate or archive.'}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Only the current Pod Lead of {agreement.podAName} or {agreement.podBName} can change
            this agreement. Everyone in the organisation can read it — cross-pod visibility is on by
            default.
          </p>
        )}
      </section>
    </div>
  );
}
