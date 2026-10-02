/**
 * Payload shapes for the coaching endpoints (Module 07).
 *
 * These mirror the service's return types closely enough to render, and they
 * carry the one field that matters most: `PodVisibleSessionRow` has no
 * `privateNotes`, because a pod-facing payload never does.
 */

export type HealthColor = 'green' | 'amber' | 'red';

export interface HealthSignalPayload {
  id: string;
  podId: string;
  cycleId: string;
  signalColor: HealthColor;
  signalScore: number;
  scoreParts: {
    checkinReliability: number;
    peerReviewSentiment: number;
    budgetScoreTrend: number;
  };
  contributingFactors: {
    atRiskCheckins: number;
    checkins: number;
    atRiskRate: number;
    scoreTrend: number | null;
    reviewSentiment: number | null;
    sentimentAssumed: boolean;
    trendAssumed: boolean;
  };
  provenance: {
    checkinCycleNumber: number | null;
    sentimentCycleNumber: number | null;
    scoreCycleNumbers: [number, number] | null;
  } | null;
  formulaVersion: string;
  computedAt: string;
}

export interface ReassignmentPayload {
  cyclesWithPodSet: number;
  cyclesUntilReview: number;
  urgency: 'ok' | 'due' | 'overdue';
  startCycleNumber: number | null;
  reviewAtCycleNumber: number | null;
  reviewAround: string | null;
  reviewAroundIsEstimate: boolean;
}

/** The pod-facing session row — no private notes, by construction. */
export interface PodVisibleSessionRow {
  id: string;
  coachUserId: string;
  podId: string;
  occurredAt: string;
  sessionType: 'check_in' | 'conflict_support' | 'skill_development' | 'other';
  podVisibleSummary: string | null;
  sharedWithPod: boolean;
  createdAt: string;
}

export interface MyCoachSessionRow extends PodVisibleSessionRow {
  coachName: string | null;
}

export interface SessionRequestPayload {
  id: string;
  podId: string;
  coachUserId: string;
  requestedBy: string;
  topic: string;
  urgency: 'low' | 'normal' | 'high';
  preferredTimes: string | null;
  status: 'open' | 'scheduled' | 'declined';
  createdAt: string;
}

export interface MyCoachPayload {
  podId: string;
  podName: string;
  coach: {
    userId: string;
    fullName: string;
    email: string;
    schedulingUrl: string | null;
    coachingSinceDays: number | null;
    coachingSince: string | null;
  } | null;
  assignmentId: string | null;
  reassignment: ReassignmentPayload | null;
  sessions: MyCoachSessionRow[];
  requests: SessionRequestPayload[];
  health: HealthSignalPayload | null;
}

export interface ConsolePodCardPayload {
  podId: string;
  podName: string;
  holdingName: string;
  memberCount: number;
  health: HealthSignalPayload | null;
  lastSessionAt: string | null;
  lastSessionType: string | null;
  nextSessionAt: string | null;
  assignmentId: string;
  reassignment: ReassignmentPayload;
}

export interface CoachConsolePayload {
  coachUserId: string;
  coachName: string;
  profile: {
    schedulingUrl: string | null;
    capacity: 'comfortable' | 'stretched';
    capacityStatedAt: string | null;
  } | null;
  pods: ConsolePodCardPayload[];
  podCount: number;
  ratioWarning: string | null;
  suggestedRange: { min: number; max: number };
  flags: Array<{
    podId: string;
    podName: string;
    streak: number;
    threshold: number;
    history: HealthColor[];
  }>;
  openRequests: SessionRequestPayload[];
  cycleNumber: number | null;
}

/** A single session as the coach or Hub sees it — private notes included. */
export interface CoachSessionPayload extends PodVisibleSessionRow {
  orgId: string;
  privateNotes: string;
  requestId: string | null;
  updatedAt: string;
}

export interface SessionDetailPayload {
  session: PodVisibleSessionRow | CoachSessionPayload;
  includesPrivateNotes: boolean;
}

export interface RosterCoachRowPayload {
  coachUserId: string;
  fullName: string;
  email: string;
  profile: { schedulingUrl: string | null; capacity: 'comfortable' | 'stretched'; capacityStatedAt: string | null } | null;
  capacity: 'comfortable' | 'stretched';
  capacityStale: boolean;
  pods: Array<{ podId: string; podName: string; assignmentId: string; startCycleNumber: number | null }>;
  podCount: number;
  ratioWarning: string | null;
  nextReview: ReassignmentPayload | null;
  cyclesUntilMandatoryReview: number | null;
}

export interface RosterPayload {
  coaches: RosterCoachRowPayload[];
  pods: Array<{
    podId: string;
    podName: string;
    holdingName: string;
    coachUserId: string | null;
    coachName: string | null;
    assignmentId: string | null;
    health: HealthSignalPayload | null;
    reassignment: ReassignmentPayload | null;
  }>;
  suggestedRange: { min: number; max: number };
  benchmarks: Array<{ label: string; value: string; note: string }>;
  reviewDue: Array<{ podId: string; podName: string; coachUserId: string; reassignment: ReassignmentPayload }>;
  unassignedPods: string[];
}

/** Maps a health colour onto the design system's chip vocabulary. */
export function healthTone(color: HealthColor): 'good' | 'watch' | 'alert' {
  return color === 'green' ? 'good' : color === 'amber' ? 'watch' : 'alert';
}

export function healthLabel(color: HealthColor): string {
  return color === 'green' ? 'Healthy' : color === 'amber' ? 'Watch' : 'At risk';
}

export const SESSION_TYPE_LABELS: Record<string, string> = {
  check_in: 'Check-in',
  conflict_support: 'Conflict support',
  skill_development: 'Skill development',
  other: 'Other',
};

export function formatSessionDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
