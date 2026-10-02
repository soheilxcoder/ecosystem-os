/**
 * Coaching service (Module 07).
 *
 * Three rules from the spec drive the shape of this file:
 *
 *  1. **Private notes have no read path that can leak them.** Every session
 *     read takes an explicit `SessionViewer`, and the viewer decides which
 *     repository function runs — `listCoachSessions` (full rows) or
 *     `listPodVisibleSessions` (the `coaching_session_pod_visible` view, whose
 *     column list does not contain `private_notes`). There is no flag to flip
 *     and no post-filter to forget: a pod-scoped viewer physically cannot fetch
 *     the column. 07 requires this "at the query layer, not just hidden in the
 *     UI", and it must hold against Company X's *other* hubs too, so only the
 *     Coaching Hub and the assigned coach get the full shape.
 *
 *  2. **The health signal is derived, explained and stored.** `computePodHealth`
 *     gathers the three inputs 07 names — at-risk check-ins (module 3), Unit
 *     Score trend (module 5), peer-review sentiment (module 8) — hands them to
 *     the pure formula in `core/health.ts`, and stores the result together with
 *     the factors and the cycle each input came from. Nothing here invents a
 *     number the formula did not produce.
 *
 *  3. **Suggestions never act.** The red-streak banner, the ratio warning and
 *     the reassignment countdown all *report*. None of them opens an
 *     accountability case, blocks an assignment or moves a pod. 07 is explicit
 *     that the flag is "a suggestion surfaced to the coach, never an automatic
 *     action", and the ratio guidance "should warn but not block".
 */

import type { Database } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type {
  CoachAssignment,
  CoachCapacity,
  CoachProfile,
  CoachingSession,
  CoachingSessionRequest,
  CoachingSessionType,
  PodHealthSignal,
  PodVisibleSession,
  SessionRequestUrgency,
  UUID,
} from '../../core/types';
import {
  DEFAULT_RED_FLAG_STREAK,
  REASSIGNMENT_REVIEW,
  SUGGESTED_POD_RANGE,
  flagBanner,
  podHealthSignal,
  ratioWarning,
  reassignmentState,
  type HealthColor,
  type HealthSignalProvenance,
} from '../../core/health';
import { peerReviewScore } from '../../core/budget';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { getCycleById, getEffectiveConfig, listCycles } from '../../db/repositories/calendar';
import { getPod, listCheckins, listPods } from '../../db/repositories/pods';
import { listBudgetResultsForPod, submittedReviewScoresByPod } from '../../db/repositories/budget';
import { findUserById } from '../../db/repositories/users';
import { recordAudit } from '../../db/repositories/audit';
import {
  createAssignment,
  createSession,
  createSessionRequest,
  endAssignment,
  getActiveAssignmentForPod,
  getCoachProfile,
  getCoachSession,
  getHealthSignal,
  getPodVisibleSession,
  listActiveAssignments,
  listActiveAssignmentsForCoach,
  listAllSessionsForPod,
  listAssignmentsForPod,
  listCoachProfiles,
  listCoachSessions,
  listHealthSignalsForPod,
  listOpenRequestsForCoach,
  listPodVisibleSessions,
  listSessionRequestsForPod,
  setSessionRequestStatus,
  updateSession,
  upsertCoachProfile,
  upsertHealthSignal,
} from '../../db/repositories/coaching';

export interface CoachingServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

// ---------------------------------------------------------------------------
// Who is asking — the access-control decision, made once
// ---------------------------------------------------------------------------

/**
 * The caller's relationship to a pod's coaching record.
 *
 * This is the single place that decides whether private notes exist for a given
 * read. Routes resolve it from a permission check and pass it down; no handler
 * below re-derives it, so there is exactly one decision to get right.
 *
 * `coaching_hub` is deliberately its own case rather than a flag on `coach`:
 * the Hub sees every pod's sessions, while a coach sees only their own
 * assignments, and collapsing the two would let one satisfy the other.
 */
export type SessionViewer =
  | { kind: 'coach'; coachUserId: UUID }
  | { kind: 'coaching_hub' }
  | { kind: 'pod'; podId: UUID };

/** True when this viewer may read `private_notes`. */
export function maySeePrivateNotes(viewer: SessionViewer): boolean {
  return viewer.kind === 'coach' || viewer.kind === 'coaching_hub';
}

// ---------------------------------------------------------------------------
// Health signals
// ---------------------------------------------------------------------------

/**
 * Peer-review sentiment is the one input that lags.
 *
 * Reviews are submitted on Days 86–88 (module 6), so for most of a cycle the
 * current cycle has none yet. Walking back to the most recent cycle that does
 * is the honest reading of 07's "peer-review sentiment" — the alternative,
 * treating an in-progress cycle as sentiment-free, would drop every pod to the
 * assumed default for eleven weeks out of thirteen.
 *
 * Returns the score and the cycle it came from, so the signal can name its
 * source rather than imply one.
 */
async function resolveReviewSentiment(
  context: CoachingServiceContext,
  orgId: UUID,
  podId: UUID,
  cycleId: UUID,
): Promise<{ sentiment: number | null; cycleNumber: number | null }> {
  const { db } = context;
  const cycle = await getCycleById(db, cycleId);
  if (!cycle) return { sentiment: null, cycleNumber: null };

  // Newest first; the current cycle is tried before any earlier one.
  const history = await listCycles(db, { orgId, holdingId: cycle.holdingId }, 6);
  const ordered = [...history].sort((a, b) => b.cycleNumber - a.cycleNumber);
  const startAt = ordered.findIndex((row) => row.id === cycleId);
  const candidates = startAt >= 0 ? ordered.slice(startAt) : ordered;

  for (const candidate of candidates) {
    const byPod = await submittedReviewScoresByPod(db, candidate.id);
    const match = byPod.find((entry) => entry.podId === podId);
    if (!match) continue;
    const sentiment = peerReviewScore(match.scores);
    if (sentiment !== null) {
      return { sentiment, cycleNumber: candidate.cycleNumber };
    }
  }
  return { sentiment: null, cycleNumber: null };
}

/**
 * The Unit Score trend: latest minus previous.
 *
 * Read from stored budget results rather than recomputed, so the trend the
 * coach sees is the trend the budget module actually announced. Cycle numbers
 * come back with it for provenance — a trend of "+4" means nothing until you
 * know between which two cycles.
 *
 * `asOfCycleNumber` bounds the window. Without it, recomputing an *older*
 * cycle's signal would describe it with a trend that had not happened yet —
 * the two newest results overall rather than the two newest as of then. A
 * historical signal has to be reproducible from the data that existed at the
 * time, or "why was this red in cycle 1?" gets a different answer today than
 * it did in cycle 1.
 */
