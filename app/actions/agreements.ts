'use server';

/**
 * CLOU agreement mutations (Module 04).
 *
 * These actions marshal input and translate errors — nothing more. Whether an
 * agreement may be proposed, countered or archived is decided by
 * `server/services/agreements.ts`, which is the same code the API runs, so the
 * guardrail rendered in the wizard and the rule enforced on the server cannot
 * drift apart.
 */

import { revalidatePath } from 'next/cache';
import { ApiError, apiRequest } from '../../lib/api';
import { getSessionToken } from '../../lib/session';
import type { CloudTerms } from '../../core/types';

export interface AgreementActionState {
  error?: string;
  success?: string;
  /** Set once a proposal has been sent, which advances the wizard to step 4. */
  agreementId?: string;
  counterpartyName?: string;
  /** Archive: true only once both pods have confirmed. */
  archived?: boolean;
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

/** Read the Step-2 term fields out of a submitted form. */
function termsFromForm(formData: FormData): Partial<CloudTerms> {
  const cadence = String(formData.get('cadence') ?? 'one_time');
  const frequencyRaw = String(formData.get('frequency') ?? '');
  const modelRaw = String(formData.get('pricingModel') ?? '');

  return {
    name: String(formData.get('name') ?? '').trim() || undefined,
    serviceDescription: String(formData.get('serviceDescription') ?? ''),
    direction: String(formData.get('direction') ?? 'a_to_b') as CloudTerms['direction'],
    cadence: cadence as CloudTerms['cadence'],
    frequency: cadence === 'recurring' && frequencyRaw ? (frequencyRaw as CloudTerms['frequency']) : null,
    pricingTerms: {
      model: modelRaw ? (modelRaw as NonNullable<CloudTerms['pricingTerms']['model']>) : null,
      amount: String(formData.get('pricingAmount') ?? ''),
      unit: String(formData.get('pricingUnit') ?? ''),
      notes: String(formData.get('pricingNotes') ?? ''),
    },
  };
}

export async function proposeAgreementAction(
  _previous: AgreementActionState,
  formData: FormData,
): Promise<AgreementActionState> {
  const podAId = String(formData.get('podAId') ?? '');
  const podBId = String(formData.get('podBId') ?? '');
  const counterpartyName = String(formData.get('counterpartyName') ?? 'the other pod');

  if (!podAId || !podBId) return { error: 'Choose both pods before sending a proposal.' };
  if (podAId === podBId) return { error: 'A CLOU is bilateral — pick a different counterparty pod.' };

  try {
    const agreement = await apiRequest<{ id: string }>('/api/agreements', {
      method: 'POST',
      token: await token(),
      body: { podAId, podBId, terms: termsFromForm(formData) },
    });
    revalidatePath('/agreements/active');
    revalidatePath('/agreements/proposals');
    return {
      success: `Proposal sent to ${counterpartyName}.`,
      agreementId: agreement.id,
      counterpartyName,
    };
  } catch (error) {
    return { error: messageFor(error, 'Could not send the proposal.') };
  }
}

export async function respondToAgreementAction(
  _previous: AgreementActionState,
  formData: FormData,
): Promise<AgreementActionState> {
  const agreementId = String(formData.get('agreementId') ?? '');
  const actorPodId = String(formData.get('actorPodId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!agreementId || !actorPodId) return { error: 'This response is missing its pod.' };
  if (decision !== 'accept' && decision !== 'decline' && decision !== 'counter') {
    return { error: 'Choose whether to accept, counter or decline.' };
  }
  if (decision === 'decline' && !note) {
    return { error: 'A decline needs a one-line reason — the proposing pod sees it.' };
  }

  try {
    await apiRequest(`/api/agreements/${agreementId}/respond`, {
      method: 'POST',
      token: await token(),
      body: {
        actorPodId,
        decision,
        note,
        ...(decision === 'counter' ? { terms: termsFromForm(formData) } : {}),
      },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not record your response.') };
  }

  revalidatePath(`/agreements/${agreementId}`);
  revalidatePath('/agreements/proposals');
  revalidatePath('/agreements/active');

  const message =
    decision === 'accept'
      ? 'Accepted — the agreement is now in force.'
      : decision === 'decline'
        ? 'Declined, with your reason shared with the proposing pod.'
        : 'Counter-proposal sent — it is their turn to respond.';
  return { success: message, agreementId };
}

export async function renegotiateAgreementAction(
  _previous: AgreementActionState,
  formData: FormData,
): Promise<AgreementActionState> {
  const agreementId = String(formData.get('agreementId') ?? '');
  const actorPodId = String(formData.get('actorPodId') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!agreementId || !actorPodId) return { error: 'This request is missing its pod.' };

  try {
    await apiRequest(`/api/agreements/${agreementId}/renegotiate`, {
      method: 'POST',
      token: await token(),
      body: { actorPodId, terms: termsFromForm(formData), note },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not open the renegotiation.') };
  }

  revalidatePath(`/agreements/${agreementId}`);
  revalidatePath('/agreements/active');
  revalidatePath('/agreements/proposals');
  return { success: 'Renegotiation request sent to the other pod.', agreementId };
}

export async function archiveAgreementAction(
  _previous: AgreementActionState,
  formData: FormData,
): Promise<AgreementActionState> {
  const agreementId = String(formData.get('agreementId') ?? '');
  const actorPodId = String(formData.get('actorPodId') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!agreementId || !actorPodId) return { error: 'This confirmation is missing its pod.' };

  try {
    const result = await apiRequest<{ archived: boolean }>(
      `/api/agreements/${agreementId}/archive`,
      {
        method: 'POST',
        token: await token(),
        body: { actorPodId, note },
      },
    );
    revalidatePath(`/agreements/${agreementId}`);
    revalidatePath('/agreements/active');
    return {
      agreementId,
      archived: result.archived,
      success: result.archived
        ? 'Both pods confirmed — the agreement is archived.'
        : 'Confirmation recorded. The other pod must confirm too.',
    };
  } catch (error) {
    return { error: messageFor(error, 'Could not record the confirmation.') };
  }
}

export async function renewAgreementAction(
  _previous: AgreementActionState,
  formData: FormData,
): Promise<AgreementActionState> {
  const agreementId = String(formData.get('agreementId') ?? '');
  const actorPodId = String(formData.get('actorPodId') ?? '');

  if (!agreementId || !actorPodId) return { error: 'This renewal is missing its pod.' };

  try {
    await apiRequest(`/api/agreements/${agreementId}/renew`, {
      method: 'POST',
      token: await token(),
      body: { actorPodId },
    });
  } catch (error) {
    return { error: messageFor(error, 'Could not renew the agreement.') };
  }

  revalidatePath(`/agreements/${agreementId}`);
  revalidatePath('/agreements/active');
  return { success: 'Agreement renewed.', agreementId };
}
