/**
 * Background jobs.
 *
 * v1 uses a simple in-process interval rather than a queue: there is exactly one
 * API process, and these jobs are idempotent sweeps. Swapping in a real queue
 * (BullMQ on Redis, per 13-TECHNICAL-ARCHITECTURE.md §1) only requires moving
 * these calls into workers — no module logic changes.
 */

import type { Database } from '../../db/client';
import { queryMany, queryOne } from '../../db/client';
import { autoSubmitExpiredPitches, type PodServiceContext } from '../services/pods';
import {
  listDueReminders,
  listReminders,
  markReminderNotified,
} from '../../db/repositories/calendar';
import { listTrialsDue } from '../../db/repositories/governance';

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

    try {
      const announced = await emitDueMilestoneReminders(context);
      if (announced > 0) {
        log(`announced ${announced} milestone reminder(s) now due`);
      }
    } catch (error) {
      log(`milestone reminder sweep failed: ${(error as Error).message}`);
    }

    try {
      const trials = await emitDueEntryTrials(context, orgIds);
      if (trials > 0) {
        log(`flagged ${trials} entry-trial decision(s) now due`);
      }
    } catch (error) {
      log(`entry-trial sweep failed: ${(error as Error).message}`);
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

/**
 * Announce any milestone whose target date has arrived.
 *
 * The four day-window triggers from Module 11 (rotation window, pitch window,
 * auto-submit warning, review deadline) are not produced by a user action, so
 * this sweep is their emitter. Each due reminder becomes a
 * `calendar.milestone_reached` event on the shared bus — the Notifications
 * dispatcher routes it to the right people — and is then flagged `notified`,
 * which is what makes the sweep idempotent. The `results` milestone is skipped:
 * `budget.cycle_locked` already announces the results.
 */
async function emitDueMilestoneReminders(context: PodServiceContext): Promise<number> {
  const due = await listDueReminders(context.db, context.today());
  let announced = 0;
  for (const reminder of due) {
    if (reminder.milestoneType === 'results') {
      // Announced by the budget lock itself; just mark it handled.
      await markReminderNotified(context.db, reminder.id);
      continue;
    }
    await context.bus.publish({
      type: 'calendar.milestone_reached',
      aggregateType: 'sprint_cycle',
      aggregateId: reminder.cycleId,
      orgId: reminder.orgId,
      actorUserId: null,
      payload: {
        milestoneType: reminder.milestoneType,
        cycleId: reminder.cycleId,
        targetDate: reminder.targetDate,
      },
    });
    await markReminderNotified(context.db, reminder.id);
    announced += 1;
  }
  return announced;
}

/**
 * Announce any 90-day entry trial whose decision date has arrived.
 *
 * Trials have no `notified` flag, so idempotence is checked against the
 * notification table itself: a trial gets exactly one `entry_trial_decision_due`
 * item, and later ticks see it and move on. The event is published through the
 * bus like everything else, so the outbox records it and the dispatcher routes
 * it to the Deployment Hub and the pod.
 */
async function emitDueEntryTrials(context: PodServiceContext, orgIds: string[]): Promise<number> {
  let flagged = 0;
  for (const orgId of orgIds) {
    const trials = await listTrialsDue(context.db, orgId, context.today());
    for (const trial of trials) {
      const existing = await queryOne<{ n: string }>(
        context.db,
        `SELECT COUNT(*)::text AS n FROM notification
          WHERE trigger_type = 'entry_trial_decision_due' AND related_entity_id = $1`,
        [trial.id],
      );
      if (Number(existing?.n ?? 0) > 0) continue;

      await context.bus.publish({
        type: 'governance.entry_trial_due',
        aggregateType: 'entry_trial',
        aggregateId: trial.id,
        orgId,
        actorUserId: null,
        payload: { trialId: trial.id, podId: trial.podId, dueDate: trial.decisionDueDate },
      });
      flagged += 1;
    }
  }
  return flagged;
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
