/**
 * Seed the platform with a realistic demo organisation.
 *
 * Deliberately covers every persona in 01-INFORMATION-ARCHITECTURE.md §3 —
 * including a user with no active role, so the "no pod / no role" empty states
 * can be exercised — and every role type in the permission matrix.
 *
 * Dates are generated relative to today so the demo always shows a live cycle:
 * pod lead terms are 90 days and mid-flight, coach assignments sit inside their
 * 2–3 cycle rotation window.
 *
 *   npm run db:seed
 */

import { createDatabase } from './client';
import { migrate } from './migrate';
import { createHolding, createOrg, createUser } from './repositories/users';
import { addPodMember, createCheckin, createPod, createPodLeadTerm } from './repositories/pods';
import { assignRole } from './repositories/roles';
import { createCycleConfig, upsertGovernanceConfig } from './repositories/calendar';
import { insertOne, queryOne } from './client';
import {
  addConflictCaseEvent,
  assignReview,
  createConflictCase,
  listInsiderUserIds,
  listPeerValidatorUserIds,
  listTradingPartnerUserIds,
} from './repositories/review';
import {
  addPanelMember,
  createAccountabilityCase,
  getGovernanceSettings,
  createEntryTrial,
  markReductionApplied,
  setAccountabilityStage,
  setTrialRepresentative,
  updateGovernanceSettings,
} from './repositories/governance';
import { selectReviewers } from '../core/peer-review';
import { entryDecisionDueDate } from '../core/entry-trial';
import { createAgreement, insertAgreementEvent } from './repositories/agreements';
import type { CloudTerms } from '../core/types';
import { startCycle } from '../server/services/calendar';
import { DEFAULT_PHASE_BOUNDARIES } from '../core/calendar';
import { loadEnv } from '../server/config';
import { addDays, todayISO } from '../core/time';
import type { RoleType, ScopeType, UUID } from '../core/types';

const env = loadEnv();
const TODAY = todayISO();

/** Pod lead term length: 90 days, rotated by member vote (15-BUSINESS-RULES-APPENDIX.md). */
const TERM_DAYS = 90;

