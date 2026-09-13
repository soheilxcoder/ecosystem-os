/**
 * Module 08 integration tests: the three workflows, driven through the services
 * against a real database.
 *
 * What is being proven is not that the rows can be written, but that the rules
 * hold when someone tries to bend them:
 *   - a review cannot be submitted outside Days 86–88, or without a written
 *     justification, or twice
 *   - a reviewer is never the pod's own member, its coach, or a trading partner
 *   - the Entry Rule has no correction stage and needs both sides to agree
 *   - the Accountability Path cannot skip a stage and never ends in a
 *     single-person decision
 *   - a rule change can never take effect in the current cycle
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../db/client';
import { createTestDatabase, truncateAll } from '../helpers/test-db';
import { createHolding, createOrg, createUser } from '../../db/repositories/users';
import { addPodMember, createPod } from '../../db/repositories/pods';
import { assignRole } from '../../db/repositories/roles';
import { createCycle } from '../../db/repositories/calendar';
import { insertOne } from '../../db/client';
import { addDays } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';
import type { RoleType, ScopeType } from '../../core/types';
import { WindowClosedError } from '../../server/services/pods';
import {
  assignReviewersForCycle,
  escalateToRuleReview,
  getCase,
  getPitchReviews,
  getReviewQueue,
  logCaseEntry,
  openCase,
  recommendResolution,
  saveReview,
  type ReviewServiceContext,
} from '../../server/services/review';
import {
  advanceStage,
  castPanelVote,
  evaluateStage2Trigger,
  getAccountabilityView,
  getEntryTrialView,
  listRules,
  openAccountabilityCase,
  proposeRuleChange,
  recordEntryDecision,
  startEntryTrial,
  updateTrialCriteria,
  type GovernanceServiceContext,
} from '../../server/services/governance';
import { updateGovernanceSettings } from '../../db/repositories/governance';
import { createEventBus } from '../../core/events';

let db: Database;
let today: string;

const CYCLE_START = '2026-01-01';
/** A trial that starts on the cycle's first day is decided 90 days later. */
const TRIAL_START = CYCLE_START;
const TRIAL_DUE = '2026-04-01';
/** Cycle day `n` (Day 1 is the first day of the cycle). */
const day = (n: number): string => addDays(CYCLE_START, n - 1);

const CLOU_TERMS = {
  name: 'Basalt → Atlas telemetry',
  serviceDescription: 'Weekly export of production telemetry into the Atlas pipeline',
  direction: 'b_to_a' as const,
  cadence: 'recurring' as const,
  frequency: 'monthly' as const,
  pricingTerms: { model: 'fixed_fee' as const, amount: '120 units', unit: null, notes: null },
};

const LONG_COMMENT =
  'The pod hit both of its stated targets, evidenced them in the dashboard, and ' +
  'explained the one miss honestly rather than burying it. The next plan is ' +
  'ambitious but backed by the capacity they actually have this cycle.';

interface World {
  orgId: string;
  holdingId: string;
  pods: Record<string, string>;
  users: Record<string, string>;
  cycleId: string;
  pitches: Record<string, string>;
}

let world: World;

function reviewContext(): ReviewServiceContext {
  return { db, bus: createEventBus({ persist: async () => {} }), today: () => today };
}

