'use client';

/**
 * Peer review & governance forms (Module 08).
 *
 * Every control is a plain form, so the markup works with or without client
 * JavaScript — and because the server decides what is allowed, a hand-crafted
 * POST gets exactly the same answer as a click.
 *
 * Two rules are made visible rather than merely enforced: a review must carry a
 * real justification (the counter shows how much is left), and a panel vote is
 * offered to a named seat rather than to whoever opens the page.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  assignReviewersAction,
  castPanelVoteAction,
  escalateCaseAction,
  logCaseEntryAction,
  openCaseAction,
  recommendResolutionAction,
  recordEntryDecisionAction,
  saveReviewAction,
  advanceStageAction,
  updateTrialCriteriaAction,
  type ReviewActionState,
} from '../../app/actions/review';
import { REVIEW_COMMENT_MIN_LENGTH, RUBRIC_QUESTIONS } from '../../core/peer-review';

const EMPTY: ReviewActionState = {};

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
  name,
  value,
  disabled,
}: {
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const styles =
    variant === 'primary'
      ? 'bg-signal-600 text-white hover:bg-signal-700'
      : variant === 'danger'
        ? 'border border-status-alert text-status-alert hover:bg-red-50'
        : 'border border-line-200 text-ink-700 hover:border-signal-600';
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles}`}
    >
      {pending ? (pendingLabel ?? 'Working…') : label}
    </button>
  );
}

function Feedback({ state }: { state: ReviewActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-status-alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="mt-2 text-sm text-status-good">
        {state.success}
      </p>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Peer review
// ---------------------------------------------------------------------------

export function AssignPanelForm({ cycleId, count }: { cycleId: string | null; count: number }) {
  const [state, action] = useActionState(assignReviewersAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <h3 className="text-sm font-medium text-ink-950">
        {count} {count === 1 ? 'pitch has' : 'pitches have'} no panel yet
      </h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Assignment excludes the pod&apos;s own members, its coach, and anyone in a pod trading with
        it under an active CLOU. The panel rotates one seat per cycle.
      </p>
      {cycleId ? <input type="hidden" name="cycleId" value={cycleId} /> : null}
      <div className="mt-3">
        <SubmitButton label="Assign panels" pendingLabel="Assigning…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ReviewScoreForm({
  pitchId,
  podName,
  initialScore,
  initialComments,
  initialRubric,
  minCommentLength = REVIEW_COMMENT_MIN_LENGTH,
  windowOpen,
  readOnly,
}: {
  pitchId: string;
  podName: string;
  initialScore: number | null;
  initialComments: string | null;
  initialRubric: Record<string, string | number>;
  minCommentLength?: number;
  windowOpen: boolean;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveReviewAction, EMPTY);
  const [comments, setComments] = useState(initialComments ?? '');
  const remaining = minCommentLength - comments.trim().length;

  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="pitchId" value={pitchId} />
      <h3 className="text-sm font-medium text-ink-950">Review {podName}</h3>

      <div className="mt-3 max-w-xs">
        <label htmlFor={`score-${pitchId}`} className="block text-xs text-slate-500">
          Score (0–100)
        </label>
        <input
          id={`score-${pitchId}`}
          name="score"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={initialScore ?? ''}
          disabled={readOnly}
          className="tabular mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
        />
      </div>

      <fieldset className="mt-3" disabled={readOnly}>
        <legend className="text-xs text-slate-500">Rubric</legend>
        {RUBRIC_QUESTIONS.map((question) => (
          <div key={question.key} className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`${question.key}-${pitchId}`} className="w-72 text-sm text-ink-700">
              {question.label}
            </label>
            {question.type === 'met' ? (
              <select
                id={`${question.key}-${pitchId}`}
                name={question.key}
                defaultValue={String(initialRubric[question.key] ?? '')}
                className="border border-line-200 bg-white px-2 py-1 text-sm"
              >
                <option value="">Not answered</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${question.key}-${pitchId}`}
                name={question.key}
                type="number"
                min={question.min}
                max={question.max}
                defaultValue={String(initialRubric[question.key] ?? '')}
                className="tabular w-20 border border-line-200 bg-white px-2 py-1 text-sm"
              />
            )}
          </div>
        ))}
      </fieldset>

      <div className="mt-3">
        <label htmlFor={`comments-${pitchId}`} className="block text-xs text-slate-500">
          Comments — what the pod actually learns from this review
        </label>
        <textarea
          id={`comments-${pitchId}`}
          name="comments"
          rows={5}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          disabled={readOnly}
          className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
        />
        <p className="tabular mt-1 text-xs text-slate-500">
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? '' : 's'} before this can be submitted`
            : 'Long enough to submit'}
        </p>
      </div>

      {!windowOpen ? (
        <p role="status" className="mt-3 text-sm text-status-watch">
          The peer-review window is closed (Days 86–88). Drafts can be saved; submissions cannot.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <SubmitButton label="Save draft" pendingLabel="Saving…" variant="secondary" name="intent" value="draft" disabled={readOnly} />
        <SubmitButton
          label="Submit review"
          pendingLabel="Submitting…"
          name="intent"
          value="submit"
          disabled={readOnly || !windowOpen}
        />
      </div>
      <Feedback state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

export function OpenCaseForm({
  pods,
  resolvers,
}: {
  pods: Array<{ id: string; name: string }>;
  resolvers: Array<{ id: string; fullName: string }>;
}) {
  const [state, action] = useActionState(openCaseAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <h3 className="text-sm font-medium text-ink-950">Open a conflict case</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="podAId" className="block text-xs text-slate-500">
            Pod A
          </label>
          <select id="podAId" name="podAId" className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Choose a pod</option>
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="podBId" className="block text-xs text-slate-500">
            Pod B
          </label>
          <select id="podBId" name="podBId" className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Choose a pod</option>
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="resolverUserId" className="block text-xs text-slate-500">
            Conflict Resolver
          </label>
          <select
            id="resolverUserId"
            name="resolverUserId"
            className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Choose a resolver</option>
            {resolvers.map((resolver) => (
              <option key={resolver.id} value={resolver.id}>
                {resolver.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor="subject" className="block text-xs text-slate-500">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          maxLength={200}
          className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
          placeholder="Shared QA queue ownership"
        />
      </div>
      <div className="mt-3">
        <SubmitButton label="Open case" pendingLabel="Opening…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CaseLogForm({
  caseId,
  roles,
}: {
  caseId: string;
  roles: Array<{ value: 'resolver' | 'pod_a' | 'pod_b'; label: string }>;
}) {
  const [state, action] = useActionState(logCaseEntryAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="caseId" value={caseId} />
      <h3 className="text-sm font-medium text-ink-950">Add to the case log</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Entries are append-only: both pods and the resolver see everything, and nothing is edited
        afterwards.
      </p>
      <div className="mt-3">
        <label htmlFor="authorRole" className="block text-xs text-slate-500">
          Adding as
        </label>
        <select
          id="authorRole"
          name="authorRole"
          className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <label htmlFor="body" className="block text-xs text-slate-500">
          Entry
        </label>
        <textarea id="body" name="body" rows={4} className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-3">
        <SubmitButton label="Log entry" pendingLabel="Logging…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RecommendForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(recommendResolutionAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="caseId" value={caseId} />
      <h3 className="text-sm font-medium text-ink-950">Non-binding recommendation</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        The recommendation is advice both pods can accept or ignore; it closes the case either way.
      </p>
      <textarea
        name="text"
        rows={4}
        className="mt-3 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
        placeholder="Split the QA queue by service: one pod owns ingestion, the other reporting."
      />
      <div className="mt-3">
        <SubmitButton label="Record recommendation" pendingLabel="Recording…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function EscalateForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(escalateCaseAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="caseId" value={caseId} />
      <h3 className="text-sm font-medium text-ink-950">Escalate to a rule review</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Use this when the dispute is really about the rule — the answer is then a rule change
        taking effect next cycle, never retroactively.
      </p>
      <div className="mt-3">
        <SubmitButton label="Escalate" pendingLabel="Escalating…" variant="secondary" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Track 1 — Entry Rule
// ---------------------------------------------------------------------------

export function EntryDecisionForm({
  podId,
  side,
  sideLabel,
  unlocked,
  current,
}: {
  podId: string;
  side: 'pod' | 'hub';
  sideLabel: string;
  unlocked: boolean;
  current: 'join' | 'discontinue' | null;
}) {
  const [state, action] = useActionState(recordEntryDecisionAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="podId" value={podId} />
      <input type="hidden" name="side" value={side} />
      <h3 className="text-sm font-medium text-ink-950">{sideLabel}</h3>
      {current ? (
        <p role="status" className="mt-1 text-sm text-slate-500">
          Recorded: {current === 'join' ? 'Join fully' : 'Do not continue'}
        </p>
      ) : null}
      {!unlocked ? (
        <p role="status" className="mt-2 text-sm text-status-watch">
          The decision unlocks on Day 90. There is nothing to record before then.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <SubmitButton
          label="Join fully"
          pendingLabel="Recording…"
          name="recommendation"
          value="join"
          disabled={!unlocked || current !== null}
        />
        <SubmitButton
          label="Do not continue"
          pendingLabel="Recording…"
          variant="danger"
          name="recommendation"
          value="discontinue"
          disabled={!unlocked || current !== null}
        />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function TrialCriteriaForm({
  podId,
  criteria,
}: {
  podId: string;
  criteria: Array<{ label: string; met: boolean | null }>;
}) {
  const [state, action] = useActionState(updateTrialCriteriaAction, EMPTY);
  const [rows, setRows] = useState(
    criteria.length > 0 ? criteria : [{ label: '', met: null as boolean | null }],
  );

  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="podId" value={podId} />
      <h3 className="text-sm font-medium text-ink-950">Entry criteria</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Defined by the Deployment Hub when the unit is deployed. Each item is Met, Not yet, or N/A.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((criterion, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2">
            <input
              name="criterionLabel"
              value={criterion.label}
              onChange={(event) =>
                setRows((current) =>
                  current.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)),
                )
              }
              placeholder="Completed at least one full pitch cycle"
              className="w-full max-w-md border border-line-200 bg-white px-2 py-1.5 text-sm"
            />
            <select
              name="criterionMet"
              value={criterion.met === null ? '' : String(criterion.met)}
              onChange={(event) =>
                setRows((current) =>
                  current.map((row, i) =>
                    i === index
                      ? { ...row, met: event.target.value === '' ? null : event.target.value === 'true' }
                      : row,
                  ),
                )
              }
              className="border border-line-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="true">Met</option>
              <option value="false">Not yet</option>
              <option value="">N/A</option>
            </select>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setRows((current) => [...current, { label: '', met: null }])}
        className="mt-3 text-sm text-signal-700 underline"
      >
        Add a criterion
      </button>
      <div className="mt-3">
        <SubmitButton label="Save checklist" pendingLabel="Saving…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Track 2 — Accountability Path
// ---------------------------------------------------------------------------

export function AdvanceStageForm({
  podId,
  to,
  label,
  coaches = [],
  cases = [],
}: {
  podId: string;
  to: string;
  label: string;
  coaches?: Array<{ id: string; fullName: string }>;
  cases?: Array<{ id: string; subject: string }>;
}) {
  const [state, action] = useActionState(advanceStageAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="podId" value={podId} />
      <input type="hidden" name="to" value={to} />
      <h3 className="text-sm font-medium text-ink-950">Move to {label}</h3>
      {to === 'correction_period' ? (
        <div className="mt-3">
          <label htmlFor="coachUserId" className="block text-xs text-slate-500">
            Coach for the 30 days of intensive support
          </label>
          <select
            id="coachUserId"
            name="coachUserId"
            className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Not assigned yet</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {to === 'mediation' && cases.length > 0 ? (
        <div className="mt-3">
          <label htmlFor="conflictCaseId" className="block text-xs text-slate-500">
            Linked conflict case
          </label>
          <select
            id="conflictCaseId"
            name="conflictCaseId"
            className="mt-1 border border-line-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">No case linked</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.subject}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="mt-3">
        <SubmitButton label={`Move to ${label}`} pendingLabel="Moving…" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PanelVoteForm({ podId }: { podId: string }) {
  const [state, action] = useActionState(castPanelVoteAction, EMPTY);
  return (
    <form action={action} className="border border-line-200 bg-white p-4">
      <input type="hidden" name="podId" value={podId} />
      <h3 className="text-sm font-medium text-ink-950">Cast your vote</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        One vote, one reason, and it cannot be changed afterwards. The decision needs a majority of
        the panel — never a single person.
      </p>
      <div className="mt-3">
        <label htmlFor="comment" className="block text-xs text-slate-500">
          Reason (the pod and the archive can read this)
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          className="mt-1 w-full border border-line-200 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SubmitButton label="Continue" pendingLabel="Recording…" name="vote" value="continue" />
        <SubmitButton label="Dissolve" pendingLabel="Recording…" variant="danger" name="vote" value="dissolve" />
      </div>
      <Feedback state={state} />
    </form>
  );
}
