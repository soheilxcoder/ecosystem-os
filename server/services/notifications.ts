/**
 * Notification dispatcher (Module 11).
 *
 * Subscribes to the shared domain-event bus and turns each meaningful state
 * change into correctly routed notifications. Because the Archive indexer
 * (Module 10) subscribes to the *same* events, the "who is told" list and the
 * "what is remembered" list come from one source of truth and cannot drift.
 *
 * Two rules from 11 are enforced here, not in the UI:
 *   - Needs-Action items are cleared only when the underlying action is done —
 *     the list endpoint re-queries the related entity's live state, there is no
 *     "dismissed" flag.
 *   - Urgent items can never be fully muted: in-app delivery is forced on
 *     regardless of the user's preference; only their email channel is theirs
 *     to change.
 */

import type { Database, Queryable } from '../../db/client';
import type { DomainEvent, EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type { Notification, NotificationUrgency, UUID } from '../../core/types';
import {
  createNotification,
  listPreferencesForUser,
  markNotificationActioned,
} from '../../db/repositories/notifications';
import { getPod, listPodMembers } from '../../db/repositories/pods';
import { getActiveAssignmentForPod } from '../../db/repositories/coaching';
import { getAgreement, listEscalationContacts } from '../../db/repositories/agreements';
import { getPitchPodId } from '../../db/repositories/review';
import { listPanelMembers } from '../../db/repositories/governance';
import { listUsersByOrg, findUserById } from '../../db/repositories/users';

export interface NotificationServiceContext {
  db: Database;
  today: () => ISODate;
}

export interface NotificationDraft {
  recipientUserId: UUID;
  triggerType: string;
  urgency: NotificationUrgency;
  title: string;
  contextText?: string | null;
  deepLink?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: UUID | null;
}

// ---------------------------------------------------------------------------
// Recipient resolution helpers
// ---------------------------------------------------------------------------

async function memberIds(db: Queryable, podId: UUID): Promise<UUID[]> {
  const members = await listPodMembers(db, podId);
  return members.map((m) => m.id);
}

/** One peer-review row by primary key (the dispatcher keys off review ids). */
async function getReviewById(
  db: Queryable,
  reviewId: UUID,
): Promise<{ id: UUID; pitchId: UUID; reviewerUserId: UUID; submittedAt: string | null } | null> {
  const row = await db.query<{ id: UUID; pitch_id: UUID; reviewer_user_id: UUID; submitted_at: string | null }>(
    'SELECT id, pitch_id, reviewer_user_id, submitted_at FROM peer_review WHERE id = $1',
    [reviewId],
  );
  const r = row.rows[0];
  if (!r) return null;
  return { id: r.id, pitchId: r.pitch_id, reviewerUserId: r.reviewer_user_id, submittedAt: r.submitted_at };
}

/**
 * The pod's current lead, or null mid-rotation.
 *
 * Resolved from the *active pod_lead role assignment* — the same live seat the
 * rest of the platform uses (`listEscalationContacts`) — rather than the
 * historical election ledger, so the notification always reaches whoever holds
 * the rotating seat today.
 */
async function currentLeadId(db: Queryable, podId: UUID, today: ISODate): Promise<UUID | null> {
  const contacts = await listEscalationContacts(db, [podId], today);
  return contacts[0]?.userId ?? null;
}

async function assignedCoachId(db: Queryable, podId: UUID): Promise<UUID | null> {
  const assignment = await getActiveAssignmentForPod(db, podId);
  return assignment?.coachUserId ?? null;
}

async function podName(db: Queryable, podId: UUID): Promise<string> {
  const pod = await getPod(db, podId);
  return pod?.name ?? 'Your pod';
}

/** Every pod in an org (pods hang off holdings, holdings off the org). */
async function orgPodIds(db: Queryable, orgId: UUID): Promise<UUID[]> {
  const rows = await db.query<{ id: UUID }>(
    `SELECT p.id FROM pod p JOIN holding h ON h.id = p.holding_id WHERE h.org_id = $1`,
    [orgId],
  );
  return rows.rows.map((r) => r.id);
}

/** Reviewers for a cycle who have not yet submitted. */
async function pendingReviewerIds(db: Queryable, cycleId: UUID): Promise<UUID[]> {
  const rows = await db.query<{ reviewer_user_id: UUID }>(
    'SELECT DISTINCT reviewer_user_id FROM peer_review WHERE cycle_id = $1 AND submitted_at IS NULL',
    [cycleId],
  );
  return rows.rows.map((r) => r.reviewer_user_id);
}

/** Cycle number for a human-readable reminder title. */
async function cycleNumberFor(db: Queryable, cycleId: UUID): Promise<number | null> {
  const row = await db.query<{ cycle_number: number }>(
    'SELECT cycle_number FROM sprint_cycle WHERE id = $1',
    [cycleId],
  );
  return row.rows[0]?.cycle_number ?? null;
}

// ---------------------------------------------------------------------------
// Event → drafts
// ---------------------------------------------------------------------------

/**
 * Maps one domain event to zero or more notification drafts. Returns [] for
 * events that produce no notification (e.g. check-ins), so the dispatcher can
 * stay a single subscriber without a growing if-chain at every call site.
 */
export async function resolveNotificationDrafts(
  context: NotificationServiceContext,
  event: DomainEvent,
): Promise<NotificationDraft[]> {
  const { db, today } = context;
  const payload = event.payload as Record<string, unknown>;
  const orgId = event.orgId;
  if (!orgId) return [];

  const podIdOf = (): UUID | null => (payload.podId as UUID) ?? event.aggregateId;

  switch (event.type) {
    // --- Pods (03) ---------------------------------------------------------
    case 'pod.lead_elected': {
      const podId = event.aggregateId;
      if (!podId) return [];
      const name = await podName(db, podId);
      const winner = payload.winnerUserId
        ? await findUserById(db, payload.winnerUserId as UUID)
        : null;
      const recipients = await memberIds(db, podId);
      return recipients.map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'pod_lead_elected',
        urgency: 'informational' as const,
        title: `${name} elected a new Pod Lead`,
        contextText: winner ? `${winner.fullName} takes the lead for this term.` : null,
        deepLink: '/pod',
        relatedEntityType: 'pod',
        relatedEntityId: podId,
      }));
    }

    // --- CLOU agreements (04) ---------------------------------------------
    case 'cloud.agreement_proposed': {
      const agreementId = event.aggregateId;
      if (!agreementId) return [];
      const agreement = await getAgreement(db, agreementId);
      if (!agreement) return [];
      // The counterparty is whoever the proposal is awaiting; tell their lead.
      const counterPodId = agreement.awaitingPodId ?? agreement.podBId;
      const leadId = await currentLeadId(db, counterPodId, today());
      if (!leadId) return [];
      return [
        {
          recipientUserId: leadId,
          triggerType: 'clou_proposal_received',
          urgency: 'action_required',
          title: 'A CLOU proposal needs your response',
          contextText: `${agreement.podAName} proposed an agreement with ${agreement.podBName}.`,
          deepLink: '/agreements',
          relatedEntityType: 'cloud_agreement',
          relatedEntityId: agreementId,
        },
      ];
    }

    case 'cloud.agreement_accepted':
    case 'cloud.agreement_declined':
    case 'cloud.agreement_countered': {
      const agreementId = event.aggregateId;
      if (!agreementId) return [];
      const agreement = await getAgreement(db, agreementId);
      if (!agreement || !agreement.createdByUserId) return [];
      const verb =
        event.type === 'cloud.agreement_accepted'
          ? 'accepted'
          : event.type === 'cloud.agreement_declined'
            ? 'declined'
            : 'sent back a counter-offer on';
      return [
        {
          recipientUserId: agreement.createdByUserId,
          triggerType: 'clou_response_received',
          urgency: 'informational',
          title: `Your agreement was ${verb}`,
          contextText: `${agreement.podAName} ↔ ${agreement.podBName}`,
          deepLink: '/agreements',
          relatedEntityType: 'cloud_agreement',
          relatedEntityId: agreementId,
        },
      ];
    }

    // --- Peer review (08) -------------------------------------------------
    case 'review.assigned': {
      const reviewId = event.aggregateId;
      if (!reviewId) return [];
      const review = await getReviewById(db, reviewId);
      if (!review) return [];
      const podId = await getPitchPodId(db, review.pitchId);
      const name = podId ? await podName(db, podId) : 'a pod';
      return [
        {
          recipientUserId: review.reviewerUserId,
          triggerType: 'review_assigned',
          urgency: 'action_required',
          title: 'You have been assigned a peer review',
          contextText: `Review ${name}'s pitch before the cycle closes.`,
          deepLink: '/review',
          relatedEntityType: 'peer_review',
          relatedEntityId: reviewId,
        },
      ];
    }

    case 'review.submitted': {
      // Tell the reviewed pod's lead that a score is in.
      const pitchId = event.aggregateId;
      if (!pitchId) return [];
      const podId = await getPitchPodId(db, pitchId);
      if (!podId) return [];
      const leadId = await currentLeadId(db, podId, today());
      if (!leadId) return [];
      const name = await podName(db, podId);
      return [
        {
          recipientUserId: leadId,
          triggerType: 'review_submitted',
          urgency: 'informational',
          title: `A peer review for ${name} was submitted`,
          contextText: 'Scores are in for this cycle.',
          deepLink: '/review',
          relatedEntityType: 'pitch',
          relatedEntityId: pitchId,
        },
      ];
    }

    // --- Budget (05) ------------------------------------------------------
    case 'budget.cycle_locked': {
      const recipients = await listUsersByOrg(db, orgId);
      return recipients.map((user) => ({
        recipientUserId: user.id,
        triggerType: 'budget_results_announced',
        urgency: 'informational' as const,
        title: 'Budget results announced',
        contextText: 'The allocatable budget for this cycle has been locked.',
        deepLink: '/budget/current-cycle',
        relatedEntityType: 'budget_cycle',
        relatedEntityId: event.aggregateId,
      }));
    }

    // --- Coaching (07) ----------------------------------------------------
    case 'coaching.session_scheduled': {
      const podId = payload.podId as UUID | undefined;
      if (!podId) return [];
      const name = await podName(db, podId);
      const members = await memberIds(db, podId);
      const coachId = payload.coachUserId as UUID | undefined;
      const recipients = new Set<UUID>(members);
      if (coachId) recipients.add(coachId);
      return [...recipients].map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'coaching_session_scheduled',
        urgency: 'informational' as const,
        title: `A coaching session was logged for ${name}`,
        contextText: null,
        deepLink: '/coaching/my-coach',
        relatedEntityType: 'coaching_session',
        relatedEntityId: event.aggregateId,
      }));
    }

    case 'coaching.pod_health_red': {
      const podId = payload.podId as UUID | undefined;
      if (!podId) return [];
      const coachId = await assignedCoachId(db, podId);
      if (!coachId) return [];
      const name = await podName(db, podId);
      return [
        {
          recipientUserId: coachId,
          triggerType: 'pod_health_red',
          urgency: 'action_required',
          title: `${name}'s health turned red`,
          contextText: 'The pod has been flagged at-risk. Consider a session or the accountability path.',
          deepLink: '/coaching/console',
          relatedEntityType: 'pod',
          relatedEntityId: podId,
        },
      ];
    }

    case 'coaching.reassignment_due': {
      const recipients = await hubCoachingUserIds(db, orgId);
      const podId = payload.podId as UUID | undefined;
      const name = podId ? await podName(db, podId) : 'a pod';
      return recipients.map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'coach_reassignment_due',
        urgency: 'action_required' as const,
        title: `${name} is due for a coach reassignment`,
        contextText: 'The rotation window for this assignment has been reached.',
        deepLink: '/hub/coaching-roster',
        relatedEntityType: 'pod',
        relatedEntityId: podId ?? null,
      }));
    }

    // --- Governance (08) --------------------------------------------------
    case 'governance.accountability_stage_advanced': {
      const podId = payload.podId as UUID | undefined;
      const caseId = event.aggregateId;
      if (!podId) return [];
      const name = await podName(db, podId);
      const members = await memberIds(db, podId);
      const coachId = await assignedCoachId(db, podId);
      const panel = caseId ? await listPanelMembers(db, caseId) : [];
      const recipients = new Set<UUID>(members);
      if (coachId) recipients.add(coachId);
      for (const member of panel) recipients.add(member.userId);
      return [...recipients].map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'accountability_stage_advanced',
        urgency: 'urgent' as const,
        title: `${name} advanced on the Accountability Path`,
        contextText: 'The accountability stage has changed — review what it means for the pod.',
        deepLink: '/pod',
        relatedEntityType: 'accountability_case',
        relatedEntityId: caseId ?? null,
      }));
    }

    case 'governance.panel_vote_requested': {
      const caseId = event.aggregateId;
      if (!caseId) return [];
      const panel = await listPanelMembers(db, caseId);
      return panel.map((member) => ({
        recipientUserId: member.userId,
        triggerType: 'panel_vote_requested',
        urgency: 'action_required' as const,
        title: 'Your panel vote is requested',
        contextText: 'A decision on this accountability case needs your vote and a reason.',
        deepLink: '/pod',
        relatedEntityType: 'accountability_case',
        relatedEntityId: caseId,
      }));
    }

    case 'governance.rule_change_proposed': {
      const recipients = await listUsersByOrg(db, orgId);
      const ruleName = payload.ruleName as string | undefined;
      return recipients.map((user) => ({
        recipientUserId: user.id,
        triggerType: 'rule_change_proposed',
        urgency: 'informational' as const,
        title: ruleName ? `Rule change proposed: ${ruleName}` : 'A rule change was proposed',
        contextText: 'Rule changes never take effect in the current cycle.',
        deepLink: '/dashboard',
        relatedEntityType: 'rule_change',
        relatedEntityId: event.aggregateId,
      }));
    }

    case 'governance.entry_trial_started': {
      const podId = (payload.podId as UUID) ?? event.aggregateId;
      if (!podId) return [];
      const name = await podName(db, podId);
      const recipients = await hubDeploymentUserIds(db, orgId);
      const members = await memberIds(db, podId);
      const all = new Set<UUID>([...recipients, ...members]);
      return [...all].map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'entry_trial_started',
        urgency: 'informational' as const,
        title: `${name} began its 90-day entry trial`,
        contextText: payload.dueDate ? `Decision due ${payload.dueDate}.` : null,
        deepLink: '/pod',
        relatedEntityType: 'entry_trial',
        relatedEntityId: (payload.trialId as UUID) ?? podId,
      }));
    }

    case 'governance.entry_trial_due': {
      const podId = payload.podId as UUID | undefined;
      if (!podId) return [];
      const name = await podName(db, podId);
      const recipients = await hubDeploymentUserIds(db, orgId);
      const members = await memberIds(db, podId);
      const all = new Set<UUID>([...recipients, ...members]);
      return [...all].map((recipientUserId) => ({
        recipientUserId,
        triggerType: 'entry_trial_decision_due',
        urgency: 'action_required' as const,
        title: `${name}'s entry-trial decision is due`,
        contextText: 'The 90-day window has closed — the Deployment Hub must record the decision.',
        deepLink: '/pod',
        relatedEntityType: 'entry_trial',
        relatedEntityId: (payload.trialId as UUID) ?? null,
      }));
    }

    // --- Strategic Hub (09) --------------------------------------------------
    // A pod born via the deployment wizard. Company X acting is org-visible —
    // the whole organisation gets the same informational row, so hub actions
    // never bypass the notification fabric the pods live in.
    case 'hub.pod_launched': {
      const podId = (payload.podId as UUID) ?? event.aggregateId;
      if (!podId) return [];
      const name = (payload.name as string) ?? (await podName(db, podId));
      const recipients = await listUsersByOrg(db, orgId);
      return recipients.map((user) => ({
        recipientUserId: user.id,
        triggerType: 'hub_pod_launched',
        urgency: 'informational' as const,
        title: `New pod launched: ${name}`,
        contextText: 'Launched from the Deployment Hub — entry trial and coach assigned from day one.',
        deepLink: '/pod',
        relatedEntityType: 'entry_trial',
        relatedEntityId: podId,
      }));
    }

    case 'hub.pilot_decision_recorded': {
      const decision = payload.decision as string | undefined;
      const pilotName = payload.name as string | undefined;
      const recipients = await listUsersByOrg(db, orgId);
      return recipients.map((user) => ({
        recipientUserId: user.id,
        triggerType: 'hub_pilot_decision_recorded',
        urgency: 'informational' as const,
        title: pilotName
          ? `Pilot "${pilotName}" decision recorded: ${decision}`
          : `Pilot decision recorded: ${decision}`,
        contextText:
          decision === 'expand'
            ? 'The next unit wizard is pre-filled in the Deployment Hub.'
            : null,
        deepLink: '/hub/pilots',
        relatedEntityType: 'pilot_program',
        relatedEntityId: event.aggregateId,
      }));
    }

    // --- Corrections (13 §7): an approved correction changes a locked number,
    // so the whole org is told — transparency covers the platform's own fixes.
    case 'correction.approved': {
      const field = payload.fieldCorrected as string | undefined;
      const entityType = payload.originalEntityType as string | undefined;
      const recipients = await listUsersByOrg(db, orgId);
      return recipients.map((user) => ({
        recipientUserId: user.id,
        triggerType: 'correction_approved',
        urgency: 'informational' as const,
        title: `Correction approved: ${field ?? 'field'} on ${entityType ?? 'record'}`,
        contextText: payload.reason ? String(payload.reason) : null,
        deepLink: '/hub/architecture',
        relatedEntityType: 'correction_record',
        relatedEntityId: (payload.correctionId as UUID) ?? event.aggregateId,
      }));
    }

    // --- Calendar day-windows (11): emitted by the scheduler sweep, not by a
    // user action. The `notified` flag on the reminder row keeps these
    // idempotent across ticks. ---
    case 'calendar.milestone_reached': {
      const milestoneType = payload.milestoneType as string;
      const cycleId = (payload.cycleId as UUID) ?? event.aggregateId;
      const n = cycleId ? await cycleNumberFor(db, cycleId) : null;
      const cycleLabel = n ? `Cycle ${n}` : 'This cycle';

      switch (milestoneType) {
        case 'pod_lead_rotation': {
          // Every pod member gets to vote — tell them the window is open.
          const podIds = await orgPodIds(db, orgId);
          const drafts: NotificationDraft[] = [];
          for (const podId of podIds) {
            const name = await podName(db, podId);
            for (const memberId of await memberIds(db, podId)) {
              drafts.push({
                recipientUserId: memberId,
                triggerType: 'pod_lead_rotation_window',
                urgency: 'action_required',
                title: `${name}: Pod Lead voting is open`,
                contextText: `${cycleLabel}'s rotation window has opened — cast your vote.`,
                deepLink: '/pod',
                relatedEntityType: 'pod',
                relatedEntityId: podId,
              });
            }
          }
          return drafts;
        }

        case 'pitch_open': {
          const podIds = await orgPodIds(db, orgId);
          const drafts: NotificationDraft[] = [];
          for (const podId of podIds) {
            const leadId = await currentLeadId(db, podId, today());
            if (!leadId) continue;
            const name = await podName(db, podId);
            drafts.push({
              recipientUserId: leadId,
              triggerType: 'pitch_window_opened',
              urgency: 'informational',
              title: `${name}: the pitch window is open`,
              contextText: `${cycleLabel}'s submission window has opened.`,
              deepLink: '/pod',
              relatedEntityType: 'pod',
              relatedEntityId: podId,
            });
          }
          return drafts;
        }

        case 'pitch_deadline': {
          // Urgent: an unsubmitted pitch will be auto-submitted.
          const podIds = await orgPodIds(db, orgId);
          const drafts: NotificationDraft[] = [];
          for (const podId of podIds) {
            const leadId = await currentLeadId(db, podId, today());
            if (!leadId) continue;
            const name = await podName(db, podId);
            drafts.push({
              recipientUserId: leadId,
              triggerType: 'pitch_auto_submit_warning',
              urgency: 'urgent',
              title: `${name}: pitch deadline — it will be auto-submitted`,
              contextText: 'Submit your pitch before the window closes or the draft on file is submitted for you.',
              deepLink: '/pod',
              relatedEntityType: 'pod',
              relatedEntityId: podId,
            });
          }
          return drafts;
        }

        case 'review_deadline': {
          // Urgent: only reviewers who still owe a score.
          if (!cycleId) return [];
          const reviewerIds = await pendingReviewerIds(db, cycleId);
          return reviewerIds.map((recipientUserId) => ({
            recipientUserId,
            triggerType: 'peer_review_due',
            urgency: 'urgent' as const,
            title: `${cycleLabel}: a peer review is due`,
            contextText: 'You have an outstanding review — scores must be in before the window closes.',
            deepLink: '/review',
            relatedEntityType: 'sprint_cycle',
            relatedEntityId: cycleId,
          }));
        }

        default:
          return [];
      }
    }

    default:
      return [];
  }
}