function governanceContext(): GovernanceServiceContext {
  return { db, bus: createEventBus({ persist: async () => {} }), today: () => today };
}

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await truncateAll(db);
  today = day(87); // inside the peer-review window (Days 86–88)

  const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
  const holding = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });

  const pod = async (name: string, status: 'active' | 'trial' = 'active') =>
    (await createPod(db, { holdingId: holding.id, name, status })).id;

  const pods = {
    atlas: await pod('Pod Atlas'),
    basalt: await pod('Pod Basalt'),
    cinder: await pod('Pod Cinder'),
    ember: await pod('Pod Ember', 'trial'),
  };

  const makeUser = async (key: string, name: string) => [
    key,
    (await createUser(db, { orgId: org.id, email: `${key}@example.org`, fullName: name })).id,
  ] as const;

  const userEntries = await Promise.all([
    makeUser('atlasLead', 'Lena Lead'),
    makeUser('atlasMember', 'Mo Member'),
    makeUser('atlasCoach', 'Cora Coach'),
    makeUser('basaltLead', 'Omar Ops'),
    makeUser('basaltValidator', 'Vera Validator'),
    makeUser('cinderLead', 'Nadia Nine'),
    makeUser('cinderValidator', 'Wes Validator'),
    makeUser('emberLead', 'Eli Ember'),
    makeUser('emberValidator', 'Xu Validator'),
    makeUser('resolver', 'Rex Resolver'),
    makeUser('hub', 'Hana Hub'),
    makeUser('architect', 'Ari Architect'),
    makeUser('outsider', 'No Role Yet'),
  ]);
  const users = Object.fromEntries(userEntries);

  const role = (
    userId: string,
    roleType: RoleType,
    scopeType: ScopeType,
    scopeId: string | null,
  ) => assignRole(db, { userId, roleType, scopeType, scopeId, startDate: '2026-01-01' });

  const member = (podId: string, userId: string) =>
    addPodMember(db, { podId, userId, joinedAt: '2026-01-01' });

  await member(pods.atlas, users.atlasLead!);
  await member(pods.atlas, users.atlasMember!);
  await member(pods.atlas, users.atlasCoach!);
  await member(pods.basalt, users.basaltLead!);
  await member(pods.basalt, users.basaltValidator!);
  await member(pods.cinder, users.cinderLead!);
  await member(pods.cinder, users.cinderValidator!);
  await member(pods.ember, users.emberLead!);
  await member(pods.ember, users.emberValidator!);

  await role(users.atlasLead!, 'pod_member', 'pod', pods.atlas);
  await role(users.atlasLead!, 'pod_lead', 'pod', pods.atlas);
  await role(users.atlasMember!, 'pod_member', 'pod', pods.atlas);
  await role(users.atlasCoach!, 'coach', 'pod', pods.atlas);
  // The coach is also a certified validator — and still barred from reviewing
  // their own pod.
  await role(users.atlasCoach!, 'peer_validator', 'pod', pods.atlas);

  await role(users.basaltLead!, 'pod_member', 'pod', pods.basalt);
  await role(users.basaltLead!, 'pod_lead', 'pod', pods.basalt);
  await role(users.basaltValidator!, 'pod_member', 'pod', pods.basalt);
  await role(users.basaltValidator!, 'peer_validator', 'pod', pods.basalt);

  await role(users.cinderLead!, 'pod_member', 'pod', pods.cinder);
  await role(users.cinderLead!, 'pod_lead', 'pod', pods.cinder);
  await role(users.cinderValidator!, 'pod_member', 'pod', pods.cinder);
  await role(users.cinderValidator!, 'peer_validator', 'pod', pods.cinder);

  await role(users.emberLead!, 'pod_member', 'pod', pods.ember);
  await role(users.emberLead!, 'pod_lead', 'pod', pods.ember);
  await role(users.emberValidator!, 'pod_member', 'pod', pods.ember);
  await role(users.emberValidator!, 'peer_validator', 'pod', pods.ember);

  await role(users.resolver!, 'conflict_resolver', 'org', null);
  await role(users.hub!, 'hub_deployment', 'org', null);
  await role(users.architect!, 'hub_architecture', 'org', null);

  const cycle = await createCycle(db, {
    orgId: org.id,
    // Org-wide, so both org-level and pod-level lookups find the same calendar.
    holdingId: null,
    cycleNumber: 1,
    startDate: CYCLE_START,
    endDate: addDays(CYCLE_START, 89),
    phaseBoundaries: DEFAULT_PHASE_BOUNDARIES,
  });

  world = {
    orgId: org.id,
    holdingId: holding.id,
    pods,
    users: users as Record<string, string>,
    cycleId: cycle.id,
    pitches: {},
  };
});

async function submitPitch(podId: string, submittedBy: string): Promise<string> {
  return (
    await insertOne<{ id: string }>(
      db,
      `INSERT INTO pitch (pod_id, cycle_id, status, previous_summary, next_plan, submitted_at, submitted_by)
       VALUES ($1, $2, 'submitted', 'Last cycle we shipped the pilot.', 'Scale it to two customers.', now(), $3)
       RETURNING id`,
      [podId, world.cycleId, submittedBy],
    )
  ).id;
}

/**
 * An agreement in force between two pods.
 *
 * Inserted directly rather than through the proposal workflow: what these tests
 * care about is that a CLOU in force disqualifies its members from reviewing
 * the other side.
 */
