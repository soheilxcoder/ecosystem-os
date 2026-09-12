/**
 * Background jobs.
 *
 * v1 uses a simple in-process interval rather than a queue: there is exactly one
 * API process, and these jobs are idempotent sweeps. Swapping in a real queue
 * (BullMQ on Redis, per 13-TECHNICAL-ARCHITECTURE.md §1) only requires moving
 * these calls into workers — no module logic changes.
 */

import type { Database } from '../../db/client';
import { queryMany } from '../../db/client';
import { autoSubmitExpiredPitches, type PodServiceContext } from '../services/pods';
import { listReminders } from '../../db/repositories/calendar';

export interface SchedulerOptions {
  /** Sweep interval in milliseconds. */
  intervalMs?: number;
  logger?: (message: string) => void;
}

export interface Scheduler {
  stop(): void;
  /** Run every job once (used by tests and by the manual endpoint). */
  runOnce(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export function startScheduler(
  context: PodServiceContext,
  options: SchedulerOptions = {},
): Scheduler {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const log = options.logger ?? ((message: string) => console.log(`[jobs] ${message}`));

  async function runOnce(): Promise<void> {
    const orgIds = await listOrgIds(context.db);
    if (orgIds.length === 0) return;

    try {
      const submitted = await autoSubmitExpiredPitches(context, orgIds);
      if (submitted > 0) {
        log(`auto-submitted ${submitted} pitch(es) whose Day-85 deadline had passed`);
      }
    } catch (error) {
      // A failing sweep must never take the API down; it retries next tick.
      log(`auto-submit sweep failed: ${(error as Error).message}`);
    }

    await refreshMilestoneDates(context.db, log);
  }

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  // Do not keep the process alive purely for the scheduler.
  if (typeof timer.unref === 'function') timer.unref();

  void runOnce();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}

/** Recompute reminders when pause days move a milestone. */
async function refreshMilestoneDates(db: Database, log: (message: string) => void): Promise<void> {
  try {
    const rows = await queryMany<{ id: string }>(
      db,
      "SELECT id FROM sprint_cycle WHERE status = 'active'",
    );
    for (const cycle of rows) {
      await listReminders(db, cycle.id);
    }
  } catch (error) {
    log(`milestone refresh failed: ${(error as Error).message}`);
  }
}

async function listOrgIds(db: Database): Promise<string[]> {
  const rows = await queryMany<{ id: string }>(db, 'SELECT id FROM org');
  return rows.map((row) => row.id);
}
