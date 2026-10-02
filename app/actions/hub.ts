'use server';

/**
 * Strategic Hub Console mutations (Module 09).
 *
 * Every write the four hubs own, in one audited surface: launching pods (the
 * wizard's Step 5 — the system's only pod-creation path), generating and
 * publishing aggregated investor reports, the external contact log, and the
 * pilot program lifecycle. Nothing here can touch a pod's score, budget or
 * governance verdict — those flows stay in their own modules.
 */

import { redirect } from 'next/navigation';
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

export interface HubActionState {
  error?: string;
  success?: string;
}

// ---------------------------------------------------------------------------
// Deployment wizard — Step 5 launch
// ---------------------------------------------------------------------------

export async function launchPod(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const name = String(formData.get('name') ?? '').trim();
  let holdingId = String(formData.get('holdingId') ?? '');
  const newHoldingName = String(formData.get('newHoldingName') ?? '').trim();

  // Wizard Step 1 option "new holding from zero": create it first, then launch
  // the pod inside it — still one audited wizard flow.
  if (!holdingId && newHoldingName) {
    try {
      const holding = await apiRequest<{ id: string }>('/api/hub/deployment/holdings', {
        method: 'POST',
        token: await token(),
        body: { name: newHoldingName },
      });
      holdingId = holding.id;
    } catch (error) {
      return { error: messageFor(error, 'The new holding could not be created') };
    }
  }
  const categoryTag = String(formData.get('categoryTag') ?? '').trim();
  const memberEmails = String(formData.get('memberEmails') ?? '')
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const leadEmail = String(formData.get('leadEmail') ?? '').trim().toLowerCase() || null;
  const coachUserId = String(formData.get('coachUserId') ?? '').trim() || null;
  const dataSourceSystem = String(formData.get('dataSourceSystem') ?? '').trim() || null;
  const trialStartDate = String(formData.get('trialStartDate') ?? '').trim() || undefined;
  const pilotId = String(formData.get('pilotId') ?? '').trim() || null;

  let criteria: Array<{ label: string; met: boolean | null }> = [];
  try {
    const parsed = JSON.parse(String(formData.get('criteriaJson') ?? '[]')) as Array<{
      label: unknown;
      met: unknown;
    }>;
    criteria = parsed
      .filter((item) => typeof item.label === 'string' && item.label.trim() !== '')
      .slice(0, 20)
      .map((item) => ({
        label: String(item.label).trim(),
        met: item.met === true ? true : null,
      }));
  } catch {
    criteria = [];
  }

  if (!name) return { error: 'The new pod needs a name.' };
  if (!holdingId) return { error: 'Choose the holding the pod belongs to.' };
  if (memberEmails.length === 0) return { error: 'List at least one initial member email.' };

  try {
    await apiRequest('/api/hub/deployment/pods', {
      method: 'POST',
      token: await token(),
      body: {
        name,
        holdingId,
        categoryTag: categoryTag || null,
        memberEmails,
        leadEmail,
        coachUserId,
        dataSourceSystem,
        trialStartDate,
        criteria,
        pilotId,
      },
    });
  } catch (error) {
    return { error: messageFor(error, 'The pod could not be launched') };
  }

  revalidatePath('/hub/deployment');
  revalidatePath('/hub/pilots', 'layout');
  revalidatePath('/dashboard');
  redirect('/hub/deployment');
}

// ---------------------------------------------------------------------------
// Rule versioning (Architecture Hub)
// ---------------------------------------------------------------------------