async function activeAgreement(podAId: string, podBId: string, createdBy: string) {
  const row = await insertOne<{ id: string }>(
    db,
    `INSERT INTO cloud_agreement
       (org_id, pod_a_id, pod_b_id, name, service_description, direction, cadence,
        frequency, pricing_terms, status, created_by_user_id, start_date, activated_at)
     VALUES ($1, $2, $3, $4, $5, 'bidirectional', 'recurring', 'monthly', '{}'::jsonb,
             'active', $6, $7, now())
     RETURNING id`,
    [
      world.orgId,
      podAId,
      podBId,
      CLOU_TERMS.name,
      CLOU_TERMS.serviceDescription,
      createdBy,
      CYCLE_START,
    ],
  );
  return row.id;
}

// ===========================================================================
// Workflow 1 — Peer review
// ===========================================================================

describe('reviewer assignment is impartial', () => {
  it('never seats the pod’s own members, its coach, or a trading partner', async () => {
    // Atlas and Basalt trade with each other, so Basalt's validator is out.
    await activeAgreement(world.pods.atlas!, world.pods.basalt!, world.users.atlasLead!);
    const pitchId = await submitPitch(world.pods.atlas!, world.users.atlasLead!);
    const assignments = await assignReviewersForCycle(
      reviewContext(),
      world.orgId,
      world.cycleId,
    );

    const panel = assignments.find((item) => item.pitchId === pitchId)?.reviewerUserIds ?? [];
    expect(panel.length).toBeGreaterThan(0);
    // Nobody from Atlas, nobody from Basalt (CLOU), and not the Atlas coach.
    for (const excluded of [
      world.users.atlasLead,
      world.users.atlasMember,
      world.users.atlasCoach,
      world.users.basaltLead,
      world.users.basaltValidator,
    ]) {
      expect(panel).not.toContain(excluded);
    }
    expect(assignments[0]?.excludedCount).toBeGreaterThan(0);
  });

  it('is idempotent: a second run keeps the panel it already chose', async () => {
    await submitPitch(world.pods.atlas!, world.users.atlasLead!);
    const first = await assignReviewersForCycle(reviewContext(), world.orgId, world.cycleId);
    const second = await assignReviewersForCycle(reviewContext(), world.orgId, world.cycleId);
    expect(second.map((item) => item.reviewerUserIds)).toEqual(
      first.map((item) => item.reviewerUserIds),
    );
  });

  it('fills the panel with eligible validators when there are enough', async () => {
    await submitPitch(world.pods.atlas!, world.users.atlasLead!);
    const [assignment] = await assignReviewersForCycle(reviewContext(), world.orgId, world.cycleId);
    // Basalt's validator is not excluded when no CLOU exists.
    expect(assignment?.reviewerUserIds.length).toBe(3);
  });
});

describe('submitting a review', () => {
  let pitchId: string;
  let reviewerId: string;

  beforeEach(async () => {
    pitchId = await submitPitch(world.pods.atlas!, world.users.atlasLead!);
    await submitPitch(world.pods.cinder!, world.users.cinderLead!);
    const [assignment] = await assignReviewersForCycle(reviewContext(), world.orgId, world.cycleId);
    reviewerId = assignment!.reviewerUserIds[0]!;
  });

  it('is refused outside the Days 86–88 window', async () => {
    today = day(85); // still in the pitch window
    await expect(
      saveReview(reviewContext(), {
        pitchId,
        reviewerUserId: reviewerId,
        orgId: world.orgId,
        score: 80,
        comments: LONG_COMMENT,
        submit: true,
      }),
    ).rejects.toBeInstanceOf(WindowClosedError);
  });

  it('is refused without a written justification', async () => {
    await expect(
      saveReview(reviewContext(), {
        pitchId,
        reviewerUserId: reviewerId,
        orgId: world.orgId,
        score: 80,
        comments: 'Good',
        submit: true,
      }),
    ).rejects.toThrow(/at least 140 characters/);
  });

  it('is refused without a score', async () => {
    await expect(
      saveReview(reviewContext(), {
        pitchId,
        reviewerUserId: reviewerId,
        orgId: world.orgId,
        score: null,
        comments: LONG_COMMENT,
        submit: true,
      }),
    ).rejects.toThrow(/needs a score/);
  });

  it('is refused from someone who was never assigned', async () => {
    await expect(
      saveReview(reviewContext(), {
        pitchId,
        reviewerUserId: world.users.outsider!,
        orgId: world.orgId,
        score: 80,
        comments: LONG_COMMENT,
        submit: true,
      }),
    ).rejects.toThrow(/not assigned/);
  });

  it('accepts a score with a justification, and cannot be resubmitted', async () => {
    const first = await saveReview(reviewContext(), {
      pitchId,
      reviewerUserId: reviewerId,
      orgId: world.orgId,
      score: 82,
      comments: LONG_COMMENT,
      submit: true,
    });
    expect(first.status).toBe('submitted');

    await expect(
      saveReview(reviewContext(), {
        pitchId,
        reviewerUserId: reviewerId,
        orgId: world.orgId,
        score: 10,
        comments: LONG_COMMENT,
        submit: true,
      }),
    ).rejects.toThrow(/already been submitted/);
  });

  it('saves a draft at any time without the justification being finished', async () => {
    today = day(80);
    const draft = await saveReview(reviewContext(), {
      pitchId,
      reviewerUserId: reviewerId,
      orgId: world.orgId,
      score: 70,
      comments: 'Half way through reading',
      submit: false,
    });
    expect(draft.status).toBe('in_progress');
    expect(draft.review.submittedAt).toBeNull();
  });

  it('shows the reviewer their queue with the window state', async () => {
    const queue = await getReviewQueue(reviewContext(), reviewerId, world.orgId);
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.windowOpen).toBe(true);
    expect(queue.items[0]?.status).toBe('not_started');
  });

  it('a pod can read the reviews of its own pitch once they are in', async () => {
    await saveReview(reviewContext(), {
      pitchId,
      reviewerUserId: reviewerId,
      orgId: world.orgId,
      score: 82,
      comments: LONG_COMMENT,
      submit: true,
    });
    const summary = await getPitchReviews(reviewContext(), pitchId, world.orgId);
    expect(summary?.submittedCount).toBe(1);
    expect(summary?.average).toBe(82);
    expect(summary?.reviews[0]?.comments).toBe(LONG_COMMENT);
  });
});

