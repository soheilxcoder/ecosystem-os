/**
 * `/pod` — lands the user on the pod they belong to.
 *
 * The sidebar link is singular ("My Pod") because most people belong to one pod;
 * a coach or hub member spanning several pods gets a list instead.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { ApiMe } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function PodIndexPage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });
  const pods = me?.pods ?? [];

  if (pods.length === 1) {
    redirect(`/pod/${pods[0]!.id}/overview`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl text-ink-950">My Pod</h1>
      {pods.length === 0 ? (
        <div className="mt-4 border border-line-200 bg-white p-4">
          <p className="text-sm text-ink-950">You are not assigned to a pod yet.</p>
          <p className="mt-2 text-sm text-slate-500">
            Check with your Coaching Hub contact — pod membership is what gives you a seat, and a
            seat is what gives you the right to act.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line-200 border border-line-200 bg-white">
          {pods.map((pod) => (
            <li key={pod.id} className="flex items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-950">{pod.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {pod.holdingName} · {pod.memberCount} members
                </span>
              </span>
              <Link
                href={`/pod/${pod.id}/overview`}
                className="shrink-0 text-sm text-signal-600 underline"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