export async function proposeRuleChangeAction(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const ruleName = String(formData.get('ruleName') ?? '');
  const newValueRaw = String(formData.get('newValue') ?? '').trim();
  const justification = String(formData.get('justification') ?? '').trim();
  const effectiveCycleNumber = Number(formData.get('effectiveCycleNumber') ?? 0);

  if (!ruleName) return { error: 'Pick the rule to change.' };
  if (newValueRaw === '') return { error: 'State the new value.' };
  if (justification.length < 10) return { error: 'A rule change needs a real justification.' };

  // Parse the value as JSON when it is one (objects, numbers, booleans);
  // otherwise keep it as the string the hub typed.
  let newValue: unknown = newValueRaw;
  try {
    newValue = JSON.parse(newValueRaw) as unknown;
  } catch {
    newValue = newValueRaw;
  }

  try {
    await apiRequest('/api/hub/rules/propose', {
      method: 'POST',
      token: await token(),
      body: { ruleName, newValue, justification, effectiveCycleNumber },
    });
  } catch (error) {
    return { error: messageFor(error, 'The rule change could not be proposed') };
  }

  revalidatePath('/hub/architecture');
  return { success: 'Proposed — rule changes only ever take effect from the next cycle.' };
}

// ---------------------------------------------------------------------------
// Investor reports
// ---------------------------------------------------------------------------

export async function generateReport(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const dateFrom = String(formData.get('dateFrom') ?? '');
  const dateTo = String(formData.get('dateTo') ?? '');
  const holdingIds = formData.getAll('holdingId').map(String).filter(Boolean);
  const podIds = formData.getAll('podId').map(String).filter(Boolean);

  if (!dateFrom || !dateTo) return { error: 'Pick both ends of the report window.' };

  try {
    await apiRequest('/api/hub/strategic/reports', {
      method: 'POST',
      token: await token(),
      body: { dateFrom, dateTo, holdingIds, podIds },
    });
  } catch (error) {
    return { error: messageFor(error, 'The report could not be generated') };
  }

  revalidatePath('/hub/strategic-interactions');
  return { success: 'Report generated as an unpublished draft.' };
}

export async function publishReportAction(reportId: string): Promise<void> {
  await apiRequest(`/api/hub/strategic/reports/${reportId}/publish`, {
    method: 'POST',
    token: await token(),
  });
  revalidatePath('/hub/strategic-interactions');
  revalidatePath('/investor-portal');
}

// ---------------------------------------------------------------------------
// Correction records (13 §7) — the one path that may fix a locked number
// ---------------------------------------------------------------------------

export interface CorrectionActionState {
  error?: string;
  success?: string;
}

export async function proposeCorrectionAction(
  _previous: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '').trim();
  const fieldCorrected = String(formData.get('fieldCorrected') ?? '').trim();
  const correctedValueRaw = String(formData.get('correctedValue') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (!entityId) return { error: 'The record id to correct is required.' };
  if (!fieldCorrected) return { error: 'State which field is being corrected.' };
  if (correctedValueRaw === '') return { error: 'State the corrected value.' };
  if (reason.length < 10) return { error: 'A correction needs a real reason (10+ characters).' };

  // Parse numbers/booleans/objects as JSON, otherwise keep the string.
  let correctedValue: unknown = correctedValueRaw;
  try {
    correctedValue = JSON.parse(correctedValueRaw) as unknown;
  } catch {
    correctedValue = correctedValueRaw;
  }

  try {
    await apiRequest('/api/hub/corrections', {
      method: 'POST',
      token: await token(),
      body: { entityType, entityId, fieldCorrected, correctedValue, reason },
    });
  } catch (error) {
    return { error: messageFor(error, 'The correction could not be proposed') };
  }

  revalidatePath('/hub/architecture');
  return {
    success:
      'Correction proposed. It takes effect only once a second Architecture Hub member approves it.',
  };
}

export async function approveCorrectionAction(correctionId: string): Promise<void> {
  await apiRequest(`/api/hub/corrections/${correctionId}/approve`, {
    method: 'POST',
    token: await token(),
  });
  revalidatePath('/hub/architecture');
}

export async function rejectCorrectionAction(correctionId: string): Promise<void> {
  await apiRequest(`/api/hub/corrections/${correctionId}/reject`, {
    method: 'POST',
    token: await token(),
  });
  revalidatePath('/hub/architecture');
}

// ---------------------------------------------------------------------------
// External contact log
// ---------------------------------------------------------------------------

