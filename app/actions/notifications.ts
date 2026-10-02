'use server';

/**
 * Notification mutations (Module 11).
 *
 * Reading is done by the page; these are the only writes: mark one read, mark
 * all read, and change a delivery preference. There is deliberately no
 * "dismiss" or "mark done" action — a Needs-Action item leaves the tab only
 * when the underlying action is completed (the inbox re-checks entity state).
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

export interface NotificationActionState {
  error?: string;
  success?: string;
}

const DONE: NotificationActionState = {};

export async function markNotificationRead(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing notification id' };
  try {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'POST', token: await token() });
    revalidatePath('/notifications');
    return DONE;
  } catch (error) {
    return { error: messageFor(error, 'Could not mark that notification read') };
  }
}

/** Bound directly to a form's `action`; a quiet bulk-acknowledge. */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    await apiRequest('/api/notifications/read-all', { method: 'POST', token: await token() });
    revalidatePath('/notifications');
  } catch {
    // Non-fatal: the page simply still shows the unread items.
  }
}

export async function setNotificationPreference(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const urgency = String(formData.get('urgency') ?? '');
  const channel = String(formData.get('channel') ?? '');
  const enabled = formData.get('enabled') === 'true';

  try {
    await apiRequest('/api/notifications/preferences', {
      method: 'PUT',
      token: await token(),
      body: { urgency, channel, enabled },
    });
    revalidatePath('/notifications');
    return { success: 'Preference saved' };
  } catch (error) {
    return { error: messageFor(error, 'Could not save that preference') };
  }
}