async function resolveScoreTrend(
  context: CoachingServiceContext,
  podId: UUID,
  asOfCycleNumber: number | null,
): Promise<{ trend: number | null; cycleNumbers: [number, number] | null }> {
  const results = await listBudgetResultsForPod(context.db, podId, 12);
  // Newest first from the repository; the trend wants latest minus previous.
  const ordered = [...results]
    .filter((row) => asOfCycleNumber === null || row.cycleNumber <= asOfCycleNumber)
    .sort((a, b) => b.cycleNumber - a.cycleNumber);
  if (ordered.length < 2) return { trend: null, cycleNumbers: null };
  const [latest, previous] = ordered as [typeof ordered[number], typeof ordered[number]];
  return {
    trend: Number((latest.unitScore - previous.unitScore).toFixed(2)),
    cycleNumbers: [latest.cycleNumber, previous.cycleNumber],
  };
}

export interface ComputedHealth {
  signal: PodHealthSignal;
  /** True when this computation moved the pod into the red from another colour. */
  becameRed: boolean;
  previousColor: HealthColor | null;
}

/**
 * Recomputes and stores one pod's health signal for one cycle.
 *
 * `07` says the signal is recomputed on a schedule and on demand when inputs
 * change. This is the on-demand half; it is idempotent, so a nightly job and a
 * coach refreshing the console both call the same function and converge on the
 * same stored row.
 */
export async function computePodHealth(
  context: CoachingServiceContext,
  input: { orgId: UUID; podId: UUID; cycleId: UUID },
): Promise<ComputedHealth> {
  const { db } = context;

  const pod = await getPod(db, input.podId);
  if (!pod) throw notFound(`Pod ${input.podId} not found`);

  const before = await getHealthSignal(db, input.podId, input.cycleId);

  // Resolved first: the cycle number bounds every input below, so a signal for
  // an older cycle is rebuilt from the data as it stood then, not as it is now.
  const cycle = await getCycleById(db, input.cycleId);
  if (!cycle) throw notFound(`Sprint cycle ${input.cycleId} not found`);

  // Input 1 — module 3: this cycle's weekly check-ins and their at-risk flags.
  const checkins = await listCheckins(db, input.podId, input.cycleId, 100);
  const atRiskCheckins = checkins.filter((row) => row.atRiskFlag).length;

  // Input 2 — module 5: movement in the announced Unit Score, up to this cycle.
  const { trend, cycleNumbers } = await resolveScoreTrend(
    context,
    input.podId,
    cycle.cycleNumber,
  );

  // Input 3 — module 8: the most recent cycle with submitted reviews.
  const { sentiment, cycleNumber: sentimentCycleNumber } = await resolveReviewSentiment(
    context,
    input.orgId,
    input.podId,
    input.cycleId,
  );

  const provenance: HealthSignalProvenance = {
    checkinCycleNumber: cycle.cycleNumber,
    sentimentCycleNumber,
    scoreCycleNumbers: cycleNumbers,
  };

  const computed = podHealthSignal({
    atRiskCheckins,
    checkins: checkins.length,
    scoreTrend: trend,
    reviewSentiment: sentiment,
    provenance,
  });

  const stored = await upsertHealthSignal(db, {
    orgId: input.orgId,
    podId: input.podId,
    cycleId: input.cycleId,
    signal: computed,
  });

  const previousColor = before?.signalColor ?? null;
  const becameRed = computed.color === 'red' && previousColor !== 'red';

  if (becameRed) {
    // Canonical event list (17-MASTER-ANALYSIS §6.2): "pod health turned red" →
    // the assigned coach, Action required. Published only on the *transition*,
    // so a pod that stays red does not re-notify every time anyone looks.
    await context.bus.publish({
      type: 'coaching.pod_health_red',
      aggregateType: 'pod',
      aggregateId: input.podId,
      orgId: input.orgId,
      payload: {
        podId: input.podId,
        cycleId: input.cycleId,
        cycleNumber: cycle.cycleNumber,
        score: computed.score,
        previousColor,
        factors: computed.factors,
        provenance,
      },
    });
  }

  return { signal: stored, becameRed, previousColor };
}

/**
 * Recomputes every pod's signal for a cycle.
 *
 * This is what the nightly job and the console's refresh both call. Failures are
 * collected per pod rather than thrown, so one pod with no budget history cannot
 * stop the other four from being scored — but they are reported, because a
 * signal that silently did not update is worse than one that says it failed.
 */