export async function addContact(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const name = String(formData.get('name') ?? '').trim();
  const relationshipType = String(formData.get('relationshipType') ?? 'partner');
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!name) return { error: 'The contact needs a name.' };

  try {
    await apiRequest('/api/hub/strategic/contacts', {
      method: 'POST',
      token: await token(),
      body: { name, relationshipType, notes },
    });
  } catch (error) {
    return { error: messageFor(error, 'The contact could not be added') };
  }

  revalidatePath('/hub/strategic-interactions');
  return { success: 'Contact added.' };
}

export async function logInteractionAction(contactId: string, formData: FormData): Promise<void> {
  const notes = String(formData.get('notes') ?? '').trim() || null;
  await apiRequest(`/api/hub/strategic/contacts/${contactId}/interaction`, {
    method: 'POST',
    token: await token(),
    body: { notes },
  });
  revalidatePath('/hub/strategic-interactions');
}

// ---------------------------------------------------------------------------
// Pilot programs
// ---------------------------------------------------------------------------

export async function createPilotAction(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const name = String(formData.get('name') ?? '').trim();
  const holdingId = String(formData.get('holdingId') ?? '').trim() || null;

  if (!name) return { error: 'The pilot needs a name.' };

  try {
    await apiRequest('/api/hub/pilots', {
      method: 'POST',
      token: await token(),
      body: { name, holdingId },
    });
  } catch (error) {
    return { error: messageFor(error, 'The pilot could not be created') };
  }

  revalidatePath('/hub/pilots');
  return { success: 'Pilot created — open it to plan the phases.' };
}

export async function updatePilotPhaseAction(pilotId: string, formData: FormData): Promise<void> {
  const currentPhase = String(formData.get('currentPhase') ?? '').trim() || undefined;
  const phase = String(formData.get('phase') ?? '').trim() || undefined;
  const status = String(formData.get('status') ?? '').trim() || undefined;
  const owner = formData.get('owner') === null ? undefined : String(formData.get('owner') ?? '').trim();

  try {
    await apiRequest(`/api/hub/pilots/${pilotId}/phase-update`, {
      method: 'POST',
      token: await token(),
      body: { currentPhase, phase, status, owner },
    });
  } catch {
    // A finished pilot rejects further phase edits; the page shows the locked
    // decision, so a silent no-op here is truthful enough for a save button.
    return;
  }
  revalidatePath(`/hub/pilots/${pilotId}`);
  revalidatePath('/hub/pilots');
}

export async function updatePilotCriteriaAction(pilotId: string, formData: FormData): Promise<void> {
  const numberOrNull = (key: string): number | null => {
    const raw = String(formData.get(key) ?? '').trim();
    if (raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  await apiRequest(`/api/hub/pilots/${pilotId}/criteria`, {
    method: 'POST',
    token: await token(),
    body: {
      decisionTimeBaseline: numberOrNull('decisionTimeBaseline'),
      decisionTimeCurrent: numberOrNull('decisionTimeCurrent'),
      satisfactionScore: numberOrNull('satisfactionScore'),
      profitBudgetRatioBaseline: numberOrNull('profitBudgetRatioBaseline'),
      profitBudgetRatioCurrent: numberOrNull('profitBudgetRatioCurrent'),
    },
  });
  revalidatePath(`/hub/pilots/${pilotId}`);
}

export async function recordDecisionAction(
  _previous: HubActionState,
  formData: FormData,
): Promise<HubActionState> {
  const pilotId = String(formData.get('pilotId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const lessonsLearned = String(formData.get('lessonsLearned') ?? '').trim() || null;

  try {
    await apiRequest(`/api/hub/pilots/${pilotId}/decision`, {
      method: 'POST',
      token: await token(),
      body: { decision, lessonsLearned },
    });
  } catch (error) {
    return { error: messageFor(error, 'The decision could not be recorded') };
  }

  revalidatePath(`/hub/pilots/${pilotId}`);
  revalidatePath('/hub/pilots');
  return {
    success:
      decision === 'expand'
        ? 'Expansion recorded — open the pre-filled wizard to launch the next unit.'
        : 'Decision recorded.',
  };
}