async function hubCoachingUserIds(db: Queryable, orgId: UUID): Promise<UUID[]> {
  return usersWithRole(db, orgId, 'hub_coaching');
}

async function hubDeploymentUserIds(db: Queryable, orgId: UUID): Promise<UUID[]> {
  return usersWithRole(db, orgId, 'hub_deployment');
}

async function usersWithRole(db: Queryable, orgId: UUID, roleType: string): Promise<UUID[]> {
  const rows = await db.query<{ user_id: UUID }>(
    `SELECT DISTINCT ra.user_id FROM role_assignment ra
      JOIN app_user u ON u.id = ra.user_id
     WHERE u.org_id = $1 AND ra.role_type = $2
       AND ra.start_date <= CURRENT_DATE
       AND (ra.end_date IS NULL OR ra.end_date >= CURRENT_DATE)`,
    [orgId, roleType],
  );
  return rows.rows.map((r) => r.user_id);
}

// ---------------------------------------------------------------------------
// Preferences + dispatch
// ---------------------------------------------------------------------------

/**
 * Whether a given (urgency, channel) is on for a user. Defaults: in-app always
 * on; email on for action/urgent, off for informational; digest on for
 * informational. Urgent in-app can never be turned off.
 */
export async function channelEnabled(
  db: Queryable,
  userId: UUID,
  urgency: NotificationUrgency,
  channel: 'in_app' | 'email' | 'digest',
): Promise<boolean> {
  if (urgency === 'urgent' && channel === 'in_app') return true; // never muted

  const prefs = await listPreferencesForUser(db, userId);
  const match = prefs.find((p) => p.urgencyLevel === urgency && p.channel === channel);
  if (match) return match.enabled;

  // Defaults.
  if (channel === 'in_app') return true;
  if (channel === 'email') return urgency !== 'informational';
  return urgency === 'informational'; // digest
}

