/**
 * `/coaching` — the module landing. Coaching has three screens for three
 * audiences, so this page works out who is looking and sends them to the right
 * one instead of picking arbitrarily:
 *
 *   - a pod member/lead → "My Coach" (07 screen 1)
 *   - a coach → the Coaching Console (07 screen 2)
 *   - the Coaching Hub → the Roster (07 screen 4)
 *
 * A user can hold more than one of these, so every screen they are entitled to
 * is listed rather than a single forced redirect.
 */

import Link from 'next/link';

import { apiRequestOrNull } from '../../../lib/api';
import { getSessionToken } from '../../../lib/session';
import type { ApiMe } from '../../../lib/types';

export const dynamic = 'force-dynamic';

interface Entry {
  href: string;
  title: string;
  description: string;
  cta: string;
}

export default async function CoachingPage() {
  const token = await getSessionToken();
  const me = await apiRequestOrNull<ApiMe>('/api/me', { token });

  const roles = me?.roles ?? [];
  const isCoach = roles.some((role) => role.roleType === 'coach');
  const isHubCoaching = roles.some((role) => role.roleType === 'hub_coaching');
  const isPodMember = roles.some(
    (role) => role.roleType === 'pod_member' || role.roleType === 'pod_lead',
  );

  const entries: Entry[] = [];
  if (isPodMember) {
    entries.push({
      href: '/coaching/my-coach',
      title: 'My Coach',
      description:
        'Who coaches your pod, how to reach them, when they rotate, and the sessions they have shared with you.',
      cta: 'Open my coach',
    });
  }
  if (isCoach) {
    entries.push({
      href: '/coaching/console',
      title: 'Coaching Console',
      description:
        'Your assigned pods, their health signals, the rotation countdown, and the sessions you log.',
      cta: 'Open the console',
    });
  }
  if (isHubCoaching) {
    entries.push({
      href: '/hub/coaching-roster',
      title: 'Coaching Roster',
      description:
        'Who coaches whom, where the coverage gaps are, and which assignments are due for rotation review.',
      cta: 'Open the roster',
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">Coaching</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Every pod has a coach who is rotated every few cycles so no one becomes a dependency.
          Coaching notes are private; only what a coach chooses to share reaches the pod.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-10 text-center">
          <h2 className="font-display text-lg text-ink-950">No coaching role yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            You are not currently a pod member, a coach, or the Coaching Hub, so there is no coaching
            screen to show you. When a pod is deployed or a coach is appointed, the right view appears
            here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="group rounded border border-line-200 bg-surface-white p-4 transition-colors hover:border-signal-600"
            >
              <h2 className="font-display text-lg text-ink-950 group-hover:text-signal-600">
                {entry.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{entry.description}</p>
              <span className="mt-3 inline-block text-sm font-medium text-signal-600">
                {entry.cta} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
