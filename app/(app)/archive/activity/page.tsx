/**
 * `/archive/activity` — Module 10, screen 3. A reverse-chronological feed of
 * everything the archive has recorded, optionally scoped to one pod. Like the
 * search screen it is a GET form, so the filter lives in the URL.
 */

import Link from 'next/link';

import { StatusChip, type StatusTone } from '../../../../components/ui/StatusChip';
import { IconExternal } from '../../../../components/ui/icons';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

interface ActivityItem {
  id: string;
  entityType: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  deepLink: string;
}

interface ActivityPayload {
  count: number;
  items: ActivityItem[];
}

interface PodOption {
  id: string;
  name: string;
}

function entityTone(entityType: string): StatusTone {
  switch (entityType) {
    case 'pitch':
      return 'active';
    case 'cloud':
      return 'good';
    case 'budget_cycle':
      return 'neutral';
    case 'accountability_case':
      return 'alert';
    case 'entry_trial':
      return 'watch';
    case 'rule_change':
      return 'watch';
    case 'lesson':
      return 'good';
    default:
      return 'neutral';
  }
}

function entityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    pitch: 'Pitch',
    cloud: 'CLOU',
    budget_cycle: 'Budget',
    accountability_case: 'Accountability',
    entry_trial: 'Entry trial',
    rule_change: 'Rule change',
    lesson: 'Lesson',
  };
  return labels[entityType] ?? entityType;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export default async function ArchiveActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ podId?: string }>;
}) {
  const params = await searchParams;
  const podId = params.podId ?? '';

  const token = await getSessionToken();
  const query = podId ? `?podId=${encodeURIComponent(podId)}` : '';
  const [activity, pods] = await Promise.all([
    apiRequestOrNull<ActivityPayload>(`/api/archive/activity${query}`, { token }),
    apiRequestOrNull<PodOption[]>('/api/pods', { token }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-medium uppercase tracking-wide text-signal-600">Archive</p>
          <h1 className="mt-1 font-display text-2xl text-ink-950">Activity</h1>
          <p className="mt-2 max-w-prose text-sm text-slate-500">
            Everything recorded, newest first.
          </p>
        </div>
      </header>

      <form method="get" className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="podId" className="text-xs font-medium text-ink-700">
            Filter by pod
          </label>
          <select
            id="podId"
            name="podId"
            defaultValue={podId}
            className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
          >
            <option value="">Whole org</option>
            {(pods ?? []).map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-signal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
        >
          Apply
        </button>
        {podId && (
          <Link href="/archive/activity" className="pb-1.5 text-sm text-slate-500 hover:text-signal-600">
            Clear
          </Link>
        )}
      </form>

      {!activity ? (
        <p className="text-sm text-slate-500">The archive service is unreachable right now.</p>
      ) : activity.items.length === 0 ? (
        <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-12 text-center">
          <h2 className="font-display text-base text-ink-950">Nothing recorded yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
            As decisions are made across the org, they show up here in order.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-4 border-l border-line-200 pl-5">
          {activity.items.map((item) => (
            <li key={item.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper-100 bg-signal-600"
              />
              <div className="rounded border border-line-200 bg-surface-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={entityTone(item.entityType)} label={entityLabel(item.entityType)} />
                      <span className="text-2xs text-slate-500">{formatDate(item.occurredAt)}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink-950">{item.title}</p>
                    {item.summary ? (
                      <p className="mt-0.5 text-xs text-slate-500">{item.summary}</p>
                    ) : null}
                  </div>
                  <Link
                    href={item.deepLink}
                    className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-signal-600 hover:underline"
                  >
                    Open
                    <IconExternal size={16} />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
