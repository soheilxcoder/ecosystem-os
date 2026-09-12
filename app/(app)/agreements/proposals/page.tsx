/**
 * `/agreements/proposals` — inbox for incoming proposals (Module 04, screen 3).
 *
 * Rows expand with `<details>` rather than a JS disclosure, so the full terms
 * and the accept/counter/decline controls are available before (or without)
 * client JavaScript.
 */

import Link from 'next/link';

import { ProposalResponse, TermsSummary } from '../../../../components/agreements/AgreementForms';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import { agreementStatusTone, type AgreementView } from '../../../../lib/agreements';
import type { ApiMe } from '../../../../lib/types';
import { formatDateTime } from '../../../../core/time';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  const ledPods = (me?.roles ?? [])
    .filter(
      (role) =>
        role.roleType === 'pod_lead' &&
        Boolean(role.scopeId) &&
        role.rotation.state !== 'expired' &&
        role.rotation.state !== 'vacant',
    )
    .map((role) => role.scopeId as string);

  const inboxes = await Promise.all(
    ledPods.map(async (podId) => ({
      podId,
      podName: me?.pods.find((pod) => pod.id === podId)?.name ?? 'Your pod',
      rows:
        (await apiRequestOrNull<AgreementView[]>(`/api/agreements/inbox?podId=${podId}`, { token })) ??
        [],
    })),
  );

  const total = inboxes.reduce((sum, inbox) => sum + inbox.rows.length, 0);

  if (ledPods.length === 0) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">You do not currently hold a Pod Lead seat.</p>
        <p className="mt-2 text-sm text-slate-500">
          Incoming proposals are answered by a pod&apos;s current Pod Lead, so this inbox belongs to
          that seat rather than to you personally. You can still read every agreement in the
          organisation — cross-pod visibility is on by default.
        </p>
      </div>
    );
  }

  return (
    <div>
      {total === 0 ? (
        <div className="border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">Nothing is waiting on your pod.</p>
          <p className="mt-2 text-sm text-slate-500">
            When another pod proposes a CLOU, it lands here with its full terms and the choice to
            accept, counter or decline — a decline always carries a reason.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {inboxes
            .filter((inbox) => inbox.rows.length > 0)
            .map((inbox) => (
              <section key={inbox.podId}>
                <h2 className="mb-2 text-sm font-medium text-ink-700">
                  Awaiting {inbox.podName} · {inbox.rows.length}
                </h2>
                <ul className="divide-y divide-line-200 border border-line-200 bg-white">
                  {inbox.rows.map((agreement) => (
                    <li key={agreement.id}>
                      <details className="group">
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3">
                          <span className="min-w-0">
                            <span className="block text-sm text-ink-950">{agreement.name}</span>
                            <span className="block text-xs text-slate-500">
                              From {agreement.podAName} · last updated{' '}
                              <span className="tabular">{formatDateTime(agreement.updatedAt)}</span>
                            </span>
                          </span>
                          <StatusChip
                            tone={agreementStatusTone(agreement.displayStatus)}
                            label={
                              agreement.displayStatus === 'countered'
                                ? 'Counter-proposed — your move'
                                : 'Awaiting your response'
                            }
                          />
                        </summary>

                        <div className="space-y-4 border-t border-line-200 p-3">
                          <TermsSummary agreement={agreement} />
                          <ProposalResponse agreement={agreement} actorPodId={inbox.podId} />
                          <p className="text-xs text-slate-500">
                            <Link
                              href={`/agreements/${agreement.id}`}
                              className="text-signal-600 underline"
                            >
                              Open the full agreement
                            </Link>{' '}
                            to see its activity log.
                          </p>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
