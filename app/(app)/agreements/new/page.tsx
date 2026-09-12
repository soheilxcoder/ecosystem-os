/**
 * `/agreements/new` — the 4-step proposal wizard.
 *
 * Only a current Pod Lead can reach the wizard: proposing is a Pod Lead action,
 * and the counterparty's escalation contact is the other pod's current Pod
 * Lead. Everyone else gets an explanation instead of a form that would fail on
 * submit.
 */

import Link from 'next/link';

import { AgreementWizard } from '../../../../components/agreements/AgreementWizard';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe, ApiPod } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function NewAgreementPage() {
  const token = await getSessionToken();
  const [me, pods] = await Promise.all([
    apiRequestOrNull<ApiMe>('/api/me', { token }),
    apiRequestOrNull<ApiPod[]>('/api/pods', { token }),
  ]);

  const allPods = (pods ?? []).map((pod) => ({
    id: pod.id,
    name: pod.name,
    holdingName: pod.holdingName,
  }));

  const myPods = allPods.filter((pod) =>
    (me?.roles ?? []).some(
      (role) =>
        role.roleType === 'pod_lead' &&
        role.scopeId === pod.id &&
        role.rotation.state !== 'expired' &&
        role.rotation.state !== 'vacant',
    ),
  );

  if (myPods.length === 0) {
    return (
      <div className="mx-auto max-w-3xl border border-line-200 bg-white p-4">
        <h2 className="font-display text-lg text-ink-950">Only a Pod Lead can propose a CLOU</h2>
        <p className="mt-2 text-sm text-slate-500">
          An agreement commits a pod, so the seat that can commit it is the pod&apos;s rotating Pod
          Lead. If your pod needs an agreement with another pod, raise it with whoever currently
          holds that seat — the seat rotates, so it may well be you next cycle.
        </p>
        <Link
          href="/agreements/active"
          className="mt-4 inline-block rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700"
        >
          Back to Agreements
        </Link>
      </div>
    );
  }

  if (allPods.length < 2) {
    return (
      <div className="mx-auto max-w-3xl border border-line-200 bg-white p-4">
        <h2 className="font-display text-lg text-ink-950">There is no counterparty yet</h2>
        <p className="mt-2 text-sm text-slate-500">
          A CLOU is bilateral by definition — it needs two pods that actually exchange a service.
          This organisation currently has only one pod.
        </p>
      </div>
    );
  }

  return <AgreementWizard pods={allPods} myPods={myPods} />;
}
