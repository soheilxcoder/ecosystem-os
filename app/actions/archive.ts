'use server';

/**
 * Archive mutations (Module 10).
 *
 * The archive is written by the indexer for event-derived records; the only
 * thing a person authors directly is a lesson learned. This action is that one
 * write path.
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

export interface LessonActionState {
  error?: string;
  success?: string;
}

export async function createLesson(
  _previous: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  const whatHappened = String(formData.get('whatHappened') ?? '').trim();
  const whatWedDoDifferently = String(formData.get('whatWedDoDifferently') ?? '').trim();
  const tagsRaw = String(formData.get('tags') ?? '').trim();

  if (whatHappened.length < 10) {
    return { error: 'Describe what happened in a sentence or two.' };
  }

  const tags = tagsRaw
    ? tagsRaw
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  try {
    await apiRequest('/api/archive/lessons', {
      method: 'POST',
      token: await token(),
      body: {
        whatHappened,
        whatWedDoDifferently: whatWedDoDifferently || null,
        tags,
      },
    });
    revalidatePath('/archive/lessons');
    revalidatePath('/archive/decisions');
    return { success: 'Lesson recorded and indexed.' };
  } catch (error) {
    return { error: messageFor(error, 'Could not record that lesson') };
  }
}
