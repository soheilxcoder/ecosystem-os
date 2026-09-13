/**
 * Peer review + conflict resolution services (Module 08, workflows 1 and 2).
 *
 * Two rules are enforced here rather than in the browser:
 *
 *  1. **A review is a written justification, not a number.** A submission
 *     without a comment is rejected — the comments are the only thing the
 *     reviewed pod ever learns from the process.
 *  2. **Reviewers must be impartial.** Assignment excludes the pod's own
 *     members, its coach, and anyone in a pod trading with it under an active
 *     CLOU. The same rule is re-checked before a score is accepted, so a
 *     reviewer whose pod signs an agreement mid-cycle stops being eligible.
 *
 * The peer-review window (Days 86–88) is enforced against the live calendar in
 * the same way as the pitch window: disabled buttons are an affordance, this is
 * the control.
 */

import type { Database } from '../../db/client';
import { queryOne } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type {
  CaseAuthorRole,
  ConflictCaseEvent,
  PeerReview,
  UUID,
} from '../../core/types';
import { isPeerReviewWindow } from '../../core/calendar';
import {
  REVIEW_COMMENT_MIN_LENGTH,
  REVIEW_SCORE_MAX,
  REVIEW_SCORE_MIN,
  averageScore,
  reviewStatus,
  selectReviewers,
  validateRubricAnswers,
  validateSubmission,
  type RubricAnswers,
} from '../../core/peer-review';
import {
  addConflictCaseEvent,
  assignReview,
  createConflictCase,
  escalateCase,
  getConflictCase,
  getPitchPod,
  getReview,
  listConflictCaseEvents,
  listConflictCases,
  listInsiderUserIds,
  listPeerValidatorUserIds,
  listReviewablePitches,
  listReviewerQueue,
  listReviewsForPitch,
  listTradingPartnerUserIds,
  setCaseStatus,
  updateReview,
  type CaseWithPods,
  type QueueItem,
  type ReviewablePitch,
} from '../../db/repositories/review';
import { getGovernanceSettings } from '../../db/repositories/governance';
import { recordAudit } from '../../db/repositories/audit';
import { badRequest, forbidden, notFound } from '../errors';
import { getCurrentPhaseForScope, type PhaseSnapshot } from './calendar';
import { WindowClosedError } from './pods';

export interface ReviewServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueItemView {
  reviewId: UUID;
  pitchId: UUID;
  podId: UUID;
  podName: string;
  cycleId: UUID;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  pitchSummary: string | null;
  pitchPlan: string | null;
  status: 'not_started' | 'in_progress' | 'submitted';
  score: number | null;
  comments: string | null;
  rubricAnswers: RubricAnswers;
  submittedAt: string | null;
  peerAverage: number | null;
  /** True once the cycle day is inside the peer-review window. */
  windowOpen: boolean;
}

export interface ReviewQueueView {
  items: QueueItemView[];
  cycleNumber: number | null;
  windowOpen: boolean;
  /** Pitches in the current cycle that still have no panel assigned. */
  unassigned: ReviewablePitch[];
  reviewersPerPitch: number;
  minCommentLength: number;
}

export async function getReviewQueue(
  context: ReviewServiceContext,
  reviewerUserId: UUID,
  orgId: UUID,
): Promise<ReviewQueueView> {
  const settings = await getGovernanceSettings(context.db, orgId);
  const phase = await currentPhase(context, orgId);
  const items = await listReviewerQueue(context.db, reviewerUserId);
  const windowOpen = phase ? isPeerReviewWindow(phase.day, phase.phaseBoundaries) : false;

  const cycleId = phase?.cycleId ?? null;
  const pitches = cycleId ? await listReviewablePitches(context.db, cycleId) : [];
  const unassigned = pitches.filter((pitch) => pitch.reviewerUserIds.length === 0);

  return {
    items: items.map((item) => toQueueItemView(item, windowOpen)),
    cycleNumber: phase?.cycleNumber ?? null,
    windowOpen,
    unassigned,
    reviewersPerPitch: settings.reviewReviewersPerPitch,
    minCommentLength: settings.reviewCommentMinLength ?? REVIEW_COMMENT_MIN_LENGTH,
  };
}

