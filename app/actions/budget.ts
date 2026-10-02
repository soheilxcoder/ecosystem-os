'use server';

/**
 * Budget market mutations (Module 05).
 *
 * These actions marshal input and translate errors — the rules live in
 * `server/services/budget.ts`, which is the same code the API runs. That is what
 * keeps a guardrail rendered on screen and the rule enforced on the server from
 * drifting apart.
 *
 * The simulator is here rather than in a client component calling the API
 * directly because browser code never talks to the API in this architecture: the
 * token lives in an httpOnly cookie and the request is made server-side.
 */

import { revalidatePath } from 'next/cache';
import { ApiError, apiRequest } from '../../lib/api';
import { getSessionToken } from '../../lib/session';

export interface SimulateActionState {
  error?: string;
  result?: {
    simulatedUnitScore: number;
    arithmeticLine: string;
    currentFinalBudget: number;
    simulatedFinalBudget: number;
    delta: number;
    deltaPercent: number;
    assumption: string;
    disclaimer: string;
    totalPool: number;
    podCount: number;
    capApplied: boolean;
  };
}

export interface LockActionState {
  error?: string;
  success?: string;
  auditHash?: string;
  /** What still blocks the lock, when the refusal was for that reason. */
  blockers?: string[];
}

export interface ComputeActionState {
  error?: string;
  success?: string;
  cycleNumber?: number;
  unallocated?: number;
  blockers?: string[];
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

/**
 * Run a what-if. Stateless on the server too: the endpoint re-runs the real
 * allocation with one pod's scores replaced and returns, so there is no path
 * from the simulator to a stored number.
 */
export async function simulateBudget(
  _previous: SimulateActionState,
  formData: FormData,
): Promise<SimulateActionState> {
  const targetPodId = String(formData.get('targetPodId') ?? '');
  const financial = Number(formData.get('financial'));
  const peerReview = Number(formData.get('peer_review'));
  const strategic = Number(formData.get('strategic'));

  if (!targetPodId) return { error: 'Choose which pod to simulate' };

  for (const [label, value] of [
    ['financial', financial],
    ['peer review', peerReview],
    ['strategic', strategic],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `The ${label} score must be a number between 0 and 100` };
    }
  }

  try {
    const data = await apiRequest<any>('/api/budget/simulate', {
      token: await token(),
      method: 'POST',
      body: {
        targetPodId,
        components: {
          financial,
          peer_review: peerReview,
          strategic,
        },
      },
    });

    return {
      result: {
        simulatedUnitScore: data.simulatedUnitScore,
        arithmeticLine: data.arithmeticLine,
        currentFinalBudget: data.current.finalBudget,
        simulatedFinalBudget: data.simulated.finalBudget,
        delta: data.delta,
        deltaPercent: data.deltaPercent,
        assumption: data.assumption,
        disclaimer: data.disclaimer,
        totalPool: data.totalPool,
        podCount: data.podCount,
        capApplied: data.simulated.capApplied,
      },
    };
  } catch (error) {
    return { error: messageFor(error, 'The simulation could not be run') };
  }
}

/**
 * Lock the cycle. Architecture Hub only, and refused while any input is still an
 * estimate — the refusal carries the list of what is missing so the screen can
 * show it rather than only greying out a button.
 */
export async function lockBudgetCycle(
  _previous: LockActionState,
  formData: FormData,
): Promise<LockActionState> {
  const budgetCycleId = String(formData.get('budgetCycleId') ?? '');
  if (!budgetCycleId) return { error: 'No cycle to lock' };

  try {
    const data = await apiRequest<any>(`/api/budget/cycle/${budgetCycleId}/lock`, {
      token: await token(),
      method: 'POST',
      body: { force: formData.get('force') === 'on' },
    });

    revalidatePath('/budget/current-cycle');
    revalidatePath('/budget');
    revalidatePath('/budget/history');

    return {
      success: `Cycle ${data.cycleNumber} is locked. The numbers are now immutable.`,
      auditHash: data.auditHash ?? undefined,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'blockers_unresolved') {
      // The message already names what is missing; surface it as the list the
      // checklist renders.
      return { error: error.message, blockers: error.message.split('; ').slice(1) };
    }
    return { error: messageFor(error, 'The cycle could not be locked') };
  }
}

/** Set the pool and run the calculation. Architecture Hub only. */
export async function computeBudgetCycle(
  _previous: ComputeActionState,
  formData: FormData,
): Promise<ComputeActionState> {
  const cycleId = String(formData.get('cycleId') ?? '');
  const cycleNumber = Number(formData.get('cycleNumber'));
  const totalPool = Number(formData.get('totalPool'));

  if (!cycleId || !Number.isInteger(cycleNumber) || cycleNumber < 1) {
    return { error: 'A sprint cycle is required before a budget can be calculated' };
  }
  if (!Number.isFinite(totalPool) || totalPool < 0) {
    return { error: 'The total allocatable pool must be a non-negative number' };
  }

  try {
    const data = await apiRequest<any>('/api/budget/cycle/compute', {
      token: await token(),
      method: 'POST',
      body: { cycleId, cycleNumber, totalPool },
    });

    revalidatePath('/budget/current-cycle');
    revalidatePath('/budget');
    revalidatePath('/budget/history');

    return {
      success: `Cycle ${data.budgetCycle.cycleNumber} calculated across ${data.pods.length} pods.`,
      cycleNumber: data.budgetCycle.cycleNumber,
      unallocated: data.totals.unallocated,
      blockers: data.blockers.map((blocker: any) => blocker.detail),
    };
  } catch (error) {
    return { error: messageFor(error, 'The calculation could not be run') };
  }
}