/**
 * Delivers one event's notifications. Respects the in-app preference (an
 * informational item the user muted in-app is not written), but urgent items
 * always land in-app. Returns the number of rows written.
 */
export async function dispatchEvent(
  context: NotificationServiceContext,
  event: DomainEvent,
): Promise<number> {
  const drafts = await resolveNotificationDrafts(context, event);
  let written = 0;

  for (const draft of drafts) {
    const inApp = await channelEnabled(context.db, draft.recipientUserId, draft.urgency, 'in_app');
    if (!inApp) continue; // muted informational — the digest path handles the rest

    const created = await createNotification(context.db, {
      orgId: event.orgId!,
      recipientUserId: draft.recipientUserId,
      triggerType: draft.triggerType,
      urgency: draft.urgency,
      title: draft.title,
      contextText: draft.contextText ?? null,
      deepLink: draft.deepLink ?? null,
      relatedEntityType: draft.relatedEntityType ?? null,
      relatedEntityId: draft.relatedEntityId ?? null,
      sourceEventId: event.id,
    });
    if (created) written += 1;
  }

  return written;
}

/**
 * Wires the dispatcher onto a bus. Returns the unsubscribe function.
 *
 * The handler is awaited by the bus, so when `bus.publish` resolves the
 * notification rows for that event already exist — which is what lets the
 * caller (and the tests) treat "the action happened" and "the user was told"
 * as one transaction. Failures are logged, never allowed to break the action
 * that produced the event.
 */
