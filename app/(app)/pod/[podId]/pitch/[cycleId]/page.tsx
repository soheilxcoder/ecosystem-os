/**
 * Pitch editor (`/pod/:podId/pitch/:cycleId`) — 03-MODULE-PODS-TEAMS.md screen 2.
 *
 * States:
 *  - before Day 81: locked preview with a link to the previous cycle's pitch
 *  - Days 81–85: editable by the Pod Lead, with an auto-submit warning from Day 84
 *  - after submission: read-only with a submitted stamp
 */

import Link from 'next/link';
import { PitchEditor } from '../../../../../../components/pods/PodForms';
import { StatusChip } from '../../../../../../components/ui/StatusChip';
import { apiRequestOrNull } from '../../../../../../lib/api';
import { getSessionToken } from '../../../../../../lib/session';
import { formatShortDate } from '../../../../../../core/time';
import { isAutoSubmitWarning, isPitchWindow, daysUntilPitchDeadline } from '../../../../../../core/calendar';

export const dynamic = 'force-dynamic';

interface PitchRow {
  id: string;
  status: 'draft' | 'submitted' | 'reviewed' | 'scored';
  previousSummary: string | null;
  keyResults: Array<{ metric: string; target: string; actual: string }>;
  nextPlan: string | null;
  budgetContext: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

interface PhasePayload {
  cycleId: string;
  cycleNumber: number;
  day: number;
  phaseBoundaries: { p1_end: number; p2_end: number; p3_end: number; p4_end: number; p5_end: number };
}

export default async function PitchPage({
  params,
}: {
  params: Promise<{ podId: string; cycleId: string }>;
}) {
  const { podId, cycleId } = await params;
  const token = await getSessionToken();

  const [pitch, phase, me] = await Promise.all([
    apiRequestOrNull<PitchRow>(`/api/pods/${podId}/pitch/${cycleId}`, { token }),
    apiRequestOrNull<PhasePayload>(`/api/calendar/current?podId=${podId}`, { token }),
    apiRequestOrNull<{ user: { id: string } | null; roles: Array<{ roleType: string; scopeId: string | null }> }>(
      '/api/me',
      { token },
    ),
  ]);

  if (!phase) {
    return (
      <div className="border border-line-200 bg-white p-4">
        <p className="text-sm text-ink-950">No active cycle — the pitch editor is closed.</p>
      </div>
    );
  }

  const boundaries = phase.phaseBoundaries;
  const windowOpen = isPitchWindow(phase.day, boundaries);
  const isLead = (me?.roles ?? []).some(
    (role) => role.roleType === 'pod_lead' && role.scopeId === podId,
  );
  const submitted = pitch && pitch.status !== 'draft';
  const readOnly = !windowOpen || !isLead || Boolean(submitted);
  const daysLeft = daysUntilPitchDeadline(phase.day, boundaries);

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-ink-950">
              Pitch · cycle {phase.cycleNumber}
            </h1>
            <p className="mt-1 max-w-prose text-sm text-slate-500">
              Days {boundaries.p2_end + 1}–{boundaries.p3_end} of the cycle. This is what peer
              validators score — it does not set the budget, which is formula-driven.
            </p>
          </div>
          {pitch ? (
            <StatusChip
              tone={submitted ? 'good' : 'neutral'}
              label={submitted ? `Submitted` : 'Draft'}
            />
          ) : null}
        </div>
      </header>

      {!windowOpen && !submitted ? (
        <div className="mb-4 border-l-2 border-status-neutral bg-white p-4">
          <p className="text-sm font-medium text-ink-950">
            {phase.day < boundaries.p2_end + 1
              ? `The pitch editor opens on Day ${boundaries.p2_end + 1}`
              : 'The pitch window has closed for this cycle'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {phase.day < boundaries.p2_end + 1
              ? `${boundaries.p2_end + 1 - phase.day} days from now.`
              : 'A draft left open at the deadline is submitted automatically.'}{' '}
            <Link href={`/pod/${podId}/history`} className="text-signal-600 underline">
              View last cycle’s pitch
            </Link>
          </p>
        </div>
      ) : null}

      {windowOpen && !submitted ? (
        <div
          className={`mb-4 border-l-2 p-4 ${
            isAutoSubmitWarning(phase.day, boundaries)
              ? 'border-status-watch bg-status-watch/10'
              : 'border-signal-600 bg-white'
          }`}
          role={isAutoSubmitWarning(phase.day, boundaries) ? 'status' : undefined}
        >
          <p className="text-sm text-ink-950">
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} until the Day ${boundaries.p3_end} deadline.`
              : `Today is the final day of the pitch window.`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {isAutoSubmitWarning(phase.day, boundaries)
              ? 'The last saved draft is submitted automatically when the window closes.'
              : 'Save as often as you like; submitting locks the pitch.'}
          </p>
        </div>
      ) : null}

      {submitted ? (
        <p className="mb-4 border border-line-200 bg-white p-3 tabular text-sm text-slate-500">
          Submitted {pitch!.submittedAt ? formatShortDate(pitch!.submittedAt.slice(0, 10)) : ''}
          {pitch!.autoSubmitted ? ' — auto-submitted at the Day-85 deadline' : ''}. Peer review status
          appears once reviewers are assigned (phase 3).
        </p>
      ) : null}

      <PitchEditor
        podId={podId}
        cycleId={cycleId}
        readOnly={readOnly}
        allowSubmit={windowOpen && isLead && !submitted}
        initial={{
          previousSummary: pitch?.previousSummary ?? '',
          keyResults: pitch?.keyResults ?? [],
          nextPlan: pitch?.nextPlan ?? '',
          budgetContext: pitch?.budgetContext ?? '',
        }}
      />
    </div>
  );
}