export async function refreshHealthSignals(
  context: CoachingServiceContext,
  input: { orgId: UUID; cycleId: UUID; podIds?: UUID[] },
): Promise<{ refreshed: ComputedHealth[]; failed: Array<{ podId: UUID; message: string }> }> {
  const pods = input.podIds
    ? await Promise.all(input.podIds.map((podId) => getPod(context.db, podId)))
    : await listPods(context.db, input.orgId);

  const refreshed: ComputedHealth[] = [];
  const failed: Array<{ podId: UUID; message: string }> = [];

  for (const pod of pods) {
    if (!pod) continue;
    try {
      refreshed.push(
        await computePodHealth(context, {
          orgId: input.orgId,
          podId: pod.id,
          cycleId: input.cycleId,
        }),
      );
    } catch (error) {
      failed.push({
        podId: pod.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { refreshed, failed };
}

/** One pod's stored signal, computing it if the cycle has none yet. */
export async function getPodHealth(
  context: CoachingServiceContext,
  input: { orgId: UUID; podId: UUID; cycleId: UUID },
): Promise<PodHealthSignal> {
  const existing = await getHealthSignal(context.db, input.podId, input.cycleId);
  if (existing) return existing;
  const computed = await computePodHealth(context, input);
  return computed.signal;
}

/**
 * A pod's signal history, oldest first, for the trend strip.
 *
 * Read from stored rows only — this never recomputes, so a history chart shows
 * what was actually reported at the time rather than a retro-fitted version of
 * it. That distinction matters when a coach is asked why they acted on a red.
 */
export async function getPodHealthHistory(
  context: CoachingServiceContext,
  podId: UUID,
  limit = 12,
): Promise<PodHealthSignal[]> {
  return listHealthSignalsForPod(context.db, podId, limit);
}

/**
 * The org's red-streak threshold, from `org_governance_config`.
 *
 * 07 calls this org-configurable with "2+ consecutive cycles" as the example,
 * so it is read rather than hardcoded — `core/health.ts` only supplies the
 * default for when no config row exists yet.
 */
export async function redFlagThreshold(
  context: CoachingServiceContext,
  orgId: UUID,
): Promise<number> {
  const row = await (context.db.query<{ health_red_flag_streak: number | string }>(
    'SELECT health_red_flag_streak FROM org_governance_config WHERE org_id = $1',
    [orgId],
  ));
  const value = row.rows[0]?.health_red_flag_streak;
  const parsed = value === undefined || value === null ? null : Number(value);
  return parsed !== null && Number.isFinite(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_RED_FLAG_STREAK;
}

// ---------------------------------------------------------------------------
// Reassignment timing
// ---------------------------------------------------------------------------

export interface ReassignmentView {
  /** How many cycles this coach has held this pod, counting the start as 1. */
  cyclesWithPodSet: number;
  cyclesUntilReview: number;
  /** 'ok' before the soft mark, 'due' at 2, 'overdue' at 3+. */
  urgency: 'ok' | 'due' | 'overdue';
  startCycleNumber: number | null;
  /** The cycle number at which review falls due. */
  reviewAtCycleNumber: number | null;
  /**
   * Approximate date of the review, or null when it cannot be estimated.
   *
   * Always approximate, and labelled so in the UI: 07 says to show "rotates to a
   * new coach around [date range]" rather than a hard-committed date, because
   * the actual move depends on the Coaching Hub's scheduling.
   */
  reviewAround: ISODate | null;
  reviewAroundIsEstimate: boolean;
}

/**
 * Where an assignment stands against the 2–3 cycle review rule.
 *
 * Counts cycles from the assignment's own start cycle, so the countdown agrees
 * with the calendar module instead of with a date difference computed here. When
 * the review cycle does not exist yet, its date is estimated from the configured
 * cycle length and flagged as an estimate — never presented as a commitment.
 */
export async function describeReassignment(
  context: CoachingServiceContext,
  assignment: CoachAssignment,
): Promise<ReassignmentView> {
  const { db } = context;
  const startCycle = await getCycleById(db, assignment.startCycleId);
  const startNumber = startCycle?.cycleNumber ?? null;

  // Without a start cycle number there is nothing to count from. Reporting 1
  // cycle and a null date is honest; guessing would not be.
  if (startNumber === null || !startCycle) {
    return {
      cyclesWithPodSet: 1,
      cyclesUntilReview: REASSIGNMENT_REVIEW.soft - 1,
      urgency: 'ok',
      startCycleNumber: null,
      reviewAtCycleNumber: null,
      reviewAround: null,
      reviewAroundIsEstimate: false,
    };
  }

  const current = await getCycleById(db, assignment.startCycleId);
  const activeCycle = await findActiveCycleForPod(context, assignment.podId);
  const currentNumber = activeCycle?.cycleNumber ?? current?.cycleNumber ?? startNumber;
  const cyclesWithPodSet = Math.max(1, currentNumber - startNumber + 1);
  const state = reassignmentState(cyclesWithPodSet, REASSIGNMENT_REVIEW);

  const reviewAtCycleNumber = startNumber + REASSIGNMENT_REVIEW.soft;
  const reviewCycle = await findCycleByNumber(context, startCycle, reviewAtCycleNumber);

  let reviewAround: ISODate | null = reviewCycle?.startDate ?? null;
  let reviewAroundIsEstimate = false;

  if (!reviewAround) {
    // The review cycle has not been created yet. Estimate from the configured
    // cycle length and say so — this is the "approximate window" 07 asks for.
    const config = await getEffectiveConfig(
      db,
      { orgId: startCycle.orgId, holdingId: startCycle.holdingId },
      reviewAtCycleNumber,
    );
    if (config) {
      const cyclesAhead = reviewAtCycleNumber - startNumber;
      reviewAround = addDaysISO(startCycle.startDate, cyclesAhead * config.cycleLengthDays);
      reviewAroundIsEstimate = true;
    }
  }

  return {
    ...state,
    startCycleNumber: startNumber,
    reviewAtCycleNumber,
    reviewAround,
    reviewAroundIsEstimate,
  };
}

async function findActiveCycleForPod(
  context: CoachingServiceContext,
  podId: UUID,
) {
  const pod = await getPod(context.db, podId);
  if (!pod) return null;
  const cycles = await listCycles(context.db, { orgId: pod.orgId, holdingId: pod.holdingId }, 12);
  return cycles.find((row) => row.status === 'active') ?? cycles[0] ?? null;
}

async function findCycleByNumber(
  context: CoachingServiceContext,
  reference: { orgId: UUID; holdingId: UUID | null },
  cycleNumber: number,
) {
  const cycles = await listCycles(context.db, reference, 24);
  return cycles.find((row) => row.cycleNumber === cycleNumber) ?? null;
}

/** Date arithmetic on ISO strings, kept local so no clock is read implicitly. */
function addDaysISO(date: ISODate, days: number): ISODate {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// My coach — the pod member's view
// ---------------------------------------------------------------------------

export interface MyCoachSessionRow extends PodVisibleSession {
  /** The coach's name, so the history reads as a person and not an id. */
  coachName: string | null;
}

export interface MyCoachView {
  podId: UUID;
  podName: string;
  coach: {
    userId: UUID;
    fullName: string;
    email: string;
    schedulingUrl: string | null;
    /** How long this coach has held the pod, in whole days. */
    coachingSinceDays: number | null;
    coachingSince: ISODate | null;
  } | null;
  assignmentId: UUID | null;
  reassignment: ReassignmentView | null;
  /** Pod-visible sessions only — see `SessionViewer`. */
  sessions: MyCoachSessionRow[];
  requests: CoachingSessionRequest[];
  /** The pod's current signal, if one has been computed. */
  health: PodHealthSignal | null;
}

/**
 * Everything `/coaching/my-coach` renders.
 *
 * Sessions come back through the pod-visible view, so this function cannot
 * return private notes even by accident: the type it builds
 * (`MyCoachSessionRow extends PodVisibleSession`) has no such field.
 */
export async function getMyCoach(
  context: CoachingServiceContext,
  input: { orgId: UUID; podId: UUID },
): Promise<MyCoachView> {
  const { db, today } = context;

  const pod = await getPod(db, input.podId);
  if (!pod) throw notFound(`Pod ${input.podId} not found`);

  const assignment = await getActiveAssignmentForPod(db, input.podId);
  const coachUser = assignment ? await findUserById(db, assignment.coachUserId) : null;
  const profile = assignment ? await getCoachProfile(db, assignment.coachUserId) : null;

  const startCycle = assignment ? await getCycleById(db, assignment.startCycleId) : null;
  const coachingSince = startCycle?.startDate ?? today().slice(0, 10);

  const sessions = await listPodVisibleSessions(db, input.podId, 50);
  const sessionsWithNames: MyCoachSessionRow[] = [];
  for (const session of sessions) {
    const coach = await findUserById(db, session.coachUserId);
    sessionsWithNames.push({ ...session, coachName: coach?.fullName ?? null });
  }

  const requests = await listSessionRequestsForPod(db, input.podId, 20);
  const health = assignment
    ? await getHealthSignal(db, input.podId, startCycle?.id ?? '')
    : null;

  const activeCycle = await findActiveCycleForPod(context, input.podId);
  const currentHealth = activeCycle
    ? await getHealthSignal(db, input.podId, activeCycle.id)
    : null;

  return {
    podId: input.podId,
    podName: pod.name,
    coach:
      assignment && coachUser
        ? {
            userId: assignment.coachUserId,
            fullName: coachUser.fullName,
            email: coachUser.email,
            schedulingUrl: profile?.schedulingUrl ?? null,
            coachingSince,
            coachingSinceDays: daysBetween(coachingSince, today().slice(0, 10)),
          }
        : null,
    assignmentId: assignment?.id ?? null,
    reassignment: assignment ? await describeReassignment(context, assignment) : null,
    sessions: sessionsWithNames,
    requests,
    health: currentHealth ?? health,
  };
}

function daysBetween(from: ISODate, to: ISODate): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Coach console
// ---------------------------------------------------------------------------

export interface ConsolePodCard {
  podId: UUID;
  podName: string;
  holdingName: string;
  memberCount: number;
  health: PodHealthSignal | null;
  lastSessionAt: string | null;
  lastSessionType: CoachingSessionType | null;
  nextSessionAt: string | null;
  assignmentId: UUID;
  reassignment: ReassignmentView;
}

export interface CoachConsoleView {
  coachUserId: UUID;
  coachName: string;
  profile: CoachProfile | null;
  pods: ConsolePodCard[];
  podCount: number;
  /**
   * Guidance only. Present when the load is outside 3–5; the assignment that
   * produced it was still allowed (07: "warn but not block").
   */
  ratioWarning: string | null;
  suggestedRange: { min: number; max: number };
  /**
   * The accountability-path suggestion, per pod. A suggestion the coach may
   * act on; nothing here opens a case.
   */
  flags: Array<{
    podId: UUID;
    podName: string;
    streak: number;
    threshold: number;
    /** The colours behind the streak, newest last, so the banner can show them. */
    history: HealthColor[];
  }>;
  openRequests: CoachingSessionRequest[];
  cycleNumber: number | null;
}

/**
 * Everything `/coaching/console` renders for one coach.
 *
 * Sessions here are read with a `coach` viewer scoped to that coach's own id, so
 * the console can show private notes for their pods and nothing else. A coach
 * who is also a pod member somewhere sees their own notes as a coach and the
 * pod-visible history as a member — two different reads, never merged.
 */
export async function getCoachConsole(
  context: CoachingServiceContext,
  input: { orgId: UUID; coachUserId: UUID },
): Promise<CoachConsoleView> {
  const { db, today } = context;

  const coach = await findUserById(db, input.coachUserId);
  if (!coach) throw notFound(`Coach ${input.coachUserId} not found`);

  const profile = await getCoachProfile(db, input.coachUserId);
  const assignments = await listActiveAssignmentsForCoach(db, input.coachUserId);
  const threshold = await redFlagThreshold(context, input.orgId);

  const pods: ConsolePodCard[] = [];
  const flags: CoachConsoleView['flags'] = [];

  for (const assignment of assignments) {
    const pod = await getPod(db, assignment.podId);
    if (!pod) continue;

    const activeCycle = await findActiveCycleForPod(context, assignment.podId);
    const health = activeCycle
      ? await getHealthSignal(db, assignment.podId, activeCycle.id)
      : null;

    const sessions = await listCoachSessions(db, input.coachUserId, assignment.podId, 50);
    const past = sessions.filter((row) => Date.parse(row.occurredAt) <= Date.parse(today()));
    const upcoming = sessions
      .filter((row) => Date.parse(row.occurredAt) > Date.parse(today()))
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

    const history = await listHealthSignalsForPod(db, assignment.podId, 12);
    const colors = history.map((row) => row.signalColor);
    // The current cycle's freshly computed colour may not be stored yet.
    if (health && colors[colors.length - 1] !== health.signalColor) colors.push(health.signalColor);

    const banner = flagBanner(colors, threshold);
    if (banner.show) {
      flags.push({
        podId: assignment.podId,
        podName: pod.name,
        streak: banner.streak,
        threshold: banner.threshold,
        history: colors,
      });
    }

    pods.push({
      podId: assignment.podId,
      podName: pod.name,
      holdingName: pod.holdingName,
      memberCount: pod.memberCount,
      health,
      lastSessionAt: past[0]?.occurredAt ?? null,
      lastSessionType: past[0]?.sessionType ?? null,
      nextSessionAt: upcoming[0]?.occurredAt ?? null,
      assignmentId: assignment.id,
      reassignment: await describeReassignment(context, assignment),
    });
  }

  return {
    coachUserId: input.coachUserId,
    coachName: coach.fullName,
    profile,
    pods,
    podCount: pods.length,
    ratioWarning: ratioWarning(pods.length),
    suggestedRange: { min: SUGGESTED_POD_RANGE.min, max: SUGGESTED_POD_RANGE.max },
    flags,
    openRequests: await listOpenRequestsForCoach(db, input.coachUserId, 50),
    cycleNumber: (await findActiveCycleForPod(context, pods[0]?.podId ?? ''))?.cycleNumber ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface LogSessionInput {
  orgId: UUID;
  coachUserId: UUID;
  podId: UUID;
  occurredAt: string;
  sessionType: CoachingSessionType;
  privateNotes: string;
  /**
   * `undefined` or `null` means `[Save Private]` was used: nothing is shared and
   * the pod's history will say so. A string means `[Save & Share Summary with
   * Pod]`. The two buttons map onto exactly these two states, which is how 07's
   * "sharing is always a deliberate choice, never accidental" is enforced in
   * data rather than in intent.
   */
  podVisibleSummary?: string | null;
  requestId?: UUID | null;
  actorUserId: UUID | null;
}

/**
 * Verifies the caller really is this pod's assigned coach.
 *
 * The permission matrix grants `coach.log_session` to anyone holding the coach
 * role, but role scope alone would let a coach assigned to Pod Atlas log a
 * session against Pod Ember. Assignment is the narrower, module-specific fact
 * and it is checked here so no route has to remember to.
 */
async function assertAssignedCoach(
  context: CoachingServiceContext,
  podId: UUID,
  coachUserId: UUID,
): Promise<CoachAssignment> {
  const assignment = await getActiveAssignmentForPod(context.db, podId);
  if (!assignment) {
    throw conflict(
      `Pod ${podId} has no coach assigned, so no session can be logged against it`,
      'no_coach_assigned',
    );
  }
  if (assignment.coachUserId !== coachUserId) {
    throw forbidden(
      'Only the pod\'s assigned coach may log or edit its coaching sessions',
      'not_assigned_coach',
    );
  }
  return assignment;
}

export async function logSession(
  context: CoachingServiceContext,
  input: LogSessionInput,
): Promise<CoachingSession> {
  const { db } = context;

  const pod = await getPod(db, input.podId);
  if (!pod) throw notFound(`Pod ${input.podId} not found`);
  await assertAssignedCoach(context, input.podId, input.coachUserId);

  if (!input.privateNotes || input.privateNotes.trim() === '') {
    // A session with no notes at all is not a record anybody can act on later.
    throw badRequest(
      'A coaching session must carry private notes — they are the coach\'s working memory',
      'private_notes_required',
    );
  }

  const summary = input.podVisibleSummary?.trim() ? input.podVisibleSummary.trim() : null;

  const session = await createSession(db, {
    orgId: input.orgId,
    coachUserId: input.coachUserId,
    podId: input.podId,
    occurredAt: input.occurredAt,
    sessionType: input.sessionType,
    privateNotes: input.privateNotes,
    podVisibleSummary: summary,
    requestId: input.requestId ?? null,
  });

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'coaching.session_logged',
    entityType: 'coaching_session',
    entityId: session.id,
    metadata: {
      podId: input.podId,
      sessionType: input.sessionType,
      // Whether the summary was released is audited; its content is not, so the
      // audit log itself never becomes a second copy of a private note.
      sharedWithPod: summary !== null,
    },
  });

  // Canonical event (§6.2): "coaching session scheduled" → pod members + coach,
  // Informational. Carries no notes of either kind.
  await context.bus.publish({
    type: 'coaching.session_scheduled',
    aggregateType: 'coaching_session',
    aggregateId: session.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: {
      podId: input.podId,
      coachUserId: input.coachUserId,
      sessionId: session.id,
      occurredAt: session.occurredAt,
      sessionType: session.sessionType,
      sharedWithPod: summary !== null,
    },
  });

  return session;
}

export interface UpdateSessionInput {
  sessionId: UUID;
  coachUserId: UUID;
  occurredAt?: string;
  sessionType?: CoachingSessionType;
  privateNotes?: string;
  /** `null` explicitly un-shares a summary that was previously released. */
  podVisibleSummary?: string | null;
  actorUserId: UUID | null;
}

/**
 * Edits a session.
 *
 * Un-sharing is allowed and is the point of the explicit `null`: a coach who
 * released a summary and then realises it was too candid can withdraw it. What
 * is not allowed is silent withdrawal — the audit row records the change.
 */
export async function editSession(
  context: CoachingServiceContext,
  input: UpdateSessionInput,
): Promise<CoachingSession> {
  const { db } = context;

  const existing = await getCoachSession(db, input.sessionId);
  if (!existing) throw notFound(`Coaching session ${input.sessionId} not found`);
  if (existing.coachUserId !== input.coachUserId) {
    throw forbidden(
      'Only the coach who logged a session may edit it',
      'not_session_coach',
    );
  }

  const updated = await updateSession(db, input.sessionId, {
    occurredAt: input.occurredAt,
    sessionType: input.sessionType,
    privateNotes: input.privateNotes,
    podVisibleSummary: input.podVisibleSummary,
  });
  if (!updated) throw notFound(`Coaching session ${input.sessionId} not found`);

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'coaching.session_edited',
    entityType: 'coaching_session',
    entityId: updated.id,
    metadata: {
      podId: updated.podId,
      sharedWithPod: updated.sharedWithPod,
      sharingChanged: updated.sharedWithPod !== existing.sharedWithPod,
    },
  });

  return updated;
}

/**
 * One session, shaped by who is asking.
 *
 * The return type is a union on purpose: a pod viewer gets `PodVisibleSession`,
 * which has no `privateNotes` property at all. A caller that tried to read
 * `result.privateNotes` off the pod branch would not typecheck, so the compiler
 * participates in the access control rather than leaving it to runtime care.
 */
export async function getSession(
  context: CoachingServiceContext,
  input: { sessionId: UUID; viewer: SessionViewer },
): Promise<CoachingSession | PodVisibleSession> {
  const { db } = context;

  if (input.viewer.kind === 'pod') {
    const visible = await getPodVisibleSession(db, input.sessionId, input.viewer.podId);
    if (!visible) {
      // Deliberately the same 404 a genuinely missing session produces: telling
      // a pod that a session exists but is hidden would leak its existence.
      throw notFound(`Coaching session ${input.sessionId} not found`);
    }
    return visible;
  }

  const full = await getCoachSession(db, input.sessionId);
  if (!full) throw notFound(`Coaching session ${input.sessionId} not found`);

  if (input.viewer.kind === 'coach' && full.coachUserId !== input.viewer.coachUserId) {
    throw forbidden(
      'A coach may only open sessions for the pods assigned to them',
      'not_assigned_coach',
    );
  }

  return full;
}

/** A pod's session history, shaped by who is asking. */
export async function listSessions(
  context: CoachingServiceContext,
  input: { podId: UUID; viewer: SessionViewer; limit?: number },
): Promise<CoachingSession[] | PodVisibleSession[]> {
  const { db } = context;
  const limit = input.limit ?? 50;

  if (input.viewer.kind === 'pod') {
    return listPodVisibleSessions(db, input.podId, limit);
  }
  if (input.viewer.kind === 'coach') {
    return listCoachSessions(db, input.viewer.coachUserId, input.podId, limit);
  }
  return listAllSessionsForPod(db, input.podId, limit);
}

// ---------------------------------------------------------------------------
// Session requests
// ---------------------------------------------------------------------------

export interface RequestSessionInput {
  orgId: UUID;
  podId: UUID;
  requestedBy: UUID;
  topic: string;
  urgency?: SessionRequestUrgency;
  preferredTimes?: string | null;
}

/**
 * A pod asks its coach for a session.
 *
 * Routed to whoever holds the assignment right now, so the request never lands
 * with a coach who has rotated off the pod.
 */
export async function requestSession(
  context: CoachingServiceContext,
  input: RequestSessionInput,
): Promise<CoachingSessionRequest> {
  const { db } = context;

  const pod = await getPod(db, input.podId);
  if (!pod) throw notFound(`Pod ${input.podId} not found`);

  const assignment = await getActiveAssignmentForPod(db, input.podId);
  if (!assignment) {
    throw conflict(
      'This pod has no coach assigned yet, so a session cannot be requested. ' +
        'The Coaching Hub assigns coaches from the roster.',
      'no_coach_assigned',
    );
  }

  const topic = input.topic.trim();
  if (!topic) throw badRequest('A session request needs a topic', 'topic_required');

  const request = await createSessionRequest(db, {
    orgId: input.orgId,
    podId: input.podId,
    coachUserId: assignment.coachUserId,
    requestedBy: input.requestedBy,
    topic,
    urgency: input.urgency ?? 'normal',
    preferredTimes: input.preferredTimes ?? null,
  });

  await recordAudit(db, {
    actorUserId: input.requestedBy,
    action: 'coaching.session_requested',
    entityType: 'coaching_session_request',
    entityId: request.id,
    metadata: { podId: input.podId, urgency: request.urgency },
  });

  await context.bus.publish({
    type: 'coaching.session_requested',
    aggregateType: 'coaching_session_request',
    aggregateId: request.id,
    orgId: input.orgId,
    actorUserId: input.requestedBy,
    payload: {
      podId: input.podId,
      coachUserId: assignment.coachUserId,
      requestId: request.id,
      urgency: request.urgency,
    },
  });

  return request;
}

/** A coach declines a request they cannot meet. */
export async function declineSessionRequest(
  context: CoachingServiceContext,
  input: { requestId: UUID; coachUserId: UUID; actorUserId: UUID | null },
): Promise<CoachingSessionRequest> {
  const { db } = context;

  const rows = await db.query<{ id: UUID; coach_user_id: UUID; pod_id: UUID }>(
    'SELECT id, coach_user_id, pod_id FROM coaching_session_request WHERE id = $1',
    [input.requestId],
  );
  const request = rows.rows[0];
  if (!request) throw notFound(`Session request ${input.requestId} not found`);
  if (request.coach_user_id !== input.coachUserId) {
    throw forbidden('Only the coach a request was sent to may respond to it', 'not_assigned_coach');
  }

  const updated = await setSessionRequestStatus(db, input.requestId, 'declined');
  if (!updated) throw notFound(`Session request ${input.requestId} not found`);

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: 'coaching.session_request_declined',
    entityType: 'coaching_session_request',
    entityId: updated.id,
    metadata: { podId: updated.podId },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Roster — the Coaching Hub's view
// ---------------------------------------------------------------------------

export interface RosterCoachRow {
  coachUserId: UUID;
  fullName: string;
  email: string;
  profile: CoachProfile | null;
  capacity: CoachCapacity;
  /**
   * True when the coach has not restated their capacity recently. Capacity is
   * self-reported and never inferred (07), so a stale figure is labelled rather
   * than presented as current.
   */
  capacityStale: boolean;
  pods: Array<{ podId: UUID; podName: string; assignmentId: UUID; startCycleNumber: number | null }>;
  podCount: number;
  /** Guidance, never a block. */
  ratioWarning: string | null;
  /** The soonest review across this coach's assignments. */
  nextReview: ReassignmentView | null;
  cyclesUntilMandatoryReview: number | null;
}

export interface RosterView {
  coaches: RosterCoachRow[];
  /** Every pod, assigned or not — an unassigned pod is a gap the Hub must see. */
  pods: Array<{
    podId: UUID;
    podName: string;
    holdingName: string;
    coachUserId: UUID | null;
    coachName: string | null;
    assignmentId: UUID | null;
    health: PodHealthSignal | null;
    reassignment: ReassignmentView | null;
  }>;
  suggestedRange: { min: number; max: number };
  /**
   * Benchmarks from the source model, shown as reference. 07 asks for these on
   * the roster so the Hub can judge whether assignments are healthy; they are
   * guidance and nothing here enforces them.
   */
  benchmarks: Array<{ label: string; value: string; note: string }>;
  /** Assignments at or past the review mark — the Hub's work queue. */
  reviewDue: Array<{ podId: UUID; podName: string; coachUserId: UUID; reassignment: ReassignmentView }>;
  unassignedPods: UUID[];
}

/**
 * The roster behind `/hub/coaching-roster`.
 *
 * Returns coaches and pods on two axes so the matrix view is a render rather
 * than a computation in the browser, and includes unassigned pods explicitly —
 * a grid that only listed assigned pods would hide the gap that most needs
 * filling.
 */
export async function getRoster(
  context: CoachingServiceContext,
  input: { orgId: UUID },
): Promise<RosterView> {
  const { db, today } = context;

  const pods = await listPods(db, input.orgId);
  const assignments = await listActiveAssignments(db, input.orgId);
  const profiles = await listCoachProfiles(db, input.orgId);
  const profileByCoach = new Map(profiles.map((row) => [row.coachUserId, row]));

  const assignmentsByCoach = new Map<UUID, CoachAssignment[]>();
  const assignmentByPod = new Map<UUID, CoachAssignment>();
  for (const assignment of assignments) {
    const list = assignmentsByCoach.get(assignment.coachUserId) ?? [];
    list.push(assignment);
    assignmentsByCoach.set(assignment.coachUserId, list);
    assignmentByPod.set(assignment.podId, assignment);
  }

  const podById = new Map(pods.map((pod) => [pod.id, pod]));
  const activeCycle = pods.length
    ? await findActiveCycleForPod(context, pods[0]!.id)
    : null;

  const coaches: RosterCoachRow[] = [];
  const reviewDue: RosterView['reviewDue'] = [];

  // Every user holding the coach role, so a coach with no pods yet still appears
  // on the roster as available capacity rather than being invisible.
  const coachUsers = await listCoachUsers(db, input.orgId, today().slice(0, 10));

  for (const coachUser of coachUsers) {
    const held = assignmentsByCoach.get(coachUser.id) ?? [];
    const profile = profileByCoach.get(coachUser.id) ?? null;

    const podRows: RosterCoachRow['pods'] = [];
    let nextReview: ReassignmentView | null = null;

    for (const assignment of held) {
      const pod = podById.get(assignment.podId);
      const startCycle = await getCycleById(db, assignment.startCycleId);
      const view = await describeReassignment(context, assignment);
      podRows.push({
        podId: assignment.podId,
        podName: pod?.name ?? 'Unknown pod',
        assignmentId: assignment.id,
        startCycleNumber: startCycle?.cycleNumber ?? null,
      });
      if (!nextReview || view.cyclesUntilReview < nextReview.cyclesUntilReview) {
        nextReview = view;
      }
      if (view.urgency !== 'ok') {
        reviewDue.push({
          podId: assignment.podId,
          podName: pod?.name ?? 'Unknown pod',
          coachUserId: coachUser.id,
          reassignment: view,
        });
      }
    }

    coaches.push({
      coachUserId: coachUser.id,
      fullName: coachUser.fullName,
      email: coachUser.email,
      profile,
      capacity: profile?.capacity ?? 'comfortable',
      capacityStale: isCapacityStale(profile?.capacityStatedAt ?? null, today().slice(0, 10)),
      pods: podRows,
      podCount: podRows.length,
      ratioWarning: ratioWarning(podRows.length),
      nextReview,
      cyclesUntilMandatoryReview: nextReview ? nextReview.cyclesUntilReview : null,
    });
  }

  const rosterPods: RosterView['pods'] = [];
  const unassignedPods: UUID[] = [];

  for (const pod of pods) {
    const assignment = assignmentByPod.get(pod.id) ?? null;
    const coachUser = assignment ? await findUserById(db, assignment.coachUserId) : null;
    const health = activeCycle ? await getHealthSignal(db, pod.id, activeCycle.id) : null;

    if (!assignment) unassignedPods.push(pod.id);

    rosterPods.push({
      podId: pod.id,
      podName: pod.name,
      holdingName: pod.holdingName,
      coachUserId: assignment?.coachUserId ?? null,
      coachName: coachUser?.fullName ?? null,
      assignmentId: assignment?.id ?? null,
      health,
      reassignment: assignment ? await describeReassignment(context, assignment) : null,
    });
  }

  return {
    coaches,
    pods: rosterPods,
    suggestedRange: { min: SUGGESTED_POD_RANGE.min, max: SUGGESTED_POD_RANGE.max },
    // 07 §roster: the source model's real-world benchmarks, as reference.
    benchmarks: [
      {
        label: 'Buurtzorg (source model)',
        value: '1 coach per ~660 people',
        note: '21 coaches for 14,000 people — the ceiling the model was built against.',
      },
      {
        label: 'Pilot-scale guidance',
        value: `1 coach per ${SUGGESTED_POD_RANGE.min}–${SUGGESTED_POD_RANGE.max} pods`,
        note: 'Roughly 15–40 people per coach at pilot size. Guidance, not a constraint.',
      },
    ],
    reviewDue,
    unassignedPods,
  };
}

/** Capacity nobody has restated in ~3 cycles is stale; 90 days is that window. */
function isCapacityStale(statedAt: string | null, today: ISODate): boolean {
  if (!statedAt) return true;
  const stated = Date.parse(statedAt);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(stated) || !Number.isFinite(now)) return true;
  return now - stated > 90 * 86_400_000;
}

async function listCoachUsers(
  db: Database,
  orgId: UUID,
  today: ISODate,
): Promise<Array<{ id: UUID; fullName: string; email: string }>> {
  const result = await db.query<{ id: UUID; full_name: string; email: string }>(
    `SELECT DISTINCT u.id, u.full_name, u.email
       FROM app_user u
       JOIN role_assignment ra ON ra.user_id = u.id
      WHERE ra.role_type = 'coach'
        AND ra.revoked_at IS NULL
        AND ra.start_date <= $2
        AND (ra.end_date IS NULL OR ra.end_date >= $2)
        AND u.org_id = $1
      ORDER BY u.full_name`,
    [orgId, today],
  );
  return result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
  }));
}

// ---------------------------------------------------------------------------
// Assignment & reassignment
// ---------------------------------------------------------------------------

export interface AssignCoachInput {
  orgId: UUID;
  coachUserId: UUID;
  podId: UUID;
  /** Defaults to the pod's active cycle; the Hub may target a future boundary. */
  startCycleId?: UUID | null;
  reasonForChange?: string | null;
  actorUserId: UUID | null;
}

export interface AssignCoachResult {
  assignment: CoachAssignment;
  /** The assignment this replaced, when the pod already had a coach. */
  ended: CoachAssignment | null;
  /**
   * Guidance about the receiving coach's new load. Returned, never thrown:
   * 07 requires the warning to appear without blocking the assignment.
   */
  ratioWarning: string | null;
  podCountAfter: number;
  reassignmentDue: boolean;
}

/**
 * Assigns a coach to a pod, closing any assignment already in force.
 *
 * Both halves happen in one transaction, so a pod is never left with two coaches
 * or with none mid-reassignment. The reason is mandatory on a reassignment
 * because the table requires it and because an unexplained move cannot be
 * audited; a first assignment may omit it.
 *
 * The ratio check runs *after* the write and only reports. Exceeding 3–5 pods is
 * not an error here and no caller should treat the warning as one.
 */
export async function assignCoach(
  context: CoachingServiceContext,
  input: AssignCoachInput,
): Promise<AssignCoachResult> {
  const { db } = context;

  const pod = await getPod(db, input.podId);
  if (!pod) throw notFound(`Pod ${input.podId} not found`);
  if (pod.orgId !== input.orgId) {
    throw forbidden('That pod belongs to a different organisation', 'org_mismatch');
  }

  const coach = await findUserById(db, input.coachUserId);
  if (!coach) throw notFound(`Coach ${input.coachUserId} not found`);

  const activeCycle = await findActiveCycleForPod(context, input.podId);
  const startCycleId = input.startCycleId ?? activeCycle?.id ?? null;
  if (!startCycleId) {
    throw conflict(
      'No sprint cycle exists for this pod yet, so an assignment has no start ' +
        'cycle to be counted against. Start the cycle first.',
      'no_active_cycle',
    );
  }

  const existing = await getActiveAssignmentForPod(db, input.podId);
  const isReassignment = existing !== null;

  if (isReassignment && !input.reasonForChange?.trim()) {
    // 07 §roster: reassigning asks for a reason, "free text, logged".
    throw badRequest(
      'Reassigning a pod to a different coach requires a reason, so the move can be audited',
      'reason_required',
    );
  }

  if (existing && existing.coachUserId === input.coachUserId) {
    throw conflict(
      `${coach.fullName} is already the assigned coach for ${pod.name}`,
      'already_assigned',
    );
  }

  const result = await db.transaction(async (tx) => {
    let ended: CoachAssignment | null = null;

    if (existing) {
      ended = await endAssignment(tx, existing.id, {
        endCycleId: startCycleId,
        reasonForChange: input.reasonForChange!.trim(),
      });
      if (!ended) {
        // Another request closed it first; retrying would double-write history.
        throw conflict(
          'That assignment was changed by someone else while this request was in flight',
          'assignment_changed',
        );
      }
    }

    const assignment = await createAssignment(tx, {
      orgId: input.orgId,
      coachUserId: input.coachUserId,
      podId: input.podId,
      startCycleId,
      reasonForChange: input.reasonForChange?.trim() || null,
      createdBy: input.actorUserId,
    });

    return { assignment, ended };
  });

  // Make sure the new coach has a profile row, so the roster always has
  // somewhere to record capacity even before they state any.
  await upsertCoachProfile(db, { orgId: input.orgId, coachUserId: input.coachUserId });

  const heldAfter = await listActiveAssignmentsForCoach(db, input.coachUserId);
  const podCountAfter = heldAfter.length;
  const warning = ratioWarning(podCountAfter);

  const reassignment = await describeReassignment(context, result.assignment);

  await recordAudit(db, {
    actorUserId: input.actorUserId,
    action: isReassignment ? 'coaching.coach_reassigned' : 'coaching.coach_assigned',
    entityType: 'coach_assignment',
    entityId: result.assignment.id,
    metadata: {
      podId: input.podId,
      coachUserId: input.coachUserId,
      previousCoachUserId: existing?.coachUserId ?? null,
      endedAssignmentId: result.ended?.id ?? null,
      reason: input.reasonForChange?.trim() || null,
      // Audited so "we warned them" is a fact on the record, not a memory.
      podCountAfter,
      ratioWarning: warning,
    },
  });

  if (isReassignment) {
    await context.bus.publish({
      type: 'coaching.coach_reassigned',
      aggregateType: 'coach_assignment',
      aggregateId: result.assignment.id,
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      payload: {
        podId: input.podId,
        coachUserId: input.coachUserId,
        previousCoachUserId: existing?.coachUserId ?? null,
        reason: input.reasonForChange?.trim() || null,
      },
    });
  }

  return {
    assignment: result.assignment,
    ended: result.ended,
    ratioWarning: warning,
    podCountAfter,
    reassignmentDue: reassignment.urgency !== 'ok',
  };
}

/**
 * Records what a coach says about their own capacity.
 *
 * Only the coach may set this: it is self-reported, and letting the Hub infer or
 * overwrite it would turn a statement about workload into a judgement about the
 * coach (07 §roster).
 */
export async function setCoachCapacity(
  context: CoachingServiceContext,
  input: {
    orgId: UUID;
    coachUserId: UUID;
    capacity: CoachCapacity;
    schedulingUrl?: string | null;
  },
): Promise<CoachProfile> {
  const profile = await upsertCoachProfile(context.db, {
    orgId: input.orgId,
    coachUserId: input.coachUserId,
    capacity: input.capacity,
    schedulingUrl: input.schedulingUrl,
  });

  await recordAudit(context.db, {
    actorUserId: input.coachUserId,
    action: 'coaching.capacity_stated',
    entityType: 'coach_profile',
    entityId: profile.id,
    metadata: { capacity: profile.capacity },
  });

  return profile;
}

/**
 * Publishes the reassignment-due reminders for one org.
 *
 * Split out from the read paths so a scheduler can call it without rendering
 * anything. It publishes only on the transition into `due` or `overdue`, tracked
 * through the audit log, so the Coaching Hub is not notified every cycle for an
 * assignment that has been overdue for three.
 */
export async function publishReassignmentReminders(
  context: CoachingServiceContext,
  input: { orgId: UUID },
): Promise<Array<{ podId: UUID; coachUserId: UUID; urgency: string }>> {
  const { db } = context;
  const assignments = await listActiveAssignments(db, input.orgId);
  const published: Array<{ podId: UUID; coachUserId: UUID; urgency: string }> = [];

  for (const assignment of assignments) {
    const view = await describeReassignment(context, assignment);
    if (view.urgency === 'ok') continue;

    const already = await db.query<{ n: number | string }>(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE action = 'coaching.reassignment_due'
          AND entity_id = $1
          AND metadata->>'urgency' = $2`,
      [assignment.id, view.urgency],
    );
    if (Number(already.rows[0]?.n ?? 0) > 0) continue;

    await recordAudit(db, {
      actorUserId: null,
      action: 'coaching.reassignment_due',
      entityType: 'coach_assignment',
      entityId: assignment.id,
      metadata: {
        podId: assignment.podId,
        coachUserId: assignment.coachUserId,
        urgency: view.urgency,
        cyclesWithPodSet: view.cyclesWithPodSet,
      },
    });

    // Canonical event (§6.2): "coach reassignment due" → Coaching Hub, Action
    // required. Still only a reminder: a human confirms the actual move.
    await context.bus.publish({
      type: 'coaching.reassignment_due',
      aggregateType: 'coach_assignment',
      aggregateId: assignment.id,
      orgId: input.orgId,
      payload: {
        podId: assignment.podId,
        coachUserId: assignment.coachUserId,
        urgency: view.urgency,
        cyclesWithPodSet: view.cyclesWithPodSet,
        reviewAround: view.reviewAround,
      },
    });

    published.push({
      podId: assignment.podId,
      coachUserId: assignment.coachUserId,
      urgency: view.urgency,
    });
  }

  return published;
}
