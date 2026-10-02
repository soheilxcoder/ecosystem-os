'use client';

/**
 * Corrections panel (13-TECHNICAL-ARCHITECTURE.md §7).
 *
 * Locked records (budget results, entry decisions, accountability outcomes,
 * financial sync figures, review scores) are immutable by design. When a real
 * error happens — "the accounting sync had a bug and Pod A's Q3 figure was
 * wrong" — this is the ONE path that fixes it: a Correction Record. It never
 * overwrites the original row; it stores a frozen original beside the
 * corrected value, and the UI shows both ("superseded" / "corrected on …").
 *
 * Two-person rule: proposing and approving must be two different Architecture
 * Hub members. The Approve/Reject buttons therefore only make sense to a
 * second architect; the API refuses the proposer approving their own record.
 */

import { useActionState } from 'react';
import {
  approveCorrectionAction,
  proposeCorrectionAction,
  rejectCorrectionAction,
  type CorrectionActionState,
} from '../../app/actions/hub';
import type { CorrectionRecord } from '../../lib/types-hub';

const ENTITY_TYPES = [
  { value: 'budget_result', label: 'Locked budget result' },
  { value: 'financial_sync', label: 'Financial/CRM sync figure' },
  { value: 'entry_trial', label: '90-Day Entry decision' },
  { value: 'accountability_case', label: 'Accountability outcome' },
  { value: 'peer_review_score', label: 'Peer review score' },
] as const;

