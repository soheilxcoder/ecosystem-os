/**
 * `/review/cases/:id` — the case workspace.
 *
 * A shared, append-only timeline: the resolver's mediation notes are marked
 * distinctly from each pod's own statements, so both sides can read the same
 * record without wondering who said what.
 */

import Link from 'next/link';

import { StatusChip } from '../../../../../components/ui/StatusChip';
import {
  CaseLogForm,
  EscalateForm,
  RecommendForm,
} from '../../../../../components/review/ReviewForms';
import { apiRequestOrNull } from '../../../../../lib/api';
import { getSessionToken } from '../../../../../lib/session';
import type { ApiMe } from '../../../../../lib/types';
import { CASE_ROLE_LABELS, CASE_STATUS_TONES, type CaseDetailView } from '../../../../../lib/governance';
import { formatDateTime } from '../../../../../core/time';

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const token = await getSessionToken();
  const [detail, me] = await Promise.all([
    apiRequestOrNull<CaseDetailView>(`/api/review/cases/${caseId}`, { token }),
    apiRequestOrNull<ApiMe>('/api/me', { token }),
  ]);

  if (!detail) {
    return (
      <div>
        <h1 className="font-display text-2xl text-ink-950">Conflict case</h1>
        <p className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          This case is not available to you. Only the two pods and the assigned Conflict Resolver
          can read a case workspace.
        </p>
        <Link href="/review/cases" className="mt-3 inline-block text-sm text-signal-700 underline">
          Back to the case list
        </Link>
      </div>
    );
  }

  const myPodIds = new Set((me?.pods ?? []).map((pod) => pod.id));
  const isResolver = detail.resolverUserId === me?.user?.id;
  const side = myPodIds.has(detail.podAId)
    ? 'pod_a'
    : myPodIds.has(detail.podBId)
      ? 'pod_b'
      : null;

  const roles: Array<{ value: 'resolver' | 'pod_a' | 'pod_b'; label: string }> = [];
  if (isResolver) roles.push({ value: 'resolver', label: 'Conflict Resolver (mediation note)' });
  if (side === 'pod_a') roles.push({ value: 'pod_a', label: `Statement for ${detail.podAName}` });
  if (side === 'pod_b') roles.push({ value: 'pod_b', label: `Statement for ${detail.podBName}` });

  return (
    <div>
      <Link href="/review/cases" className="text-sm text-slate-500 underline">
        ← All cases
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl text-ink-950">{detail.subject}</h1>
        <StatusChip tone={CASE_STATUS_TONES[detail.status]} label={detail.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {detail.podAName} ↔ {detail.podBName} · resolver {detail.resolverName ?? 'unassigned'} ·
        opened {formatDateTime(detail.openedAt)}
      </p>

      {detail.recommendationText ? (
        <div className="mt-4 border-l-2 border-status-good bg-white p-4">
          <h2 className="text-sm font-medium text-ink-950">Recommendation (non-binding)</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-700">{detail.recommendationText}</p>
        </div>
      ) : null}

      {detail.escalatedToRuleReview ? (
        <p role="status" className="mt-4 border border-line-200 bg-white p-4 text-sm text-ink-700">
          This case was escalated for a rule review — the disagreement is about the rule itself. Any
          change takes effect next cycle, never retroactively.
        </p>
      ) : null}

      <h2 className="mt-6 font-display text-lg text-ink-950">Case log</h2>
      <ol className="mt-3 border border-line-200 bg-white">
        {detail.events.map((event) => (
          <li key={event.id} className="border-b border-line-100 px-4 py-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">{CASE_ROLE_LABELS[event.authorRole]}</span>
              <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
            </div>
            <p className="mt-1 max-w-prose text-sm text-ink-700">{event.body}</p>
          </li>
        ))}
      </ol>

      {roles.length > 0 && detail.status === 'open' ? (
        <div className="mt-4">
          <CaseLogForm caseId={detail.id} roles={roles} />
        </div>
      ) : null}

      {isResolver && detail.status === 'open' ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <RecommendForm caseId={detail.id} />
          <EscalateForm caseId={detail.id} />
        </div>
      ) : null}

      {detail.status !== 'open' ? (
        <p role="status" className="mt-4 border border-line-200 bg-white p-4 text-sm text-slate-500">
          This case is closed. Its log is a record, not a conversation — a new disagreement opens a
          new case.
        </p>
      ) : null}
    </div>
  );
}