function toQueueItemView(item: QueueItem, windowOpen: boolean): QueueItemView {
  return {
    reviewId: item.review.id,
    pitchId: item.pitchId,
    podId: item.podId,
    podName: item.podName,
    cycleId: item.review.cycleId,
    cycleNumber: item.cycleNumber,
    cycleStart: item.cycleStart,
    cycleEnd: item.cycleEnd,
    pitchSummary: item.pitchSummary,
    pitchPlan: item.pitchPlan,
    status: reviewStatus(item.review),
    score: item.review.score,
    comments: item.review.comments,
    rubricAnswers: item.review.rubricAnswers ?? {},
    submittedAt: item.review.submittedAt,
    peerAverage: item.peerAverage,
    windowOpen,
  };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export interface AssignmentResult {
  pitchId: UUID;
  podName: string;
  reviewerUserIds: UUID[];
  /** How many candidates the conflict-of-interest rule removed. */
  excludedCount: number;
}

/**
 * Assign panels for every reviewable pitch in the cycle that has none yet.
 *
 * Idempotent: existing assignments are kept, so re-running it only fills gaps.
 * The seed is the cycle number, which means the panel rotates one seat per
 * cycle — the same pod is not reviewed by the same people for ever.
 */
export async function assignReviewersForCycle(
  context: ReviewServiceContext,
  orgId: UUID,
  cycleId: UUID,
): Promise<AssignmentResult[]> {
  const settings = await getGovernanceSettings(context.db, orgId);
  const candidates = await listPeerValidatorUserIds(context.db, orgId, context.today());
  const cycleNumber = await cycleNumberFor(context.db, cycleId);
  const pitches = await listReviewablePitches(context.db, cycleId);

  const results: AssignmentResult[] = [];
  for (const pitch of pitches) {
    if (pitch.reviewerUserIds.length > 0) {
      results.push({
        pitchId: pitch.pitchId,
        podName: pitch.podName,
        reviewerUserIds: pitch.reviewerUserIds,
        excludedCount: 0,
      });
      continue;
    }

    const insiders = await listInsiderUserIds(context.db, pitch.podId, context.today());
    const partners = await listTradingPartnerUserIds(context.db, pitch.podId);
    const excluded = [...new Set([...insiders, ...partners])];
    const reviewerUserIds = selectReviewers({
      candidateUserIds: candidates,
      excludedUserIds: excluded,
      count: settings.reviewReviewersPerPitch,
      seed: cycleNumber,
    });

    for (const reviewerUserId of reviewerUserIds) {
      await assignReview(context.db, { cycleId, pitchId: pitch.pitchId, reviewerUserId });
    }

    results.push({
      pitchId: pitch.pitchId,
      podName: pitch.podName,
      reviewerUserIds,
      excludedCount: excluded.filter((id) => candidates.includes(id)).length,
    });
  }

  if (results.length > 0) {
    await recordAudit(context.db, {
      actorUserId: null,
      action: 'review.assign',
      entityType: 'sprint_cycle',
      entityId: cycleId,
      metadata: {
        orgId,
        pitches: results.length,
        reviewersPerPitch: settings.reviewReviewersPerPitch,
      },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface SaveReviewInput {
  pitchId: UUID;
  reviewerUserId: UUID;
  orgId: UUID;
  score: number | null;
  comments: string | null;
  rubricAnswers?: RubricAnswers | null;
  submit: boolean;
}

export interface ReviewResult {
  review: PeerReview;
  status: 'in_progress' | 'submitted';
}

/**
 * Save a draft or submit a review.
 *
 * The reviewer's own eligibility is re-checked on every write: if their pod has
 * since signed a CLOU with the pod they are reviewing, they are out.
 */
export async function saveReview(
  context: ReviewServiceContext,
  input: SaveReviewInput,
): Promise<ReviewResult> {
  const review = await getReview(context.db, input.pitchId, input.reviewerUserId);
  if (!review) throw forbidden('You are not assigned to review this pitch');
  if (review.submittedAt) {
    throw forbidden(
      'This review has already been submitted — corrections are new records, not edits',
    );
  }

  const pod = await getPitchPod(context.db, input.pitchId);
  if (!pod) throw notFound('Pitch not found');

  const score = input.score;
  if (score !== null && (score < REVIEW_SCORE_MIN || score > REVIEW_SCORE_MAX)) {
    throw badRequest(`Score must be between ${REVIEW_SCORE_MIN} and ${REVIEW_SCORE_MAX}`);
  }

  const rubricCheck = validateRubricAnswers(input.rubricAnswers ?? null);
  if (!rubricCheck.ok) throw badRequest(rubricCheck.message ?? 'Invalid rubric answers');

  if (input.submit) {
    // The window is a control, not a hint: outside Days 86–88 nothing is accepted.
    await requireReviewWindow(context, input.orgId, pod.pod.id);

    const check = validateSubmission({
      score,
      comments: input.comments,
      rubricAnswers: input.rubricAnswers,
    });
    if (!check.ok) throw badRequest(check.message ?? 'Invalid review');

    const conflict = await isConflicted(context, pod.pod.id, input.reviewerUserId);
    if (conflict) {
      throw forbidden(
        'You can no longer review this pitch: you belong to the pod or to a pod trading with it',
      );
    }
  }

  const saved = await updateReview(context.db, review.id, {
    score,
    comments: input.comments,
    rubricAnswers: input.rubricAnswers ?? undefined,
    submittedAt: input.submit ? new Date().toISOString() : null,
  });
  if (!saved) throw notFound('Review not found');

  await recordAudit(context.db, {
    actorUserId: input.reviewerUserId,
    action: input.submit ? 'review.submit' : 'review.draft_saved',
    entityType: 'peer_review',
    entityId: saved.id,
    metadata: { score: saved.score, pitchId: input.pitchId },
  });

  if (input.submit) {
    await context.bus.publish({
      type: 'review.submitted',
      aggregateType: 'pitch',
      aggregateId: input.pitchId,
      orgId: input.orgId,
      actorUserId: input.reviewerUserId,
      payload: { score: saved.score },
    } as any);
  }

  return { review: saved, status: input.submit ? 'submitted' : 'in_progress' };
}

/** Everything a pod can see about the reviews of one of its pitches. */
export interface PitchReviewSummary {
  pitchId: UUID;
  podId: UUID;
  podName: string;
  cycleNumber: number;
  reviews: Array<{
    reviewerUserId: UUID;
    reviewerName: string;
    score: number | null;
    comments: string | null;
    submittedAt: string | null;
    status: 'not_started' | 'in_progress' | 'submitted';
  }>;
  average: number | null;
  submittedCount: number;
}

export async function getPitchReviews(
  context: ReviewServiceContext,
  pitchId: UUID,
  orgId: UUID,
): Promise<PitchReviewSummary | null> {
  const pod = await getPitchPod(context.db, pitchId);
  if (!pod) return null;

  const reviews = await listReviewsForPitch(context.db, pitchId);
  const names = await reviewerNames(context, reviews.map((review) => review.reviewerUserId));
  const submitted = reviews.filter((review) => review.submittedAt !== null)
    .map((review) => review.score)
    .filter((score): score is number => score !== null);

  return {
    pitchId,
    podId: pod.pod.id,
    podName: pod.pod.name,
    cycleNumber: await cycleNumberFor(context.db, pod.cycleId),
    reviews: reviews.map((review) => ({
      reviewerUserId: review.reviewerUserId,
      reviewerName: names[review.reviewerUserId] ?? 'Peer Validator',
      score: review.submittedAt ? review.score : null,
      comments: review.submittedAt ? review.comments : null,
      submittedAt: review.submittedAt,
      status: reviewStatus(review),
    })),
    average: averageScore(submitted),
    submittedCount: reviews.filter((review) => review.submittedAt !== null).length,
  };
}

async function reviewerNames(
  context: ReviewServiceContext,
  userIds: UUID[],
): Promise<Record<UUID, string>> {
  if (userIds.length === 0) return {};
  const rows = await context.db.query<{ id: UUID; full_name: string }>(
    'SELECT id, full_name FROM app_user WHERE id = ANY($1::uuid[])',
    [userIds],
  );
  return Object.fromEntries(rows.rows.map((row) => [row.id, row.full_name]));
}

async function isConflicted(
  context: ReviewServiceContext,
  podId: UUID,
  reviewerUserId: UUID,
): Promise<boolean> {
  const insiders = await listInsiderUserIds(context.db, podId, context.today());
  if (insiders.includes(reviewerUserId)) return true;
  const partners = await listTradingPartnerUserIds(context.db, podId);
  return partners.includes(reviewerUserId);
}

async function currentPhase(
  context: ReviewServiceContext,
  orgId: UUID,
): Promise<PhaseSnapshot | null> {
  return getCurrentPhaseForScope(context.db, { orgId }, context.today());
}

async function requireReviewWindow(
  context: ReviewServiceContext,
  orgId: UUID,
  podId: UUID,
): Promise<PhaseSnapshot> {
  const phase =
    (await getCurrentPhaseForScope(context.db, { orgId, podId }, context.today())) ??
    (await currentPhase(context, orgId));
  if (!phase) throw badRequest('No active sprint cycle — reviews cannot be submitted yet');
  if (!isPeerReviewWindow(phase.day, phase.phaseBoundaries)) {
    throw new WindowClosedError('Submitting a peer review', phase.day, [
      phase.phaseBoundaries.p3_end + 1,
      phase.phaseBoundaries.p4_end,
    ]);
  }
  return phase;
}

async function cycleNumberFor(db: Database, cycleId: UUID): Promise<number> {
  const row = await queryOne<{ cycle_number: number }>(
    db,
    'SELECT cycle_number FROM sprint_cycle WHERE id = $1',
    [cycleId],
  );
  return row ? Number(row.cycle_number) : 1;
}

// ---------------------------------------------------------------------------
// Conflict cases
// ---------------------------------------------------------------------------

export interface CaseDetail extends CaseWithPods {
  events: ConflictCaseEvent[];
}

export async function listCases(
  context: ReviewServiceContext,
  filter: { orgId?: UUID; resolverUserId?: UUID; userId?: UUID },
): Promise<CaseWithPods[]> {
  return listConflictCases(context.db, filter);
}

export async function getCase(
  context: ReviewServiceContext,
  caseId: UUID,
): Promise<CaseDetail | null> {
  const found = await getConflictCase(context.db, caseId);
  if (!found) return null;
  return { ...found, events: await listConflictCaseEvents(context.db, caseId) };
}

export async function openCase(
  context: ReviewServiceContext,
  input: {
    orgId: UUID;
    podAId: UUID;
    podBId: UUID;
    resolverUserId: UUID;
    subject: string;
    actorUserId: UUID;
  },
): Promise<CaseDetail> {
  const subject = input.subject.trim();
  if (!subject) throw badRequest('A conflict case needs a subject');
  if (input.podAId === input.podBId) {
    throw badRequest('A conflict case needs two different pods');
  }

  const created = await createConflictCase(context.db, {
    orgId: input.orgId,
    podAId: input.podAId,
    podBId: input.podBId,
    resolverUserId: input.resolverUserId,
    subject,
  });

  await addConflictCaseEvent(context.db, {
    caseId: created.id,
    authorUserId: input.actorUserId,
    authorRole: 'system',
    body: `Case opened between ${created.podAName} and ${created.podBName}.`,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'case.open',
    entityType: 'conflict_case',
    entityId: created.id,
    metadata: { podAId: input.podAId, podBId: input.podBId },
  });

  await context.bus.publish({
    type: 'case.opened',
    aggregateType: 'conflict_case',
    aggregateId: created.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { subject },
  } as any);

  return getCase(context, created.id) as Promise<CaseDetail>;
}

export async function logCaseEntry(
  context: ReviewServiceContext,
  input: {
    caseId: UUID;
    actorUserId: UUID;
    authorRole: CaseAuthorRole;
    body: string;
    orgId: UUID;
  },
): Promise<CaseDetail> {
  const found = await getConflictCase(context.db, input.caseId);
  if (!found) throw notFound('Case not found');
  if (found.status !== 'open') {
    throw forbidden('This case is closed — open a new one rather than reopening it');
  }

  const body = input.body.trim();
  if (!body) throw badRequest('A log entry cannot be empty');

  // Only the assigned resolver may speak as the resolver; each pod may only
  // add its own statements. That keeps the log trustworthy for both sides.
  if (input.authorRole === 'resolver' && found.resolverUserId !== input.actorUserId) {
    throw forbidden('Only the assigned Conflict Resolver can add a mediation note');
  }
  if (input.authorRole === 'pod_a' || input.authorRole === 'pod_b') {
    const podId = input.authorRole === 'pod_a' ? found.podAId : found.podBId;
    const member = await queryOne<{ ok: number }>(context.db,
      `SELECT 1 AS ok FROM pod_membership
        WHERE pod_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [podId, input.actorUserId],
    );
    if (!member) {
      throw forbidden('Only members of the pod may add a statement on its behalf');
    }
  }

  await addConflictCaseEvent(context.db, {
    caseId: input.caseId,
    authorUserId: input.actorUserId,
    authorRole: input.authorRole,
    body,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'case.log',
    entityType: 'conflict_case',
    entityId: input.caseId,
    metadata: { role: input.authorRole },
  });

  return getCase(context, input.caseId) as Promise<CaseDetail>;
}

export async function recommendResolution(
  context: ReviewServiceContext,
  input: { caseId: UUID; actorUserId: UUID; orgId: UUID; text: string },
): Promise<CaseDetail> {
  const found = await getConflictCase(context.db, input.caseId);
  if (!found) throw notFound('Case not found');
  if (found.resolverUserId !== input.actorUserId) {
    throw forbidden('Only the assigned Conflict Resolver can recommend a resolution');
  }

  const text = input.text.trim();
  if (text.length < 20) {
    throw badRequest('A recommendation needs at least 20 characters both pods can act on');
  }

  await addConflictCaseEvent(context.db, {
    caseId: input.caseId,
    authorUserId: input.actorUserId,
    authorRole: 'resolver',
    body: text,
  });
  await setCaseStatus(context.db, input.caseId, 'resolved', text);

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'case.recommend',
    entityType: 'conflict_case',
    entityId: input.caseId,
    metadata: {},
  });

  await context.bus.publish({
    type: 'case.resolved',
    aggregateType: 'conflict_case',
    aggregateId: input.caseId,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: {},
  } as any);

  return getCase(context, input.caseId) as Promise<CaseDetail>;
}

export async function escalateToRuleReview(
  context: ReviewServiceContext,
  input: { caseId: UUID; actorUserId: UUID; orgId: UUID },
): Promise<CaseDetail> {
  const found = await getConflictCase(context.db, input.caseId);
  if (!found) throw notFound('Case not found');
  if (found.resolverUserId !== input.actorUserId) {
    throw forbidden('Only the assigned Conflict Resolver can escalate a case');
  }

  await escalateCase(context.db, input.caseId);
  await addConflictCaseEvent(context.db, {
    caseId: input.caseId,
    authorUserId: input.actorUserId,
    authorRole: 'system',
    body: 'Escalated to a rule review: this dispute is really about the rule, not the pods.',
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'case.escalate',
    entityType: 'conflict_case',
    entityId: input.caseId,
    metadata: {},
  });

  return getCase(context, input.caseId) as Promise<CaseDetail>;
}