// ===========================================================================
// Workflow 2 — Conflict resolution
// ===========================================================================

describe('conflict cases', () => {
  let caseId: string;

  beforeEach(async () => {
    const opened = await openCase(reviewContext(), {
      orgId: world.orgId,
      podAId: world.pods.atlas!,
      podBId: world.pods.basalt!,
      resolverUserId: world.users.resolver!,
      subject: 'Shared QA queue ownership',
      actorUserId: world.users.atlasLead!,
    });
    caseId = opened.id;
  });

  it('opens with a system entry naming both pods', async () => {
    const detail = await getCase(reviewContext(), caseId);
    expect(detail?.events[0]?.authorRole).toBe('system');
    expect(detail?.events[0]?.body).toMatch(/Pod Atlas/);
    expect(detail?.status).toBe('open');
  });

  it('only the assigned resolver can add a mediation note', async () => {
    await expect(
      logCaseEntry(reviewContext(), {
        caseId,
        actorUserId: world.users.atlasLead!,
        authorRole: 'resolver',
        body: 'Let us split the queue by service.',
        orgId: world.orgId,
      }),
    ).rejects.toThrow(/Only the assigned Conflict Resolver/);

    const logged = await logCaseEntry(reviewContext(), {
      caseId,
      actorUserId: world.users.resolver!,
      authorRole: 'resolver',
      body: 'Let us split the queue by service.',
      orgId: world.orgId,
    });
    expect(logged.events).toHaveLength(2);
  });

  it('only a member of a pod can add a statement on that pod’s behalf', async () => {
    await expect(
      logCaseEntry(reviewContext(), {
        caseId,
        actorUserId: world.users.emberLead!,
        authorRole: 'pod_a',
        body: 'We never agreed to that.',
        orgId: world.orgId,
      }),
    ).rejects.toThrow(/Only members of the pod/);

    const logged = await logCaseEntry(reviewContext(), {
      caseId,
      actorUserId: world.users.atlasMember!,
      authorRole: 'pod_a',
      body: 'We never agreed to that.',
      orgId: world.orgId,
    });
    expect(logged.events.at(-1)?.authorRole).toBe('pod_a');
  });

  it('a recommendation needs to be actionable and closes the case', async () => {
    await expect(
      recommendResolution(reviewContext(), {
        caseId,
        actorUserId: world.users.resolver!,
        orgId: world.orgId,
        text: 'Fix it.',
      }),
    ).rejects.toThrow(/at least 20 characters/);

    const resolved = await recommendResolution(reviewContext(), {
      caseId,
      actorUserId: world.users.resolver!,
      orgId: world.orgId,
      text: 'Split the QA queue by service: Atlas owns ingestion, Basalt owns reporting.',
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.recommendationText).toMatch(/Split the QA queue/);

    // A closed case is a record, not a conversation to be reopened.
    await expect(
      logCaseEntry(reviewContext(), {
        caseId,
        actorUserId: world.users.resolver!,
        authorRole: 'resolver',
        body: 'One more thought.',
        orgId: world.orgId,
      }),
    ).rejects.toThrow(/closed/);
  });

  it('a dispute about the rule itself escalates to a rule review', async () => {
    const escalated = await escalateToRuleReview(reviewContext(), {
      caseId,
      actorUserId: world.users.resolver!,
      orgId: world.orgId,
    });
    expect(escalated.status).toBe('escalated');
    expect(escalated.escalatedToRuleReview).toBe(true);
    expect(escalated.events.at(-1)?.body).toMatch(/rule review/);
  });

  it('only the resolver can escalate', async () => {
    await expect(
      escalateToRuleReview(reviewContext(), {
        caseId,
        actorUserId: world.users.atlasLead!,
        orgId: world.orgId,
      }),
    ).rejects.toThrow(/Only the assigned Conflict Resolver/);
  });
});

// ===========================================================================
// Workflow 3a — 90-Day Entry Rule
// ===========================================================================

describe('the 90-Day Entry Rule', () => {
  const podId = () => world.pods.ember!;

  it('starts on the entry date and is due 90 days later', async () => {
    const trial = await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
      criteria: [
        { label: 'Delivered the pilot', met: true },
        { label: 'Signed one CLOU', met: false },
      ],
    });
    expect(trial.decisionDueDate).toBe('2026-04-01');
    expect(trial.podRepUserId).toBe(world.users.emberLead);
    expect(trial.deploymentHubUserId).toBe(world.users.hub);
  });

  it('an established pod has no entry trial to start', async () => {
    await expect(
      startEntryTrial(governanceContext(), {
        podId: world.pods.atlas!,
        actorUserId: world.users.hub!,
      }),
    ).rejects.toThrow(/Only a pod in trial status/);
  });

  it('a trial pod cannot be put on the accountability path instead', async () => {
    await expect(
      openAccountabilityCase(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.hub!,
      }),
    ).rejects.toThrow(/established pod/);
  });

  it('tracks criteria as a checklist with no intermediate stages', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
      criteria: [
        { label: 'Delivered the pilot', met: true },
        { label: 'Signed one CLOU', met: false },
        { label: 'Not applicable here', met: null },
      ],
    });
    const view = await getEntryTrialView(governanceContext(), podId());
    expect(view.progress).toEqual({ total: 3, met: 1, outstanding: 1, notApplicable: 1 });
    // This track has no stages at all — that is what distinguishes it from the
    // Accountability Path, and the view type says so by not having them.
    expect('stages' in view).toBe(false);
  });

  it('the decision is locked until Day 90', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    today = day(60);

    const view = await getEntryTrialView(governanceContext(), podId());
    expect(view.day).toBe(59);
    expect(view.decisionUnlocked).toBe(false);
    expect(view.canRecord.pod).toBe(false);

    await expect(
      recordEntryDecision(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.emberLead!,
        side: 'pod',
        recommendation: 'join',
      }),
    ).rejects.toThrow(/unlocks on Day 90/);
  });

  it('one side alone is not a decision', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    today = TRIAL_DUE;

    const after = await recordEntryDecision(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.emberLead!,
      side: 'pod',
      recommendation: 'join',
    });
    expect(after.finalResult).toBeNull();

    const view = await getEntryTrialView(governanceContext(), podId());
    expect(view.podRep.recommendation).toBe('join');
    expect(view.jointResult).toBeNull();
  });

  it('both sides agreeing continues the unit', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    today = TRIAL_DUE;

    await recordEntryDecision(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.emberLead!,
      side: 'pod',
      recommendation: 'join',
    });
    const decided = await recordEntryDecision(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      side: 'hub',
      recommendation: 'join',
    });
    expect(decided.finalResult).toBe('full_entry');
    expect(decided.decidedAt).toBeTruthy();
  });

  it('one “do not continue” ends the unit immediately — no correction period', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    today = TRIAL_DUE;

    await recordEntryDecision(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.emberLead!,
      side: 'pod',
      recommendation: 'join',
    });
    const decided = await recordEntryDecision(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      side: 'hub',
      recommendation: 'discontinue',
    });
    expect(decided.finalResult).toBe('discontinued');

    // No appeal, no correction: the trial is closed for good.
    await expect(
      recordEntryDecision(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.emberLead!,
        side: 'pod',
        recommendation: 'join',
      }),
    ).rejects.toThrow(/No open Entry Trial/);
  });

  it('only the current Pod Lead speaks for the pod, and only the hub for the hub', async () => {
    await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    today = TRIAL_DUE;

    await expect(
      recordEntryDecision(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.atlasLead!,
        side: 'pod',
        recommendation: 'join',
      }),
    ).rejects.toThrow(/current Pod Lead/);

    await expect(
      recordEntryDecision(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.atlasLead!,
        side: 'hub',
        recommendation: 'join',
      }),
    ).rejects.toThrow(/Deployment Hub/);
  });

  it('criteria can be revised while the trial runs', async () => {
    const trial = await startEntryTrial(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    const updated = await updateTrialCriteria(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      criteria: [
        { label: 'Delivered the pilot', met: true },
        { label: 'Named a lead', met: true },
      ],
    });
    expect(updated.id).toBe(trial.id);
    const view = await getEntryTrialView(governanceContext(), podId());
    expect(view.progress?.met).toBe(2);
  });
});

