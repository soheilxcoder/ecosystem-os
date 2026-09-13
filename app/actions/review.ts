'use server';

/**
 * Peer review & governance mutations (Module 08).
 *
 * These actions marshal input and translate errors — nothing more. Whether a
 * review may be submitted, a stage advanced or a vote cast is decided by
 * `server/services/review.ts` and `server/services/governance.ts`, the same
 * code the API runs, so the affordance rendered in the browser and the rule
 * enforced on the server cannot drift apart.
 */

import { revalidatePath } from 'next/cache';
import { ApiError, apiRequest } from '../../lib/api';
import { getSessionToken } from '../../lib/session';

export interface ReviewActionState {
  error?: string;
  success?: string;
}

async function token(): Promise<string> {
  const value = await getSessionToken();
  if (!value) throw new Error('Your session has expired — sign in again');
  return value;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Peer review
// ---------------------------------------------------------------------------

export async function assignReviewersAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const cycleId = String(formData.get('cycleId') ?? '');
  try {
    const assigned = await apiRequest<Array<{ pitchId: string; reviewerUserIds: string[] }>>(
      '/api/review/assignments',
      { method: 'POST', token: await token(), body: cycleId ? { cycleId } : {} },
    );
    const total = assigned.reduce((sum, item) => sum + item.reviewerUserIds.length, 0);
    revalidatePath('/review/queue');
    return {
      success:
        total === 0
          ? 'No pitches are waiting for a panel in this cycle.'
          : `Assigned ${total} reviewer seats across ${assigned.length} pitch${
              assigned.length === 1 ? '' : 'es'
            }, with conflicts of interest excluded.`,
    };
  } catch (error) {
    return { error: messageFor(error, 'Could not assign reviewers.') };
  }
}

