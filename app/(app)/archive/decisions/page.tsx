/**
 * `/archive/decisions` — the searchable index (Module 10, screen 1).
 *
 * A plain GET form: the query lives in the URL, so a search is shareable and
 * needs no client JavaScript. Every result is an index row — title, summary,
 * tags — with a deep link back to the module that owns the record, never the
 * record itself.
 */

import Link from 'next/link';

import { StatusChip, type StatusTone } from '../../../../components/ui/StatusChip';
import { IconExternal, IconSearch } from '../../../../components/ui/icons';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

interface ArchiveResult {
  id: string;
  entityType: string;
  entityId: string | null;
  title: string;
  summary: string | null;
  tags: string[];
  podIds: string[];
  occurredAt: string;
  deepLink: string;
}

interface SearchPayload {
  count: number;
  results: ArchiveResult[];
}

interface PodOption {
  id: string;
  name: string;
}

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'pitch', label: 'Pitch' },
  { value: 'cloud', label: 'CLOU agreement' },
  { value: 'budget_cycle', label: 'Budget cycle' },
  { value: 'accountability_case', label: 'Accountability case' },
  { value: 'entry_trial', label: 'Entry trial' },
  { value: 'rule_change', label: 'Rule change' },
  { value: 'lesson', label: 'Lesson learned' },
];

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
  return ENTITY_TYPES.find((t) => t.value === entityType)?.label ?? entityType;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export default async function ArchiveDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    entityType?: string;
    podId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? '';
  const entityType = params.entityType ?? '';
  const podId = params.podId ?? '';
  const dateFrom = params.dateFrom ?? '';
  const dateTo = params.dateTo ?? '';

  const token = await getSessionToken();
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (entityType) query.set('entityType', entityType);
  if (podId) query.set('podId', podId);
  if (dateFrom) query.set('dateFrom', dateFrom);
  if (dateTo) query.set('dateTo', dateTo);

  const [search, pods] = await Promise.all([
    apiRequestOrNull<SearchPayload>(`/api/archive/search?${query.toString()}`, { token }),
    apiRequestOrNull<PodOption[]>('/api/pods', { token }),
  ]);

  const hasFilter = Boolean(q || entityType || podId || dateFrom || dateTo);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-2xs font-medium uppercase tracking-wide text-signal-600">Archive</p>
        <h1 className="mt-1 font-display text-2xl text-ink-950">Decisions</h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          Search the index of what the org decided and recorded. Each result links to the module
          that owns it — the archive points, it never copies.
        </p>
      </header>

      {/* Search form (GET → shareable URL, no client JS) */}
      <form method="get" className="rounded border border-line-200 bg-surface-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="q" className="text-xs font-medium text-ink-700">
              Search
            </label>
            <div className="relative mt-1">
              <IconSearch size={16} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Search titles, summaries and tags…"
                className="w-full rounded border border-line-300 bg-white py-1.5 pl-8 pr-2 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="entityType" className="text-xs font-medium text-ink-700">
              Type
            </label>
            <select
              id="entityType"
              name="entityType"
              defaultValue={entityType}
              className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="podId" className="text-xs font-medium text-ink-700">
              Pod
            </label>
            <select
              id="podId"
              name="podId"
              defaultValue={podId}
              className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
            >
              <option value="">All pods</option>
              {(pods ?? []).map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dateFrom" className="text-xs font-medium text-ink-700">
              From
            </label>
            <input
              id="dateFrom"
              name="dateFrom"
              type="date"
              defaultValue={dateFrom}
              className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="dateTo" className="text-xs font-medium text-ink-700">
              To
            </label>
            <input
              id="dateTo"
              name="dateTo"
              type="date"
              defaultValue={dateTo}
              className="mt-1 w-full rounded border border-line-300 bg-white px-2 py-1.5 text-sm text-ink-950 focus:border-signal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-signal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-signal-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link href="/archive/decisions" className="text-sm text-slate-500 hover:text-signal-600">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {/* Results */}
      <section className="mt-6" aria-live="polite">
        {!search ? (
          <p className="text-sm text-slate-500">The archive service is unreachable right now.</p>
        ) : search.results.length === 0 ? (
          <div className="rounded border border-dashed border-line-300 bg-surface-white px-6 py-12 text-center">
            <h2 className="font-display text-base text-ink-950">No matching records</h2>
            <p className="mx-auto mt-2 max-w-prose text-sm text-slate-500">
              {hasFilter
                ? 'Try a broader search, or clear the filters.'
                : 'Records appear here as decisions are made — pitch submissions, agreements, budget locks, governance records and lessons.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              {search.count} record{search.count === 1 ? '' : 's'}
            </p>
            <ul className="space-y-2">
              {search.results.map((result) => (
                <li key={result.id} className="rounded border border-line-200 bg-surface-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip tone={entityTone(result.entityType)} label={entityLabel(result.entityType)} />
                        <span className="text-2xs text-slate-500">{formatDate(result.occurredAt)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink-950">{result.title}</p>
                      {result.summary ? (
                        <p className="mt-0.5 text-xs text-slate-500">{result.summary}</p>
                      ) : null}
                      {result.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded border border-line-200 bg-paper-100 px-1.5 py-0.5 text-2xs text-slate-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Link
                      href={result.deepLink}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-line-300 bg-white px-3 py-1.5 text-2xs font-medium text-signal-600 hover:border-signal-600"
                    >
                      Open source
                      <IconExternal size={16} />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
