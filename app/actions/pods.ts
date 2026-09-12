'use server';

/**
 * Pod mutations.
 *
 * These actions only marshal input and translate errors: every rule about *when*
 * something is allowed lives in `server/services/pods.ts`, which is shared with
 * the API. The server rejects out-of-window attempts; the UI's disabled buttons
 * are a hint, never the control.
 */

import { revalidatePath } from 'next/cache';
import { ApiError, apiRequest } from '../../lib/api';
import { getSessionToken } from '../../lib/session';

export interface ActionState {
  error?: string;
  success?: string;
}

async function token(): Promise<string> {
  const value = await getSessionToken();
  if (!value) throw new Error('Your session has expired — sign in again');
  return value;
}

/** Maps API failures onto a message worth showing a pod member. */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function logCheckinAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const podId = String(formData.get('podId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  const atRiskFlag = formData.get('atRiskFlag') === 'on';

  if (!body) return { error: 'Add a short note before logging the check-in.' };

  try {
    await apiRequest(`/api/pods/${podId}/checkins`, {
      method: 'POST',
      token: await token(),
      body: { body, atRiskFlag },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not log the check-in.') };
  }

  revalidatePath(`/pod/${podId}/overview`);
  return { success: 'Check-in logged.' };
}

export async function savePrioritiesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const podId = String(formData.get('podId') ?? '');
  const priorities = String(formData.get('priorities') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (priorities.length === 0) return { error: 'Add at least one priority for this cycle.' };

  try {
    await apiRequest(`/api/pods/${podId}/priorities`, {
      method: 'PUT',
      token: await token(),
      body: { priorities },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not save the priorities.') };
  }

  revalidatePath(`/pod/${podId}/overview`);
  return { success: 'Priorities saved.' };
}

export async function castVoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const podId = String(formData.get('podId') ?? '');
  const candidateUserId = String(formData.get('candidateUserId') ?? '');

  if (!candidateUserId) return { error: 'Choose a candidate before submitting your vote.' };

  try {
    await apiRequest(`/api/pods/${podId}/pod-lead-vote`, {
      method: 'POST',
      token: await token(),
      body: { candidateUserId },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not record your vote.') };
  }

  revalidatePath(`/pod/${podId}/overview`);
  return { success: 'Vote recorded. It stays visible to the pod.' };
}

export async function savePitchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const podId = String(formData.get('podId') ?? '');
  const cycleId = String(formData.get('cycleId') ?? '');

  const keyResults = String(formData.get('keyResults') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [metric, target, actual] = line.split('|').map((part) => part.trim());
      return { metric: metric ?? '', target: target ?? '', actual: actual ?? '' };
    })
    .filter((row) => row.metric && row.target && row.actual);

  try {
    await apiRequest(`/api/pods/${podId}/pitch/${cycleId}`, {
      method: 'PUT',
      token: await token(),
      body: {
        previousSummary: String(formData.get('previousSummary') ?? '') || null,
        keyResults,
        nextPlan: String(formData.get('nextPlan') ?? '') || null,
        budgetContext: String(formData.get('budgetContext') ?? '') || null,
      },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not save the draft.') };
  }

  revalidatePath(`/pod/${podId}/pitch/${cycleId}`);
  return { success: 'Draft saved.' };
}

export async function submitPitchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const podId = String(formData.get('podId') ?? '');
  const cycleId = String(formData.get('cycleId') ?? '');

  try {
    await apiRequest(`/api/pods/${podId}/pitch/${cycleId}/submit`, {
      method: 'POST',
      token: await token(),
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not submit the pitch.') };
  }

  revalidatePath(`/pod/${podId}/pitch/${cycleId}`);
  return { success: 'Pitch submitted. It can no longer be edited.' };
}