// ===========================================================================
// Workflow 3b — Accountability & Dissolution Path
// ===========================================================================

describe('the Accountability Path', () => {
  const podId = () => world.pods.atlas!;

  async function toCorrectionPeriod(pod: string): Promise<void> {
    // Stage 2 fires on data, so the org has to have armed the threshold first.
    await updateGovernanceSettings(
      db,
      world.orgId,
      { accountabilityStage2ScoreThreshold: 50 },
      world.users.architect!,
    );
    await openAccountabilityCase(governanceContext(), { podId: pod, actorUserId: world.users.hub! });
    await evaluateStage2Trigger(governanceContext(), {
      podId: pod,
      actorUserId: world.users.hub!,
      score: 30,
    });
    await advanceStage(governanceContext(), {
      podId: pod,
      actorUserId: world.users.hub!,
      to: 'mediation',
    });
    await advanceStage(governanceContext(), {
      podId: pod,
      actorUserId: world.users.hub!,
      to: 'correction_period',
    });
  }

  it('opens at full transparency, which is already true for everyone', async () => {
    const opened = await openAccountabilityCase(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
    });
    expect(opened.currentStage).toBe('transparency');

    const view = await getAccountabilityView(governanceContext(), podId());
    expect(view.currentStageLabel).toMatch(/Full transparency/);
    expect(view.stages).toHaveLength(4);
    expect(view.stages.filter((stage) => stage.state === 'upcoming')).toHaveLength(3);
  });

  it('refuses to open a second case for the same pod', async () => {
    await openAccountabilityCase(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
    });
    await expect(
      openAccountabilityCase(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.hub!,
      }),
    ).rejects.toThrow(/already has an open Accountability Case/);
  });

  it('stage 2 is triggered by the score crossing the threshold, and is recorded', async () => {
    await updateGovernanceSettings(db, world.orgId, { accountabilityStage2ScoreThreshold: 50 }, world.users.architect!);

    const missed = await evaluateStage2Trigger(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      score: 72,
    });
    expect(missed.triggered).toBe(false);

    const hit = await evaluateStage2Trigger(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      score: 41,
    });
    expect(hit.triggered).toBe(true);

    const view = await getAccountabilityView(governanceContext(), podId());
    expect(view.stage).toBe('reduced_share');
    // The reduction is a tracked adjustment for Module 05, not a silent cut.
    expect(view.case_?.reductionApplied).toBe(true);
    expect(view.case_?.stage2TriggeredAt).toBeTruthy();
  });

  it('stages cannot be skipped', async () => {
    await openAccountabilityCase(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
    });
    await expect(
      advanceStage(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.hub!,
        to: 'mediation',
      }),
    ).rejects.toThrow(/sequential/);
  });

  it('the correction period runs for the configured number of days', async () => {
    await updateGovernanceSettings(
      db,
      world.orgId,
      { accountabilityCorrectionDays: 30, accountabilityStage2ScoreThreshold: 50 },
      world.users.architect!,
    );
    await openAccountabilityCase(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
    });
    await evaluateStage2Trigger(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      score: 30,
    });
    await advanceStage(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      to: 'mediation',
    });
    const view = await advanceStage(governanceContext(), {
      podId: podId(),
      actorUserId: world.users.hub!,
      to: 'correction_period',
    });
    expect(view.case_?.correctionStartDate).toBe(today);
    expect(view.case_?.correctionEndDate).toBe(addDays(today, 30));
    expect(view.case_?.correctionDaysRemaining).toBe(30);
  });

  it('constitutes a panel of peers — never one person', async () => {
    await toCorrectionPeriod(podId());
    const view = await getAccountabilityView(governanceContext(), podId());
    expect(view.panel.length).toBeGreaterThanOrEqual(3);
    // Nobody from the pod under review sits on its own panel.
    expect(view.panel.map((member) => member.userId)).not.toContain(world.users.atlasLead);
    expect(view.panelWarning).toBeNull();
  });

  it('only a panel member can vote, and only with a reason', async () => {
    await toCorrectionPeriod(podId());
    const view = await getAccountabilityView(governanceContext(), podId());
    const member = view.panel[0]!;

    await expect(
      castPanelVote(governanceContext(), {
        podId: podId(),
        actorUserId: world.users.outsider!,
        vote: 'dissolve',
        comment: 'This pod has not worked.',
      }),
    ).rejects.toThrow(/Only a member of the panel/);

    await expect(
      castPanelVote(governanceContext(), {
        podId: podId(),
        actorUserId: member.userId,
        vote: 'dissolve',
        comment: 'No.',
      }),
    ).rejects.toThrow(/short reason/);
  });

  it('a vote cannot be changed once cast', async () => {
    await toCorrectionPeriod(podId());
    const view = await getAccountabilityView(governanceContext(), podId());
    const member = view.panel[0]!;

    await castPanelVote(governanceContext(), {
      podId: podId(),
      actorUserId: member.userId,
      vote: 'continue',
      comment: 'The pod has a credible plan and a coach attached.',
    });
    await expect(
      castPanelVote(governanceContext(), {
        podId: podId(),
        actorUserId: member.userId,
        vote: 'dissolve',
        comment: 'On reflection, no.',
      }),
    ).rejects.toThrow(/already cast your vote/);
  });

  it('the pod continues when dissolve falls short of a majority', async () => {
    await toCorrectionPeriod(podId());
    const view = await getAccountabilityView(governanceContext(), podId());
    const [first, second, third] = view.panel;

    await castPanelVote(governanceContext(), {
      podId: podId(),
      actorUserId: first!.userId,
      vote: 'dissolve',
      comment: 'Two quarters below threshold and the plan is unchanged.',
    });
    await castPanelVote(governanceContext(), {
      podId: podId(),
      actorUserId: second!.userId,
      vote: 'continue',
      comment: 'The correction plan is credible and the coach is engaged.',
    });
    const final = await castPanelVote(governanceContext(), {
      podId: podId(),
      actorUserId: third!.userId,
      vote: 'continue',
      comment: 'Progress is real even if the score is not there yet.',
    });

    expect(final.tally).toMatchObject({ panelSize: 3, cast: 3, dissolveVotes: 1, continueVotes: 2 });
    expect(final.case_?.finalResult).toBe('continue');
    expect(final.case_?.decidedAt).toBeTruthy();

    // The decision is final — the case is no longer open.
    await expect(
      castPanelVote(governanceContext(), {
        podId: podId(),
        actorUserId: first!.userId,
        vote: 'dissolve',
        comment: 'Trying again after the result.',
      }),
    ).rejects.toThrow(/No open Accountability Case/);
  });

  it('the pod is dissolved when a majority of the panel votes to end it', async () => {
    await toCorrectionPeriod(world.pods.basalt!);
    const view = await getAccountabilityView(governanceContext(), world.pods.basalt!);
    const [first, second, third] = view.panel;

    await castPanelVote(governanceContext(), {
      podId: world.pods.basalt!,
      actorUserId: first!.userId,
      vote: 'dissolve',
      comment: 'No viable path back to the threshold after two cycles.',
    });
    const final = await castPanelVote(governanceContext(), {
      podId: world.pods.basalt!,
      actorUserId: second!.userId,
      vote: 'dissolve',
      comment: 'The correction period produced no measurable change.',
    });

    // Two of three is already a majority of the panel; the straggler does not
    // hold the decision hostage.
    expect(final.tally).toMatchObject({ cast: 2, quorum: 2, dissolveVotes: 2 });
    expect(final.case_?.finalResult).toBe('dissolve');
    expect(third).toBeDefined();
  });

  it('a trial pod has no accountability stages at all', async () => {
    await startEntryTrial(governanceContext(), {
      podId: world.pods.ember!,
      actorUserId: world.users.hub!,
      startDate: TRIAL_START,
    });
    await expect(
      advanceStage(governanceContext(), {
        podId: world.pods.ember!,
        actorUserId: world.users.hub!,
        to: 'mediation',
      }),
    ).rejects.toThrow(/Entry Rule track/);
  });
});

