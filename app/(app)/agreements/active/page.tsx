/**
 * `/agreements/active` — 04-MODULE-CLOU-AGREEMENTS.md screen 1.
 *
 * List view by default, network graph view on toggle. Both read the same
 * endpoint family, so the two views can never disagree: the graph's dotted
 * hub lines are computed from the same "is there an agreement in force" fact
 * that the list's Status column shows.
 */

import Link from 'next/link';

import { AgreementGraphView } from '../../../../components/agreements/AgreementGraph';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import {
  AGREEMENT_STATUS_OPTIONS,
  agreementStatusTone,
  type AgreementView,
  type GraphPayload,
} from '../../../../lib/agreements';
import type { ApiMe } from '../../../../lib/types';
import { formatShortDate } from '../../../../core/time';

export const dynamic = 'force-dynamic';

interface SearchParams {
  podId?: string;
  holdingId?: string;
  status?: string;
  view?: string;
}

export default async function ActiveAgreementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const podId = filters.podId ?? '';
  const holdingId = filters.holdingId ?? '';
  const status = filters.status ?? '';
  const view = filters.view === 'graph' ? 'graph' : 'list';

  const query = new URLSearchParams();
  if (podId) query.set('podId', podId);
  if (holdingId) query.set('holdingId', holdingId);
  if (status) query.set('status', status);
  const queryString = query.toString();

  const token = await getSessionToken();
  const [agreements, me] = await Promise.all([
    apiRequestOrNull<AgreementView[]>(
      `/api/agreements${queryString ? `?${queryString}` : ''}`,
      { token },
    ),
    apiRequestOrNull<ApiMe>('/api/me', { token }),
  ]);

  const graph =
    view === 'graph'
      ? await apiRequestOrNull<GraphPayload>(
          `/api/agreements/graph${podId ? `?podId=${podId}` : ''}`,
          { token },
        )
      : null;

  if (!agreements) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">The agreements service is unreachable.</p>
        <p className="mt-2 text-sm text-slate-500">
          Start the API with <code>npm run dev:api</code> — the platform keeps every module&apos;s
          rules on the server, so there is no offline cache of agreements.
        </p>
      </div>
    );
  }

  const toggleHref = (next: 'list' | 'graph') => {
    const params = new URLSearchParams(query);
    if (next === 'graph') params.set('view', 'graph');
    const qs = params.toString();
    return `/agreements/active${qs ? `?${qs}` : ''}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" action="/agreements/active" className="flex flex-wrap items-end gap-2">
          {view === 'graph' ? <input type="hidden" name="view" value="graph" /> : null}
          <div>
            <label htmlFor="filter-pod" className="block text-xs text-slate-500">
              Pod
            </label>
            <select
              id="filter-pod"
              name="podId"
              defaultValue={podId}
              className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All pods</option>
              {(me?.pods ?? []).map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-holding" className="block text-xs text-slate-500">
              Holding
            </label>
            <select
              id="filter-holding"
              name="holdingId"
              defaultValue={holdingId}
              className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All holdings</option>
              {(me?.holdings ?? []).map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-xs text-slate-500">
              Status
            </label>
            <select
              id="filter-status"
              name="status"
              defaultValue={status}
              className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Any status</option>
              {AGREEMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded border border-line-200 px-3 py-1.5 text-sm text-ink-700 hover:border-signal-600"
          >
            Apply
          </button>
          {queryString ? (
            <Link href="/agreements/active" className="px-2 py-1.5 text-sm text-slate-500 underline">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="flex border border-line-200 bg-white" role="group" aria-label="View">
          <Link
            href={toggleHref('list')}
            aria-current={view === 'list' ? 'true' : undefined}
            className={`px-3 py-1.5 text-sm ${
              view === 'list' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'
            }`}
          >
            List view
          </Link>
          <Link
            href={toggleHref('graph')}
            aria-current={view === 'graph' ? 'true' : undefined}
            className={`border-l border-line-200 px-3 py-1.5 text-sm ${
              view === 'graph' ? 'bg-signal-50 text-ink-950' : 'text-slate-500'
            }`}
          >
            Network graph view
          </Link>
        </div>
      </div>

      {view === 'graph' ? (
        graph ? (
          <AgreementGraphView graph={graph} focusPodId={podId || null} viewerPodIds={graph.viewerPodIds} />
        ) : (
          <p className="border border-line-200 bg-white p-4 text-sm text-slate-500">
            The graph could not be loaded.
          </p>
        )
      ) : agreements.length === 0 ? (
        <EmptyState filtered={Boolean(queryString)} />
      ) : (
        <>
          {/* Table for tablet and desktop. */}
          <div className="hidden overflow-x-auto border border-line-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">CLOU agreements</caption>
              <thead className="border-b border-line-200 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Agreement name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Pod A
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Pod B
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Service description
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Start date
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Renewal date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-200">
                {agreements.map((agreement) => (
                  <tr key={agreement.id} className="hover:bg-paper-100">
                    <td className="px-3 py-2">
                      <Link
                        href={`/agreements/${agreement.id}`}
                        className="text-signal-600 underline"
                      >
                        {agreement.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink-950">{agreement.podAName}</td>
                    <td className="px-3 py-2 text-ink-950">{agreement.podBName}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-slate-500">
                      {agreement.serviceDescription}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip
                        tone={agreementStatusTone(agreement.displayStatus)}
                        label={labelFor(agreement.displayStatus)}
                      />
                    </td>
                    <td className="tabular px-3 py-2 text-slate-500">
                      {agreement.startDate ? formatShortDate(agreement.startDate) : '—'}
                    </td>
                    <td className="tabular px-3 py-2 text-slate-500">
                      {agreement.renewalDate ? formatShortDate(agreement.renewalDate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Same rows, stacked for phones. */}
          <ul className="divide-y divide-line-200 border border-line-200 bg-white md:hidden">
            {agreements.map((agreement) => (
              <li key={agreement.id} className="p-3">
                <Link href={`/agreements/${agreement.id}`} className="text-sm text-signal-600 underline">
                  {agreement.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {agreement.podAName} ↔ {agreement.podBName}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-950">
                  {agreement.serviceDescription}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <StatusChip
                    tone={agreementStatusTone(agreement.displayStatus)}
                    label={labelFor(agreement.displayStatus)}
                  />
                  <span className="tabular">
                    Start {agreement.startDate ? formatShortDate(agreement.startDate) : '—'}
                  </span>
                  <span className="tabular">
                    Renewal {agreement.renewalDate ? formatShortDate(agreement.renewalDate) : '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function labelFor(displayStatus: string): string {
  return AGREEMENT_STATUS_OPTIONS.find((option) => option.value === displayStatus)?.label ?? displayStatus;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="border border-line-200 bg-white p-4">
      <p className="text-sm text-ink-950">
        {filtered ? 'No agreements match these filters.' : 'No agreements yet.'}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {filtered ? (
          <>
            Clear the filters to see the whole organisation, or{' '}
            <Link href="/agreements/new" className="text-signal-600 underline">
              propose a new agreement
            </Link>
            .
          </>
        ) : (
          <>
            A CLOU only exists between pods that actually exchange something — so an empty list is a
            true answer, not a gap. When two pods agree to trade a service, the Pod Lead of one
            proposes it and the other accepts, counters or declines.
          </>
        )}
      </p>
    </div>
  );
}