export function subscribeNotificationDispatcher(
  bus: EventBus,
  context: NotificationServiceContext,
): () => void {
  return bus.subscribe('*', async (event) => {
    try {
      await dispatchEvent(context, event);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[notifications] failed to dispatch "${event.type}"`, error);
    }
  });
}

// ---------------------------------------------------------------------------
// Needs-Action truthfulness: an item clears only when its action is done.
// ---------------------------------------------------------------------------

/**
 * Returns true when the action behind a Needs-Action notification is actually
 * complete, by querying the related entity's live state. There is no dismissed
 * flag, so the Needs-Action list cannot lie.
 */
export async function isActionCompleted(
  db: Queryable,
  notification: Notification,
): Promise<boolean> {
  if (!notification.relatedEntityId) return false;

  switch (notification.triggerType) {
    case 'review_assigned': {
      const review = await getReviewById(db, notification.relatedEntityId);
      return Boolean(review?.submittedAt);
    }
    case 'clou_proposal_received': {
      const agreement = await getAgreement(db, notification.relatedEntityId);
      // No longer awaiting a response → handled (accepted/declined/countered).
      return agreement ? !agreement.awaitingPodId : true;
    }
    case 'pod_health_red': {
      // The pod's coach logging any session for the pod since counts as having
      // engaged; the underlying signal recompute is the coach's judgement.
      const podId = notification.relatedEntityId;
      const sessions = await db.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM coaching_session WHERE pod_id = $1',
        [podId],
      );
      return Number(sessions.rows[0]?.n ?? 0) > 0;
    }
    case 'panel_vote_requested': {
      const row = await db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM accountability_panel_member
          WHERE case_id = $1 AND vote IS NULL`,
        [notification.relatedEntityId],
      );
      return Number(row.rows[0]?.n ?? 0) === 0;
    }
    default:
      return false;
  }
}