/** Mirrors the server's CORRECTABLE_FIELDS allowlist (server/services/hub.ts). */
const FIELD_OPTIONS: Record<string, string[]> = {
  budget_result: ['final_budget', 'unit_score', 'survival_budget'],
  financial_sync: ['revenue', 'costs', 'profit'],
  entry_trial: ['final_result'],
  accountability_case: ['final_result', 'current_stage'],
  peer_review_score: ['score'],
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ApproveReject({ id }: { id: string }) {
  return (
    <div className="flex gap-2">
      <form action={approveCorrectionAction.bind(null, id)}>
        <button
          type="submit"
          className="rounded bg-ink-950 px-2.5 py-1 text-2xs font-medium text-white hover:bg-ink-800"
        >
          Approve
        </button>
      </form>
      <form action={rejectCorrectionAction.bind(null, id)}>
        <button
          type="submit"
          className="rounded border border-line-300 px-2.5 py-1 text-2xs text-ink-700 hover:border-line-400"
        >
          Reject
        </button>
      </form>
    </div>
  );
}

export function CorrectionsPanel({ corrections }: { corrections: CorrectionRecord[] }) {
  const [state, formAction, pending] = useActionState<CorrectionActionState, FormData>(
    proposeCorrectionAction,
    {},
  );

  const pendingCorrections = corrections.filter((c) => c.status === 'pending');
  const decidedCorrections = corrections.filter((c) => c.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Proposal form */}
      <section className="rounded border border-line-200 bg-surface-white p-4" aria-labelledby="propose-correction">
        <h3 id="propose-correction" className="font-display text-base text-ink-950">
          Propose a correction
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          The original value is read from the record at proposal time — it is never taken from this
          form. Approval requires a second, different Architecture Hub member.
        </p>
        <form action={formAction} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="cr-entityType">
                Record type
              </label>
              <select
                id="cr-entityType"
                name="entityType"
                required
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              >
                {ENTITY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="cr-entityId">
                Record id
              </label>
              <input
                id="cr-entityId"
                name="entityId"
                required
                placeholder="uuid of the locked record"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="cr-field">
                Field to correct
              </label>
              <input
                id="cr-field"
                name="fieldCorrected"
                required
                placeholder="e.g. revenue, final_budget, final_result"
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 font-mono text-xs"
              />
              <p className="mt-1 text-2xs text-slate-500">
                Allowed: budget_result → final_budget / unit_score / survival_budget; financial_sync →
                revenue / costs / profit; entry_trial &amp; accountability_case → final_result (+
                current_stage); peer_review_score → score.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-950" htmlFor="cr-value">
                Corrected value
              </label>
              <input
                id="cr-value"
                name="correctedValue"
                required
                placeholder='e.g. 84000 or "enter"'
                className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-950" htmlFor="cr-reason">
              Reason
            </label>
            <textarea
              id="cr-reason"
              name="reason"
              required
              minLength={10}
              rows={2}
              placeholder="What went wrong and why this value is right — it is stored with the correction."
              className="mt-1 w-full rounded border border-line-300 px-2.5 py-1.5 text-sm"
            />
          </div>

          {state.error && (
            <p className="rounded border border-status-alert/40 bg-white px-3 py-2 text-sm text-ink-950" role="alert">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded border border-status-good/40 bg-white px-3 py-2 text-sm text-ink-950">
              {state.success}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
          >
            {pending ? 'Proposing…' : 'Propose correction'}
          </button>
        </form>
      </section>

      {/* Pending — needs a second architect */}
      <section aria-labelledby="pending-corrections">
        <h3 id="pending-corrections" className="font-display text-base text-ink-950">
          Awaiting a second architect
        </h3>
        <div className="mt-2 space-y-2">
          {pendingCorrections.length === 0 ? (
            <p className="rounded border border-dashed border-line-300 bg-surface-white px-4 py-5 text-center text-sm text-slate-500">
              Nothing awaiting approval.
            </p>
          ) : (
            pendingCorrections.map((correction) => (
              <article key={correction.id} className="rounded border border-status-watch/40 bg-surface-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-mono text-2xs text-ink-950">
                    {correction.originalEntityType}.{correction.fieldCorrected}
                  </h4>
                  <ApproveReject id={correction.id} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-2xs uppercase tracking-wide text-slate-500">Original (superseded)</p>
                    <p className="mt-0.5 break-all font-mono text-ink-700 line-through decoration-status-alert/50">
                      {formatValue(correction.originalValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs uppercase tracking-wide text-slate-500">Corrected (proposed)</p>
                    <p className="mt-0.5 break-all font-mono text-ink-950">
                      {formatValue(correction.correctedValue)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-2xs text-slate-600">{correction.reason}</p>
                <p className="mt-1 text-2xs text-slate-500">Proposed by {correction.proposedByName ?? '—'}</p>
              </article>
            ))
          )}
        </div>
      </section>

      {/* Decided — the permanent, visible record */}
      <section aria-labelledby="decided-corrections">
        <h3 id="decided-corrections" className="font-display text-base text-ink-950">
          Correction history
        </h3>
        <div className="mt-2 space-y-2">
          {decidedCorrections.length === 0 ? (
            <p className="rounded border border-dashed border-line-300 bg-surface-white px-4 py-5 text-center text-sm text-slate-500">
              No decided corrections yet.
            </p>
          ) : (
            decidedCorrections.map((correction) => (
              <article
                key={correction.id}
                className={`rounded border p-3 ${
                  correction.status === 'approved'
                    ? 'border-status-good/40 bg-surface-white'
                    : 'border-line-200 bg-paper-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-mono text-2xs text-ink-950">
                    {correction.originalEntityType}.{correction.fieldCorrected}
                  </h4>
                  <span
                    className={`rounded px-2 py-0.5 text-2xs font-medium ${
                      correction.status === 'approved'
                        ? 'bg-status-good/10 text-ink-950'
                        : 'bg-line-100 text-slate-500'
                    }`}
                  >
                    {correction.status}
                  </span>
                </div>
                {correction.status === 'approved' ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Original (superseded)</p>
                      <p className="mt-0.5 break-all font-mono text-ink-700 line-through decoration-status-alert/50">
                        {formatValue(correction.originalValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Corrected value</p>
                      <p className="mt-0.5 break-all font-mono text-ink-950">
                        {formatValue(correction.correctedValue)}
                      </p>
                    </div>
                  </div>
                ) : null}
                <p className="mt-2 text-2xs text-slate-600">{correction.reason}</p>
                <p className="mt-1 text-2xs text-slate-500">
                  {correction.status === 'approved'
                    ? `Corrected on ${correction.decidedAt ? correction.decidedAt.slice(0, 10) : '—'} · approved by ${correction.approvedByName ?? '—'}, proposed by ${correction.proposedByName ?? '—'}`
                    : `Rejected · proposed by ${correction.proposedByName ?? '—'}`}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
