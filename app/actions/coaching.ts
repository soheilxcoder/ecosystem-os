'use server';

/**
 * Coaching mutations (Module 07).
 *
 * Same shape as the budget actions: marshal input, translate errors, and let
 * `server/services/coaching.ts` hold the rules — the service is what the API
 * runs too, so the form on screen and the rule on the server cannot drift.
 *
 * The session-log action carries the two-button rule in data: `intent` is
 * `private` or `share`, and only `share` sends a `podVisibleSummary`. Sharing is
 * therefore a deliberate, distinguishable act all the way to the database
 * column — 07's whole point.
 */

import { revalidatePath } from 'next/cache';
import { ApiError, apiRequest } from '../../lib/api';
import { getSessionToken } from '../../lib/session';

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

export interface LogSessionActionState {
  error?: string;
  success?: string;
  sessionId?: string;
  sharedWithPod?: boolean;
}

/**
 * Logs a coaching session. The caller is always the signed-in coach; there is no
 * way to log on someone else's behalf. `intent` selects which of the two
 * buttons was pressed.
 */
export async function logCoachingSession(
  _previous: LogSessionActionState,
  formData: FormData,
): Promise<LogSessionActionState> {
  const podId = String(formData.get('podId') ?? '');
  const intent = String(formData.get('intent') ?? 'private');
  const sessionType = String(formData.get('sessionType') ?? 'check_in');
  const occurredAt = String(formData.get('occurredAt') ?? '');
  const privateNotes = String(formData.get('privateNotes') ?? '').trim();
  const podVisibleSummary = String(formData.get('podVisibleSummary') ?? '').trim();
  const requestId = String(formData.get('requestId') ?? '') || null;

  if (!podId) return { error: 'No pod selected for this session' };
  if (!occurredAt) return { error: 'The session needs a date' };
  if (!privateNotes) {
    return {
      error:
        'Private notes are required — they are the coach\u2019s working memory and the only record of the session.',
    };
  }
  if (intent === 'share' && !podVisibleSummary) {
    return {
      error:
        'To share with the pod, write the short pod-visible summary. Or press \u201cSave private\u201d to keep it to yourself.',
    };
  }

  try {
    const data = await apiRequest<any>('/api/coaching/sessions', {
      token: await token(),
      method: 'POST',
      body: {
        podId,
        occurredAt,
        sessionType,
        privateNotes,
        // The two buttons diverge here and nowhere else.
        podVisibleSummary: intent === 'share' ? podVisibleSummary : null,
        requestId,
      },
    });

    revalidatePath('/coaching/console');
    revalidatePath('/coaching/my-coach');

    return {
      success:
        intent === 'share'
          ? 'Session saved and the summary was shared with the pod.'
          : 'Session saved privately. The pod sees that it happened, not what was said.',
      sessionId: data.id,
      sharedWithPod: data.sharedWithPod,
    };
  } catch (error) {
    return { error: messageFor(error, 'The session could not be saved') };
  }
}

export interface RequestSessionActionState {
  error?: string;
  success?: string;
}

/** A pod asks its coach for a session. */
export async function requestCoachingSession(
  _previous: RequestSessionActionState,
  formData: FormData,
): Promise<RequestSessionActionState> {
  const podId = String(formData.get('podId') ?? '');
  const topic = String(formData.get('topic') ?? '').trim();
  const urgency = String(formData.get('urgency') ?? 'normal');
  const preferredTimes = String(formData.get('preferredTimes') ?? '').trim() || null;

  if (!podId) return { error: 'No pod selected' };
  if (!topic) return { error: 'Give the coach a sentence about what you want to work on' };

  try {
    await apiRequest<any>('/api/coaching/requests', {
      token: await token(),
      method: 'POST',
      body: { podId, topic, urgency, preferredTimes },
    });

    revalidatePath('/coaching/my-coach');
    revalidatePath('/coaching/console');

    return { success: 'Request sent — your coach will see it in their console.' };
  } catch (error) {
    return { error: messageFor(error, 'The request could not be sent') };
  }
}

export interface DeclineRequestActionState {
  error?: string;
  success?: string;
}

/** A coach declines a request. */
export async function declineCoachingRequest(
  _previous: DeclineRequestActionState,
  formData: FormData,
): Promise<DeclineRequestActionState> {
  const requestId = String(formData.get('requestId') ?? '');
  if (!requestId) return { error: 'No request to decline' };

  try {
    await apiRequest<any>(`/api/coaching/requests/${requestId}/decline`, {
      token: await token(),
      method: 'POST',
      body: {},
    });

    revalidatePath('/coaching/console');
    return { success: 'Request declined.' };
  } catch (error) {
    return { error: messageFor(error, 'The request could not be declined') };
  }
}

export interface CapacityActionState {
  error?: string;
  success?: string;
}

/** A coach states their own capacity — self-reported, never inferred. */
export async function setCoachCapacityAction(
  _previous: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const capacity = String(formData.get('capacity') ?? '');
  const schedulingUrl = String(formData.get('schedulingUrl') ?? '').trim() || null;

  if (capacity !== 'comfortable' && capacity !== 'stretched') {
    return { error: 'Choose either \u201ccomfortable\u201d or \u201cstretched\u201d' };
  }

  try {
    await apiRequest<any>('/api/coaching/profile', {
      token: await token(),
      method: 'PUT',
      body: { capacity, schedulingUrl },
    });

    revalidatePath('/coaching/console');
    return { success: 'Your capacity is saved.' };
  } catch (error) {
    return { error: messageFor(error, 'Your capacity could not be saved') };
  }
}