// ===========================================================================
// Rule versioning
// ===========================================================================

describe('rule changes', () => {
  it('can never take effect in the current cycle', async () => {
    await expect(
      proposeRuleChange(governanceContext(), {
        orgId: world.orgId,
        actorUserId: world.users.architect!,
        ruleName: 'review.comment_min_length',
        newValue: 200,
        justification: 'Longer comments help pods improve.',
        effectiveCycleNumber: 1,
      }),
    ).rejects.toThrow(/future cycle/);
  });

  it('records the old value alongside the new one', async () => {
    const change = await proposeRuleChange(governanceContext(), {
      orgId: world.orgId,
      actorUserId: world.users.architect!,
      ruleName: 'review.comment_min_length',
      newValue: 200,
      justification: 'Longer comments help pods improve.',
      effectiveCycleNumber: 2,
    });
    expect(change.oldValue).toBe(140);
    expect(change.newValue).toBe(200);
    expect(change.effectiveCycleNumber).toBe(2);
    expect(change.approvedAt).toBeNull();
  });

  it('refuses an unknown rule', async () => {
    await expect(
      proposeRuleChange(governanceContext(), {
        orgId: world.orgId,
        actorUserId: world.users.architect!,
        ruleName: 'governance.whatever',
        newValue: 1,
        justification: 'Because I said so, at length, for the record.',
        effectiveCycleNumber: 2,
      }),
    ).rejects.toThrow(/Unknown rule/);
  });

  it('refuses a justification nobody can act on', async () => {
    await expect(
      proposeRuleChange(governanceContext(), {
        orgId: world.orgId,
        actorUserId: world.users.architect!,
        ruleName: 'review.comment_min_length',
        newValue: 200,
        justification: 'Because.',
        effectiveCycleNumber: 2,
      }),
    ).rejects.toThrow(/justification/);
  });

  it('rejects weights that are spelled with the wrong component keys', async () => {
    await expect(
      proposeRuleChange(governanceContext(), {
        orgId: world.orgId,
        actorUserId: world.users.architect!,
        ruleName: 'budget.formula_weights',
        newValue: { evaluation: 40, peerReview: 35, valueDelivered: 25 },
        justification: 'Same numbers, wrong component names.',
        effectiveCycleNumber: 2,
      }),
    ).rejects.toThrow(/add up to 100/);
  });

  it('keeps the 40/35/25 formula intact — weights must add up to 100', async () => {
    await expect(
      proposeRuleChange(governanceContext(), {
        orgId: world.orgId,
        actorUserId: world.users.architect!,
        ruleName: 'budget.formula_weights',
        newValue: { financial: 60, peer_review: 20, strategic: 10 },
        justification: 'Rebalance towards self-evaluation for the next cycle.',
        effectiveCycleNumber: 2,
      }),
    ).rejects.toThrow(/add up to 100/);

    const ok = await proposeRuleChange(governanceContext(), {
      orgId: world.orgId,
      actorUserId: world.users.architect!,
      ruleName: 'budget.formula_weights',
      newValue: { financial: 40, peer_review: 35, strategic: 25 },
      justification: 'Restate the constitutional split in the rule history.',
      effectiveCycleNumber: 2,
    });
    expect(ok.ruleName).toBe('budget.formula_weights');
  });

  it('the registry shows every rule, its source and its history', async () => {
    await proposeRuleChange(governanceContext(), {
      orgId: world.orgId,
      actorUserId: world.users.architect!,
      ruleName: 'review.comment_min_length',
      newValue: 200,
      justification: 'Longer comments help pods improve.',
      effectiveCycleNumber: 2,
    });

    const rules = await listRules(governanceContext(), world.orgId);
    expect(rules.length).toBeGreaterThanOrEqual(10);
    const commentRule = rules.find((rule) => rule.key === 'review.comment_min_length');
    expect(commentRule?.history).toHaveLength(1);
    const formula = rules.find((rule) => rule.key === 'budget.formula_weights');
    expect(formula?.source).toBe('recorded');
  });
});
