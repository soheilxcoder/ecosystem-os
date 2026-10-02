/**
 * Lock checklist — 05-MODULE-BUDGET-MARKET.md: the lock button is "disabled
 * otherwise with a clear checklist of what's missing".
 *
 * The checklist is the point of this component, not the button. A disabled
 * control explains nothing, so every blocker is listed with enough detail that
 * the reader knows whose action unblocks it — which is the difference between
 * "cannot lock" and "Pod Cinder has no submitted peer reviews this cycle".
 */

import { StatusChip } from '../ui/StatusChip';

export interface ChecklistBlocker {
  reason: string;
  podId: string | null;
  podName: string | null;
  detail: string;
}

export interface LockChecklistProps {
  cycleNumber: number;
  status: 'provisional' | 'locked';
  cycleDay: number | null;
  phaseKey: string | null;
  inLockWindow: boolean;
  calculated: boolean;
  blockers: ChecklistBlocker[];
  canLock: boolean;
  lockedAt?: string | null;
  auditHash?: string | null;
  className?: string;
}

const REASON_LABELS: Record<string, string> = {
  peer_reviews_unresolved: 'Peer reviews still open',
  peer_reviews_missing: 'No peer reviews submitted',
  financial_sync_missing: 'No financial figures',
  financial_sync_failed: 'Financial sync failed',
  no_pods: 'Nothing to allocate',
};

export function LockChecklist({
  cycleNumber,
  status,
  cycleDay,
  phaseKey,
  inLockWindow,
  calculated,
  blockers,
  canLock,
  lockedAt,
  auditHash,
  className = '',
}: LockChecklistProps) {
  const locked = status === 'locked';

  const rows: Array<{ label: string; done: boolean; note: string }> = [
    {
      label: 'The automated calculation has run',
      done: calculated,
      note: calculated
        ? 'Every pod has a stored Unit Score and allocation'
        : 'The Architecture Hub sets the total pool and runs the calculation first',
    },
    {
      label: 'Every component score is measured, not estimated',
      done: blockers.length === 0,
      note:
        blockers.length === 0
          ? 'No input fell back to the midpoint'
          : `${blockers.length} input${blockers.length === 1 ? '' : 's'} still estimated or missing`,
    },
    {
      label: 'Inside the Day 89–90 announcement window',
      done: inLockWindow,
      note: inLockWindow
        ? cycleDay !== null
          ? `Cycle day ${cycleDay}${phaseKey ? ` · ${phaseKey.replace(/_/g, ' ')}` : ''}`
          : 'In the results phase'
        : cycleDay !== null
          ? `Cycle day ${cycleDay} — results are announced on Days 89–90`
          : 'No active sprint cycle to resolve the window from',
    },
  ];

  return (
    <section
      className={`rounded border border-line-200 bg-surface-white ${className}`}
      style={{ borderLeft: '2px solid var(--color-status-watch, #B7791F)' }}
      aria-labelledby="budget-lock-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-200 px-4 py-3">
        <h2 id="budget-lock-heading" className="font-display text-lg text-ink-950">
          Cycle {cycleNumber} budget
        </h2>
        {locked ? (
          <StatusChip tone="good" label={`Locked${lockedAt ? ` on ${lockedAt}` : ''}`} />
        ) : canLock ? (
          <StatusChip tone="active" label="Ready to lock" />
        ) : (
          <StatusChip tone="watch" label="Provisional — live estimate" />
        )}
      </header>

      <ul className="divide-y divide-line-200">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-3 px-4 py-2.5">
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-2xs ${
                row.done
                  ? 'border-status-good bg-status-good text-white'
                  : 'border-line-300 bg-surface-white text-transparent'
              }`}
            >
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-950">{row.label}</p>
              <p className="text-xs text-slate-500">{row.note}</p>
            </div>
            <span className="sr-only">{row.done ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>

      {blockers.length > 0 && (
        <div className="border-t border-line-200 px-4 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            What is missing
          </h3>
          <ul className="mt-2 space-y-1.5">
            {blockers.map((blocker, index) => (
              <li key={`${blocker.reason}-${blocker.podId ?? 'org'}-${index}`} className="text-sm">
                <span className="text-ink-950">
                  {REASON_LABELS[blocker.reason] ?? blocker.reason.replace(/_/g, ' ')}
                </span>
                {blocker.podName && (
                  <span className="text-slate-500"> · {blocker.podName}</span>
                )}
                <span className="block text-xs text-slate-500">{blocker.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locked && auditHash && (
        <p className="border-t border-line-200 px-4 py-3 font-mono text-xs text-slate-500">
          Audit reference <span className="text-ink-950">{auditHash}</span> — these numbers are
          immutable. A correction arrives as a new record referring to this one, never as an edit.
        </p>
      )}
    </section>
  );
}