/** Marks actioned any Needs-Action rows whose underlying action is now done. */
export async function sweepActionedNotifications(
  context: NotificationServiceContext,
  userId: UUID,
): Promise<void> {
  const { db } = context;
  const rows = await db.query<{ id: UUID; trigger_type: string; related_entity_id: UUID | null; related_entity_type: string | null; org_id: UUID; recipient_user_id: UUID; urgency: NotificationUrgency; title: string; context_text: string | null; deep_link: string | null; source_event_id: UUID | null; read_at: string | null; actioned_at: string | null; created_at: string }>(
    `SELECT * FROM notification
      WHERE recipient_user_id = $1 AND urgency IN ('action_required','urgent') AND actioned_at IS NULL`,
    [userId],
  );
  for (const row of rows.rows) {
    const notification: Notification = {
      id: row.id,
      orgId: row.org_id,
      recipientUserId: row.recipient_user_id,
      triggerType: row.trigger_type,
      urgency: row.urgency,
      title: row.title,
      contextText: row.context_text,
      deepLink: row.deep_link,
      relatedEntityType: row.related_entity_type,
      relatedEntityId: row.related_entity_id,
      sourceEventId: row.source_event_id,
      readAt: row.read_at,
      actionedAt: row.actioned_at,
      createdAt: row.created_at,
    };
    if (await isActionCompleted(db, notification)) {
      await markNotificationActioned(db, notification.id);
    }
  }
}