async function main(): Promise<void> {
  const db = await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR });
  try {
    await migrate(db);

    const existing = await db.query('SELECT id FROM org WHERE slug = $1', ['company-x']);
    if (existing.rows.length > 0) {
      /*
       * Deterministic re-seed: removing the org cascades to everything under it.
       *
       * One deliberate exception is needed. `audit_log` is append-only in the
       * running system (13-TECHNICAL-ARCHITECTURE.md §6) and its actor foreign
       * key cascades with SET NULL, which the append-only trigger refuses. This
       * is a local demo script, so the trigger is disabled for the duration of
       * the delete and restored immediately afterwards — the rows removed are
       * the previous demo organisation's own, never anyone else's history.
       */
      await db.exec('ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only');
      try {
        await db.query(
          `DELETE FROM audit_log
            WHERE actor_user_id IN (
              SELECT u.id FROM app_user u
                JOIN org o ON o.id = u.org_id
               WHERE o.slug = $1)`,
          ['company-x'],
        );
        await db.query('DELETE FROM org WHERE slug = $1', ['company-x']);
      } finally {
        await db.exec('ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only');
      }
      console.log('[seed] removed the previous demo organisation');
    }

    const org = await createOrg(db, { name: 'Company X', slug: 'company-x' });
    const pars = await createHolding(db, { orgId: org.id, name: 'Holding Pars', code: 'PRS' });
    const dena = await createHolding(db, { orgId: org.id, name: 'Holding Dena', code: 'DNA' });

    // Sprint cadence: this cycle started 40 days ago, so the demo sits inside
    // the Days 4–80 execution window.
    const cycleStart = addDays(TODAY, -40);

    await createCycleConfig(db, {
      orgId: org.id,
      holdingId: null,
      cycleLengthDays: 90,
      phaseBoundaries: { ...DEFAULT_PHASE_BOUNDARIES },
      effectiveFromCycleNumber: 1,
      note: 'Default 90-day cycle from the operating model',
    });
    await upsertGovernanceConfig(db, {
      orgId: org.id,
      tieBreakRule: 'longest_tenure',
      allowLeadReElection: false,
    });

    const cycle = await startCycle(db, {
      orgId: org.id,
      holdingId: null,
      startDate: cycleStart,
    });
    const termEnd = addDays(cycleStart, TERM_DAYS - 1);
    const coachEnd = addDays(TODAY, 120);
    const trialEnd = addDays(TODAY, 55);

    const atlas = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Atlas',
      categoryTag: 'Sales',
      status: 'active',
    });
    const basalt = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Basalt',
      categoryTag: 'Production',
      status: 'active',
    });
    const cinder = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Cinder',
      categoryTag: 'R&D',
      status: 'trial',
      trialEndDate: trialEnd,
    });
    const dune = await createPod(db, {
      holdingId: pars.id,
      name: 'Pod Dune',
      categoryTag: 'Operations',
      status: 'active',
    });
    const ember = await createPod(db, {
      holdingId: dena.id,
      name: 'Pod Ember',
      categoryTag: 'Growth',
      status: 'active',
    });

    const user = async (fullName: string, email: string) =>
      (await createUser(db, { orgId: org.id, email, fullName })).id;

    const lena = await user('Lena Lead', 'lena@example.org');
    const mo = await user('Mo Member', 'mo@example.org');
    const nadia = await user('Nadia Nine', 'nadia@example.org');
    const omar = await user('Omar Ops', 'omar@example.org');
    const petra = await user('Petra Prod', 'petra@example.org');
    const quinn = await user('Quinn QC', 'quinn@example.org');
    const rana = await user('Rana Research', 'rana@example.org');
    const sam = await user('Sam Solver', 'sam@example.org');
    const cora = await user('Cora Coach', 'cora@example.org');
    const ari = await user('Ari Architect', 'ari@example.org');
    const dan = await user('Dan Deploy', 'dan@example.org');
    const cass = await user('Cass Coaching', 'cass@example.org');
    const sana = await user('Sana Strategic', 'sana@example.org');
    const ilyas = await user('Ilyas Investor', 'ilyas@example.org');
    const hana = await user('Hana Holding', 'hana@example.org');
    const noor = await user('Noor Newcomer', 'noor@example.org');

    const memberships: Array<[UUID, UUID]> = [
      [atlas.id, lena],
      [atlas.id, mo],
      [atlas.id, nadia],
      [basalt.id, omar],
      [basalt.id, petra],
      [basalt.id, quinn],
      [cinder.id, rana],
      [dune.id, sam],
      [ember.id, hana],
    ];
    for (const [podId, userId] of memberships) {
      await addPodMember(db, { podId, userId, joinedAt: addDays(TODAY, -200) });
    }

    const role = (
      userId: UUID,
      roleType: RoleType,
      scopeType: ScopeType,
      scopeId: UUID | null,
      startDate = cycleStart,
      endDate: string | null = null,
    ) => assignRole(db, { userId, roleType, scopeType, scopeId, startDate, endDate });

    // Pod members (open-ended: membership has no rotation).
    for (const userId of [lena, mo, nadia]) await role(userId, 'pod_member', 'pod', atlas.id);
    for (const userId of [omar, petra, quinn]) await role(userId, 'pod_member', 'pod', basalt.id);
    await role(rana, 'pod_member', 'pod', cinder.id);
    await role(sam, 'pod_member', 'pod', dune.id);
    await role(hana, 'pod_member', 'pod', ember.id);

    // Rotating pod leads — 90-day terms, expiring mid-demo for one pod to show
    // the "ending soon" badge state.
    await role(lena, 'pod_lead', 'pod', atlas.id, cycleStart, termEnd);
    await role(omar, 'pod_lead', 'pod', basalt.id, cycleStart, addDays(TODAY, 9));
    await role(rana, 'pod_lead', 'pod', cinder.id, cycleStart, termEnd);
    await role(sam, 'pod_lead', 'pod', dune.id, cycleStart, termEnd);
    await role(hana, 'pod_lead', 'pod', ember.id, cycleStart, addDays(TODAY, 20));

    // Rotating coach across three pods (1 coach per 3–5 pods).
    await role(cora, 'coach', 'pod', atlas.id, addDays(TODAY, -30), coachEnd);
    await role(cora, 'coach', 'pod', basalt.id, addDays(TODAY, -30), coachEnd);
    await role(cora, 'coach', 'pod', cinder.id, addDays(TODAY, -30), coachEnd);

    // Company X hub roles (org-scoped, open-ended).
    await role(ari, 'hub_architecture', 'org', null, addDays(TODAY, -400));
    await role(dan, 'hub_deployment', 'org', null, addDays(TODAY, -400));
    await role(cass, 'hub_coaching', 'org', null, addDays(TODAY, -400));
    await role(sana, 'hub_strategic', 'org', null, addDays(TODAY, -400));

    // External / oversight roles.
    await role(ilyas, 'investor', 'holding', pars.id, addDays(TODAY, -300));
    await role(hana, 'holding_executive', 'holding', pars.id, addDays(TODAY, -300));

    // Pod Lead terms for this cycle — the rotation history the UI shows.
    for (const [podId, leadId] of [
      [atlas.id, lena],
      [basalt.id, omar],
      [cinder.id, rana],
    ] as Array<[UUID, UUID]>) {
      await createPodLeadTerm(db, {
        podId,
        cycleId: cycle.id,
        userId: leadId,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        voteTally: null,
      });
    }

    // A few weekly check-ins so the log is not empty.
    await createCheckin(db, {
      podId: atlas.id,
      cycleId: cycle.id,
      authorUserId: lena,
      weekNumber: 1,
      body: 'Pipeline review done; two enterprise proposals out for signature.',
    });
    await createCheckin(db, {
      podId: atlas.id,
      cycleId: cycle.id,
      authorUserId: lena,
      weekNumber: 2,
      body: 'Blocked on the data export from Pod Basalt — raised with our coach.',
      atRiskFlag: true,
    });
    await createCheckin(db, {
      podId: basalt.id,
      cycleId: cycle.id,
      authorUserId: omar,
      weekNumber: 2,
      body: 'Production line changeover completed two days ahead of plan.',
    });


    // -----------------------------------------------------------------------
    // CLOU agreements (Module 04)
    //
    // Seeded to cover every status the module can show — active, lapsed,
    // awaiting a response, countered and declined — and to leave two pods with
    // no agreement at all. The network graph must draw those two connected only
    // by the faint dotted line to the shared platform hub.
    // -----------------------------------------------------------------------
    const cloudEvent = (
      agreementId: UUID,
      eventType: import('../core/types').CloudEventType,
      actorUserId: UUID,
      terms: CloudTerms,
      note?: string,
    ) =>
      insertAgreementEvent(db, {
        agreementId,
        eventType,
        actorUserId,
        terms,
        note: note ?? null,
      });

    const telemetryTerms: CloudTerms = {
      name: 'Basalt → Atlas production telemetry',
      serviceDescription:
        'Weekly export of line-level production telemetry into the Atlas sales pipeline, including schema support whenever the metric set changes.',
      direction: 'b_to_a',
      cadence: 'recurring',
      frequency: 'monthly',
      pricingTerms: { model: 'fixed_fee', amount: '120 units', unit: null, notes: null },
    };

    const telemetry = await createAgreement(db, {
      orgId: org.id,
      podAId: atlas.id,
      podBId: basalt.id,
      terms: telemetryTerms,
      status: 'active',
      createdByUserId: lena,
      startDate: addDays(TODAY, -40),
      renewalDate: addDays(TODAY, 50),
      activatedAt: true,
    });
    await cloudEvent(telemetry.id, 'proposed', lena, telemetryTerms, 'Proposed to Pod Basalt');
    await cloudEvent(
      telemetry.id,
      'countered',
      omar,
      telemetryTerms,
      'Monthly rather than weekly — the export job is batch, not streaming',
    );
    await cloudEvent(telemetry.id, 'accepted', lena, telemetryTerms);

    // Lapsed: still "active" in the database, but its renewal date has passed,
    // so the list shows Expired and offers a renewal.
    const prototypesTerms: CloudTerms = {
      name: 'Cinder prototypes for Basalt line trials',
      serviceDescription:
        'Basalt runs one trial batch per quarter from Cinder prototypes and shares the measured yield back.',
      direction: 'a_to_b',
      cadence: 'recurring',
      frequency: 'quarterly',
      pricingTerms: { model: 'per_unit', amount: '6', unit: 'trial batch', notes: null },
    };
    const prototypes = await createAgreement(db, {
      orgId: org.id,
      podAId: basalt.id,
      podBId: cinder.id,
      terms: prototypesTerms,
      status: 'active',
      createdByUserId: omar,
      startDate: addDays(TODAY, -200),
      renewalDate: addDays(TODAY, -9),
      activatedAt: true,
    });
    await cloudEvent(prototypes.id, 'proposed', omar, prototypesTerms, 'Proposed to Pod Cinder');
    await cloudEvent(prototypes.id, 'accepted', rana, prototypesTerms);

    const qaTerms: CloudTerms = {
      name: 'Shared QA capacity for the pilot run',
      serviceDescription:
        'Cinder and Atlas share one QA engineer for the six-week pilot: Atlas covers weeks 1-3, Cinder weeks 4-6.',
      direction: 'bidirectional',
      cadence: 'one_time',
      frequency: null,
      pricingTerms: { model: 'other', amount: null, unit: null, notes: 'Barter — equal weeks each' },
    };
    const qaPool = await createAgreement(db, {
      orgId: org.id,
      podAId: atlas.id,
      podBId: cinder.id,
      terms: qaTerms,
      status: 'proposed',
      awaitingPodId: cinder.id,
      createdByUserId: lena,
    });
    await cloudEvent(qaPool.id, 'proposed', lena, qaTerms, 'Proposed to Pod Cinder');

    const dataTerms: CloudTerms = {
      name: 'Cinder → Basalt anomaly triage',
      serviceDescription:
        'Cinder triages Basalt sensor anomalies each Monday and returns a ranked list with suspected causes.',
      direction: 'a_to_b',
      cadence: 'recurring',
      frequency: 'weekly',
      pricingTerms: { model: 'fixed_fee', amount: '40 units', unit: null, notes: null },
    };
    const triage = await createAgreement(db, {
      orgId: org.id,
      podAId: cinder.id,
      podBId: basalt.id,
      terms: dataTerms,
      status: 'countered',
      awaitingPodId: cinder.id,
      createdByUserId: rana,
    });
    await cloudEvent(triage.id, 'proposed', rana, dataTerms, 'Proposed to Pod Basalt');
    await cloudEvent(
      triage.id,
      'countered',
      omar,
      { ...dataTerms, pricingTerms: { model: 'fixed_fee', amount: '55 units', unit: null, notes: null } },
      'Monday triage needs two engineers, not one',
    );

    const workshopTerms: CloudTerms = {
      name: 'Ember growth workshop for Atlas',
      serviceDescription:
        'Ember runs a one-day pricing workshop for the Atlas team, using its own launch data as the case material.',
      direction: 'b_to_a',
      cadence: 'one_time',
      frequency: null,
      pricingTerms: { model: 'fixed_fee', amount: '300 units', unit: null, notes: null },
    };
    const workshop = await createAgreement(db, {
      orgId: org.id,
      podAId: atlas.id,
      podBId: ember.id,
      terms: workshopTerms,
      status: 'declined',
      createdByUserId: lena,
    });
    await cloudEvent(workshop.id, 'proposed', lena, workshopTerms, 'Proposed to Pod Ember');
    await cloudEvent(
      workshop.id,
      'declined',
      hana,
      workshopTerms,
      'The launch data is under investor embargo until the next cycle',
    );

    // -----------------------------------------------------------------------
    // Peer review & governance (Module 08)
    //
    // Seeded so each of the three workflows has something real on screen:
    // a review queue with an assigned panel, a conflict case mid-mediation, a
    // trial unit counting down to Day 90, and an established pod at stage 4
    // with its panel constituted. The two tracks are seeded on two different
    // pods on purpose — the model forbids one pod being on both.
    // -----------------------------------------------------------------------

    // Peer Validator seats, each scoped to the pod the validator sits in. The
    // scope matters: it is what the permission check names, and it is what the
    // assignment rule reads when it excludes a reviewer's own pod, their
    // coach's pod, and any pod they trade with.
    for (const [userId, podScope] of [
      [mo, atlas.id],
      [petra, basalt.id],
      [quinn, basalt.id],
      [sam, dune.id],
      [hana, ember.id],
    ] as Array<[UUID, UUID]>) {
      await role(userId, 'peer_validator', 'pod', podScope, addDays(TODAY, -120));
    }

    // The Conflict Resolver seat: a neutral senior seat, held here by the
    // Coaching Hub lead rather than by anyone in the two pods involved.
    await role(cass, 'conflict_resolver', 'org', null, addDays(TODAY, -200));

    await updateGovernanceSettings(
      db,
      org.id,
      {
        accountabilityStage2ScoreThreshold: 50,
        accountabilityPanelSize: 3,
        accountabilityCorrectionDays: 30,
        reviewReviewersPerPitch: 2,
      },
      ari,
    );

    // --- Track 1: Pod Cinder is a trial unit, 35 days into its 90 ------------
    const trialStart = addDays(TODAY, -35);
    const cinderTrial = await createEntryTrial(db, {
      orgId: org.id,
      podId: cinder.id,
      startDate: trialStart,
      decisionDueDate: entryDecisionDueDate(trialStart),
      criteria: [
        { label: 'Completed at least one full pitch cycle', met: true },
        { label: 'Financial data successfully integrated', met: true },
        { label: 'No unresolved conflict cases', met: false },
        { label: 'Signed at least one CLOU with another pod', met: null },
      ],
    });
    // The pod's representative is whoever holds the Pod Lead seat today; the
    // hub's is the Deployment Hub.
    await setTrialRepresentative(db, cinderTrial.id, 'pod', rana);
    await setTrialRepresentative(db, cinderTrial.id, 'hub', dan);

    // --- Track 2: Pod Ember is at stage 4, with its panel constituted -------
    const emberCase = await createAccountabilityCase(db, { orgId: org.id, podId: ember.id });
    await setAccountabilityStage(db, emberCase.id, 'reduced_share', {
      triggerStage2At: new Date().toISOString(),
    });
    await markReductionApplied(db, emberCase.id);
    await setAccountabilityStage(db, emberCase.id, 'mediation');
    await setAccountabilityStage(db, emberCase.id, 'correction_period', {
      correctionStartDate: addDays(TODAY, -12),
      correctionEndDate: addDays(TODAY, 18),
      assignedCoachUserId: cora,
    });

    // The panel: three peers, never the pod under review.
    for (const [userId, label] of [
      [lena, 'Peer Pod Lead — Pod Atlas'],
      [omar, 'Peer Pod Lead — Pod Basalt'],
      [sam, 'Peer Pod Lead — Pod Dune'],
    ] as Array<[UUID, string]>) {
      await addPanelMember(db, emberCase.id, userId, label);
    }

    // A dispute between two pods that actually trade with each other.
    const qaCase = await createConflictCase(db, {
      orgId: org.id,
      podAId: atlas.id,
      podBId: basalt.id,
      resolverUserId: cass,
      subject: 'Who owns the shared QA queue?',
    });
    await addConflictCaseEvent(db, {
      caseId: qaCase.id,
      authorUserId: null,
      authorRole: 'system',
      body: `Case opened between Pod Atlas and Pod Basalt.`,
    });
    await addConflictCaseEvent(db, {
      caseId: qaCase.id,
      authorUserId: lena,
      authorRole: 'pod_a',
      body: 'The queue blocks our release train two days a week; we assumed Basalt owned it.',
    });
    await addConflictCaseEvent(db, {
      caseId: qaCase.id,
      authorUserId: omar,
      authorRole: 'pod_b',
      body: 'We only ever triaged it as a favour. It is not in any of our agreements.',
    });
    await addConflictCaseEvent(db, {
      caseId: qaCase.id,
      authorUserId: cass,
      authorRole: 'resolver',
      body: 'Neither CLOU mentions the QA queue, so this is a gap rather than a breach. Proposing a split by service once both pods confirm their release cadence.',
    });

    // --- Peer review: submitted pitches, panels assigned impartially --------
    const pitches: Array<[UUID, UUID, string]> = [
      [atlas.id, lena, 'Two enterprise pilots signed; expanding the outbound team.'],
      [basalt.id, omar, 'Changeover completed ahead of plan; next is the second line.'],
      [cinder.id, rana, 'First full cycle delivered; financial integration is live.'],
      [dune.id, sam, 'Onboarding playbook rewritten and handed to two new pods.'],
      [ember.id, hana, 'Growth experiments running; two channels show real traction.'],
    ];

    const validators = await listPeerValidatorUserIds(db, org.id, TODAY);
    const reviewersPerPitch = (await getGovernanceSettings(db, org.id)).reviewReviewersPerPitch;

    for (const [index, [podId, submittedBy, nextPlan]] of pitches.entries()) {
      const pitch = await insertOne<{ id: UUID }>(
        db,
        `INSERT INTO pitch (pod_id, cycle_id, status, previous_summary, next_plan, submitted_at, submitted_by)
         VALUES ($1, $2, 'submitted', $3, $4, now(), $5)
         RETURNING id`,
        [
          podId,
          cycle.id,
          'Delivered what we committed to last cycle.',
          nextPlan,
          submittedBy,
        ],
      );

      const insiders = await listInsiderUserIds(db, podId, TODAY);
      const partners = await listTradingPartnerUserIds(db, podId);
      // The seed rotates with the cycle *and* the pitch, so the same two people
      // do not end up reviewing every pod in the demo.
      const panel = selectReviewers({
        candidateUserIds: validators,
        excludedUserIds: [...new Set([...insiders, ...partners])],
        count: reviewersPerPitch,
        seed: cycle.cycleNumber * 7 + index,
      });
      for (const reviewerUserId of panel) {
        await assignReview(db, { cycleId: cycle.id, pitchId: pitch.id, reviewerUserId });
      }
    }

    // One review already submitted, so the queue shows the difference between
    // "in progress" and "submitted" — and the comments the pod receives.
    const atlasPitch = await queryOne<{ id: UUID }>(
      db,
      'SELECT id FROM pitch WHERE pod_id = $1 AND cycle_id = $2',
      [atlas.id, cycle.id],
    );
    if (atlasPitch) {
      const review = await queryOne<{ id: UUID }>(
        db,
        'SELECT id FROM peer_review WHERE pitch_id = $1 LIMIT 1',
        [atlasPitch.id],
      );
      if (review) {
        await db.query(
          `UPDATE peer_review
              SET score = 74, comments = $2, submitted_at = now()
            WHERE id = $1`,
          [
            review.id,
            'Both targets were met and the evidence is easy to follow in the dashboard. ' +
              'The one miss — the second enterprise pilot slipped a cycle — was flagged by the pod ' +
              'itself rather than buried, which is worth more than a clean-looking report. ' +
              'The next plan is realistic about capacity: one hire, one channel.',
          ],
        );
      }
    }

    // Noor has no role assignments: the platform must render a truthful
    // "no active role" empty state rather than letting her act anywhere.

    console.log(`[seed] organisation "${org.name}" ready (driver: ${db.driver})`);
    console.log(`[seed]   holdings: ${pars.name}, ${dena.name}`);
    console.log(
      `[seed]   pods: ${[atlas, basalt, cinder, dune, ember].map((p) => p.name).join(', ')}`,
    );
    console.log('[seed]   16 users, including one with no active role (noor@example.org)');
    console.log(
      `[seed]   cycle ${cycle.cycleNumber} started ${cycle.startDate}, ends ${cycle.endDate} (day ${40 + 1} of 90 today)`,
    );
    console.log(
      `[seed]   agreements: ${[telemetry, prototypes, qaPool, triage, workshop]
        .map((row) => `${row.name} (${row.status})`)
        .join('; ')}`,
    );
    console.log('[seed]   Pod Dune and Pod Ember have no agreement in force — the network graph');
    console.log('[seed]   draws them connected only through the shared platform hub.');
    console.log('[seed]   governance: Cinder on the 90-Day Entry Rule (day 35), Ember at stage 4');
    console.log('[seed]   with its panel constituted; one conflict case open for cass@example.org.');
    console.log('[seed] sign in with any @example.org address, e.g. lena@example.org (Pod Lead, Atlas)');
    console.log('[seed]   rana@example.org has two proposals waiting in the CLOU inbox.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