/** Saves a draft or submits a review; `submit` is read from the button pressed. */
export async function saveReviewAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const pitchId = String(formData.get('pitchId') ?? '');
  const intent = String(formData.get('intent') ?? 'draft');
  const submit = intent === 'submit';
  const scoreRaw = String(formData.get('score') ?? '').trim();
  const comments = String(formData.get('comments') ?? '');

  if (!pitchId) return { error: 'This review is missing its pitch.' };
  if (submit && !scoreRaw) return { error: 'A submitted review needs a score between 0 and 100.' };

  const score = scoreRaw === '' ? null : Number(scoreRaw);
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
    return { error: 'The score must be a number between 0 and 100.' };
  }

  const rubricAnswers = {
    targets_met: String(formData.get('targets_met') ?? '') || undefined,
    plan_realistic: Number(formData.get('plan_realistic') ?? '') || undefined,
    evidence_quality: Number(formData.get('evidence_quality') ?? '') || undefined,
  };

  try {
    await apiRequest(`/api/review/${pitchId}/score`, {
      method: 'POST',
      token: await token(),
      body: { score, comments: comments || null, rubricAnswers, submit },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not save this review.') };
  }

  revalidatePath('/review/queue');
  return {
    success: submit
      ? 'Review submitted. The pod sees your score and your comments.'
      : 'Draft saved — you can finish it inside the review window.',
  };
}

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

export async function openCaseAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podAId = String(formData.get('podAId') ?? '');
  const podBId = String(formData.get('podBId') ?? '');
  const resolverUserId = String(formData.get('resolverUserId') ?? '');
  const subject = String(formData.get('subject') ?? '').trim();

  if (!podAId || !podBId) return { error: 'A conflict case needs two pods.' };
  if (podAId === podBId) return { error: 'Pick two different pods.' };
  if (!resolverUserId) return { error: 'Choose the Conflict Resolver who will take the case.' };
  if (!subject) return { error: 'A case needs a subject both pods recognise.' };

  try {
    await apiRequest('/api/review/cases', {
      method: 'POST',
      token: await token(),
      body: { podAId, podBId, resolverUserId, subject },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not open this case.') };
  }

  revalidatePath('/review/cases');
  return { success: 'Case opened. Both pods can now add their statements.' };
}

export async function logCaseEntryAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  const authorRole = String(formData.get('authorRole') ?? '');
  const body = String(formData.get('body') ?? '').trim();

  if (!caseId) return { error: 'This entry is missing its case.' };
  if (!['resolver', 'pod_a', 'pod_b'].includes(authorRole)) {
    return { error: 'Choose whose statement this is.' };
  }
  if (!body) return { error: 'An empty entry cannot be logged.' };

  try {
    await apiRequest(`/api/review/cases/${caseId}/log`, {
      method: 'POST',
      token: await token(),
      body: { authorRole, body },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not log this entry.') };
  }

  revalidatePath(`/review/cases/${caseId}`);
  revalidatePath('/review/cases');
  return { success: 'Logged. Both pods and the resolver see every entry.' };
}

export async function recommendResolutionAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  const text = String(formData.get('text') ?? '').trim();

  if (!caseId) return { error: 'This recommendation is missing its case.' };
  if (text.length < 20) {
    return { error: 'A recommendation needs at least 20 characters both pods can act on.' };
  }

  try {
    await apiRequest(`/api/review/cases/${caseId}/recommend`, {
      method: 'POST',
      token: await token(),
      body: { text },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not record this recommendation.') };
  }

  revalidatePath(`/review/cases/${caseId}`);
  revalidatePath('/review/cases');
  return { success: 'Recommendation recorded and the case is closed.' };
}

export async function escalateCaseAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  if (!caseId) return { error: 'This escalation is missing its case.' };

  try {
    await apiRequest(`/api/review/cases/${caseId}/escalate`, {
      method: 'POST',
      token: await token(),
      body: {},
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not escalate this case.') };
  }

  revalidatePath(`/review/cases/${caseId}`);
  revalidatePath('/review/cases');
  return { success: 'Escalated for a rule review — this dispute is about the rule, not the pods.' };
}

// ---------------------------------------------------------------------------
// Track 1 — Entry Rule
// ---------------------------------------------------------------------------

export async function recordEntryDecisionAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podId = String(formData.get('podId') ?? '');
  const side = String(formData.get('side') ?? '');
  const recommendation = String(formData.get('recommendation') ?? '');

  if (!podId) return { error: 'This decision is missing its pod.' };
  if (side !== 'pod' && side !== 'hub') return { error: 'Choose which side this recommendation is from.' };
  if (recommendation !== 'join' && recommendation !== 'discontinue') {
    return { error: 'Choose whether the unit should join fully or not continue.' };
  }

  try {
    await apiRequest(`/api/review/entry/${podId}/decision`, {
      method: 'POST',
      token: await token(),
      body: { side, recommendation },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not record this decision.') };
  }

  revalidatePath(`/review/entry/${podId}`);
  revalidatePath('/review');
  return { success: 'Recorded. The decision is made once both sides have spoken.' };
}

export async function updateTrialCriteriaAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podId = String(formData.get('podId') ?? '');
  if (!podId) return { error: 'This checklist is missing its pod.' };

  const labels = formData.getAll('criterionLabel').map((value) => String(value).trim());
  const statuses = formData.getAll('criterionMet').map((value) => String(value));
  const criteria = labels
    .map((label, index) => ({
      label,
      met: statuses[index] === 'true' ? true : statuses[index] === 'false' ? false : null,
    }))
    .filter((criterion) => criterion.label.length > 0);

  try {
    await apiRequest(`/api/review/entry/${podId}/criteria`, {
      method: 'POST',
      token: await token(),
      body: { criteria },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not save the checklist.') };
  }

  revalidatePath(`/review/entry/${podId}`);
  return { success: 'Checklist saved.' };
}

// ---------------------------------------------------------------------------
// Track 2 — Accountability Path
// ---------------------------------------------------------------------------

export async function openAccountabilityCaseAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podId = String(formData.get('podId') ?? '');
  if (!podId) return { error: 'This case is missing its pod.' };

  try {
    await apiRequest(`/api/review/accountability/${podId}/open`, {
      method: 'POST',
      token: await token(),
      body: {},
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not open an accountability case.') };
  }

  revalidatePath(`/review/accountability/${podId}`);
  revalidatePath('/review');
  return { success: 'Accountability case opened at stage 1, full transparency.' };
}

export async function advanceStageAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podId = String(formData.get('podId') ?? '');
  const to = String(formData.get('to') ?? '');
  const coachUserId = String(formData.get('coachUserId') ?? '') || null;
  const conflictCaseId = String(formData.get('conflictCaseId') ?? '') || null;

  if (!podId) return { error: 'This stage change is missing its pod.' };
  if (!to) return { error: 'Choose the stage to move to.' };

  try {
    await apiRequest(`/api/review/accountability/${podId}/stage`, {
      method: 'POST',
      token: await token(),
      body: { to, coachUserId, conflictCaseId },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not move this case to the next stage.') };
  }

  revalidatePath(`/review/accountability/${podId}`);
  revalidatePath('/review');
  return { success: 'Stage advanced.' };
}

export async function castPanelVoteAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const podId = String(formData.get('podId') ?? '');
  const vote = String(formData.get('vote') ?? '');
  const comment = String(formData.get('comment') ?? '').trim();

  if (!podId) return { error: 'This vote is missing its pod.' };
  if (vote !== 'continue' && vote !== 'dissolve') return { error: 'Choose continue or dissolve.' };
  if (comment.length < 20) {
    return { error: 'A panel vote needs a short reason the pod and the archive can read.' };
  }

  try {
    await apiRequest(`/api/review/accountability/${podId}/panel-vote`, {
      method: 'POST',
      token: await token(),
      body: { vote, comment },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not record your vote.') };
  }

  revalidatePath(`/review/accountability/${podId}`);
  revalidatePath('/review');
  return { success: 'Vote recorded.' };
}
