/**
 * `/review/cases` — 08-MODULE-PEER-REVIEW-GOVERNANCE.md screen 2.
 *
 * The Conflict Resolver's case list. The case log is append-only and every
 * entry names who spoke, so both pods can read the same timeline.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../components/ui/StatusChip';
import { OpenCaseForm } from '../../../../components/review/ReviewForms';
import { apiRequestOrNull } from '../../../../lib/api';
import { getSessionToken } from '../../../../lib/session';
import type { ApiMe } from '../../../../lib/types';
import { CASE_STATUS_TONES, type ConflictCaseView } from '../../../../lib/governance';
import { formatDateTime } from '../../../../core/time';

export const dynamic = 'force-dynamic';

interface PodRef {
  id: string;
  name: string;
}

export default async function CasesPage() {
  const token = await getSessionToken();
  const [me, cases, pods] = await Promise.all([
    apiRequestOrNull<ApiMe>('/api/me', { token }),
    apiRequestOrNull<ConflictCaseView[]>('/api/review/cases', { token }),
    apiRequestOrNull<PodRef[]>('/api/pods', { token }),
  ]);

  const isResolver = (me?.roles ?? []).some((role) => role.roleType === 'conflict_resolver');
  const isHub = Boolean(me?.isHubUser);
  const canOpen = isResolver || isHub;

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-950">Conflict cases</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        A Conflict Resolver mediates between two pods. Their recommendation is non-binding: the pods
        decide, the resolver makes sure both sides have been heard.
      </p>

      {canOpen && pods ? (
        <div className="mt-4">
          <OpenCaseForm pods={pods} resolvers={[]} />
        </div>
      ) : null}

      {!cases ? (
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          {isResolver
            ? 'The conflict-case service is unreachable.'
            : 'You do not currently hold the Conflict Resolver seat, so there are no cases here.'}
        </p>
      ) : cases.length === 0 ? (
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          No cases. Disputes are usually settled inside the pods; a case is opened when they cannot.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto border border-line-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Conflict cases</caption>
              <thead className="border-b border-line-200 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Subject</th>
                  <th scope="col" className="px-3 py-2 font-medium">Between</th>
                  <th scope="col" className="px-3 py-2 font-medium">Resolver</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Entries</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b border-line-100">
                    <td className="px-3 py-2">
                      <Link href={`/review/cases/${item.id}`} className="text-signal-700 underline">
                        {item.subject}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {item.podAName} ↔ {item.podBName}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.resolverName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <StatusChip
                        tone={CASE_STATUS_TONES[item.status]}
                        label={item.status}
                        meta={item.escalatedToRuleReview ? '· rule review' : undefined}
                      />
                    </td>
                    <td className="tabular px-3 py-2">{item.eventCount}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {item.lastActivityAt ? formatDateTime(item.lastActivityAt) : formatDateTime(item.openedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-3 md:hidden">
            {cases.map((item) => (
              <li key={item.id} className="border border-line-200 bg-white p-3">
                <Link href={`/review/cases/${item.id}`} className="text-sm font-medium text-signal-700 underline">
                  {item.subject}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {item.podAName} ↔ {item.podBName}
                </p>
                <div className="mt-2">
                  <StatusChip tone={CASE_STATUS_TONES[item.status]} label={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
