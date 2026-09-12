/**
 * Phase 1 integration tests: Sprint Calendar (06) and Pods & Teams (03).
 *
 * The roadmap's Phase 1 definition of done explicitly requires testing that
 * "the server rejecting a submission attempt outside that window (test this
 * explicitly, not just via disabled buttons)". That is what the `window_closed`
 * assertions below are for — they call the API directly, bypassing any UI.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createTestDatabase, type TestWorld } from '../helpers/test-db';
import { seedFixtureWorld, type FixtureWorld } from '../helpers/fixtures';
import { buildServer } from '../../server/index';
import { startCycle, updateCalendarConfig } from '../../server/services/calendar';
import type { Database } from '../../db/client';
import { addDays, todayISO } from '../../core/time';
import { DEFAULT_PHASE_BOUNDARIES } from '../../core/calendar';

let db: Database;
let world: FixtureWorld;

/** The single cycle used by every test: it started 40 days before "today". */
const CYCLE_START = addDays(todayISO(), -40);
const TODAY = todayISO();

/** Day N of that cycle, as a real calendar date. */
const dayOfCycle = (day: number) => addDays(CYCLE_START, day - 1);

/** A self-contained org + cycle, for scenarios that mutate shared state. */
async function createTestWorld(): Promise<TestWorld> {
  const freshDb = await createTestDatabase();
  const freshWorld = await seedFixtureWorld(freshDb);
  await startCycle(freshDb, {
    orgId: freshWorld.orgId,
    holdingId: null,
    startDate: CYCLE_START,
  });
  return { db: freshDb, world: freshWorld, today: TODAY };
}

async function appAt(date: string): Promise<FastifyInstance> {
  const app = await buildServer({ db, runMigrations: false, logger: false, env: { TODAY: date } });
  await app.ready();
  return app;
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: { token: string } }>().data.token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedFixtureWorld(db);

  await startCycle(db, {
    orgId: world.orgId,
    holdingId: null,
    startDate: CYCLE_START,
  });
  // The fixture already seats Lena as Pod Lead of Pod Atlas for the year, which
  // is active today; the election test revokes it when seating the winner.
});

afterAll(async () => {
  await db.close();
});

describe('calendar phase resolution', () => {
  it('reports the current cycle day, phase and milestones', async () => {
    const app = await appAt(TODAY);
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: { day: number; cycleNumber: number; phase: { key: string }; milestones: unknown[] };
    }>().data;
    expect(body.cycleNumber).toBe(1);
    expect(body.day).toBe(41);
    expect(body.phase.key).toBe('execution');
    expect(body.milestones.length).toBe(5);
    await app.close();
  });

  it('resolves the phase for an arbitrary date', async () => {
    const app = await appAt(TODAY);
    const token = await login(app, 'mo@example.org');

    const dayEightyTwo = await app.inject({
      method: 'GET',
      url: `/api/calendar/phase?date=${dayOfCycle(82)}`,
      headers: bearer(token),
    });
    expect(dayEightyTwo.json<{ data: { day: number; phase: { key: string } } }>().data.phase.key).toBe(
      'pitch',
    );

    const dayNinety = await app.inject({
      method: 'GET',
      url: `/api/calendar/phase?date=${dayOfCycle(90)}`,
      headers: bearer(token),
    });
    expect(dayNinety.json<{ data: { phase: { key: string } } }>().data.phase.key).toBe('results');
    await app.close();
  });

  it('serves a downloadable .ics for a milestone', async () => {
    const app = await appAt(TODAY);
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: '/api/calendar/milestone.ics?index=1',
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.body).toContain('BEGIN:VCALENDAR');
    expect(response.body).toContain('Pitch window opens');
    await app.close();
  });
});

describe('calendar configuration', () => {
  it('refuses configuration changes from a non-hub role', async () => {
    const app = await appAt(TODAY);
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: '/api/calendar/config',
      headers: bearer(token),
      payload: { cycleLengthDays: 60 },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('versions a change and applies it from the next cycle only', async () => {
    const app = await appAt(TODAY);
    const token = await login(app, 'ari@example.org');

    const before = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });
    const boundariesBefore = before.json<{ data: { phaseBoundaries: { p3_end: number } } }>().data
      .phaseBoundaries;

    const response = await app.inject({
      method: 'POST',
      url: '/api/calendar/config',
      headers: bearer(token),
      payload: { cycleLengthDays: 60, phaseBoundaries: { p1_end: 2, p2_end: 50, p3_end: 55, p4_end: 58, p5_end: 60 } },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json<{ data: { effectiveFromCycleNumber: number } }>().data;
    expect(result.effectiveFromCycleNumber).toBe(2);

    // The cycle in flight is untouched — this is the rule that stops a mid-cycle
    // change from desynchronising the pitch and review windows.
    const during = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });
    expect(during.json<{ data: { phaseBoundaries: { p3_end: number } } }>().data.phaseBoundaries).toEqual(
      boundariesBefore,
    );
    expect(during.json<{ data: { day: number } }>().data.day).toBe(41);
    await app.close();
  });

  it('rejects boundaries that disagree with the cycle length', async () => {
    await expect(
      updateCalendarConfig(db, {
        orgId: world.orgId,
        cycleLengthDays: 90,
        phaseBoundaries: { p1_end: 3, p2_end: 80, p3_end: 85, p4_end: 88, p5_end: 95 },
      }),
    ).rejects.toThrow(/must equal cycle_length_days/);
  });

  it('extends the running cycle when pause days are added', async () => {
    // Pause days mutate the shared cycle, so this scenario runs on its own
    // database rather than shifting the day numbering of every later test.
    const isolated = await createTestWorld();
    try {
      const app = await buildServer({
        db: isolated.db,
        runMigrations: false,
        logger: false,
        env: { TODAY: isolated.today },
      });
      await app.ready();
      const token = await login(app, 'ari@example.org');

      const before = await app.inject({
        method: 'GET',
        url: '/api/calendar/current?scope=org',
        headers: bearer(token),
      });
      const endDateBefore = before.json<{ data: { cycleEndDate: string } }>().data.cycleEndDate;

      const response = await app.inject({
        method: 'POST',
        url: '/api/calendar/config',
        headers: bearer(token),
        payload: { pauseDays: [addDays(isolated.today, 1), addDays(isolated.today, 2)] },
      });
      expect(response.statusCode).toBe(200);

      const after = await app.inject({
        method: 'GET',
        url: '/api/calendar/current?scope=org',
        headers: bearer(token),
      });
      const body = after.json<{ data: { cycleEndDate: string; pauseDays: string[] } }>().data;
      expect(body.pauseDays.length).toBe(2);
      expect(body.cycleEndDate).toBe(addDays(endDateBefore, 2));
      await app.close();
    } finally {
      await isolated.db.close();
    }
  });
});

describe('weekly check-ins (Days 4–80)', () => {
  it('accepts a check-in during the execution window', async () => {
    const app = await appAt(dayOfCycle(41));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/checkins`,
      headers: bearer(token),
      payload: { body: 'Week 6: two enterprise proposals sent.', atRiskFlag: false },
    });
    expect(response.statusCode, response.body).toBe(201);
    const checkin = response.json<{ data: { weekNumber: number; body: string } }>().data;
    expect(checkin.weekNumber).toBe(6);
    await app.close();
  });

  it('rejects a check-in outside Days 4–80 with 409 window_closed', async () => {
    const app = await appAt(dayOfCycle(2)); // Day 2: rotation window
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/checkins`,
      headers: bearer(token),
      payload: { body: 'Too early.' },
    });
    expect(response.statusCode).toBe(409);
    const body = response.json<{ error: string; allowedDays: [number, number]; cycleDay: number }>();
    expect(body.error).toBe('window_closed');
    expect(body.allowedDays).toEqual([4, 80]);
    expect(body.cycleDay).toBe(2);
    await app.close();
  });

  it('rejects a check-in after Day 80 as well', async () => {
    const app = await appAt(dayOfCycle(83));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/checkins`,
      headers: bearer(token),
      payload: { body: 'Too late.' },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('refuses a check-in from someone outside the pod', async () => {
    const app = await appAt(dayOfCycle(41));
    const token = await login(app, 'quinn@example.org'); // member of Pod Basalt
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/checkins`,
      headers: bearer(token),
      payload: { body: 'Not my pod.' },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe('pitch window (Days 81–85)', () => {
  it('accepts a draft and a submission inside the window', async () => {
    const app = await appAt(dayOfCycle(82));
    const token = await login(app, 'lena@example.org'); // Pod Lead of Pod Atlas

    const cycle = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });
    const cycleId = cycle.json<{ data: { cycleId: string } }>().data.cycleId;

    const draft = await app.inject({
      method: 'PUT',
      url: `/api/pods/${world.podAId}/pitch/${cycleId}`,
      headers: bearer(token),
      payload: {
        previousSummary: 'Revenue up 12% against plan.',
        keyResults: [{ metric: 'New ARR', target: '400k', actual: '448k' }],
        nextPlan: 'Focus on the two enterprise accounts in week 10.',
      },
    });
    expect(draft.statusCode, draft.body).toBe(200);
    expect(draft.json<{ data: { status: string } }>().data.status).toBe('draft');

    const submit = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pitch/${cycleId}/submit`,
      headers: bearer(token),
    });
    expect(submit.statusCode, submit.body).toBe(200);
    const pitch = submit.json<{ data: { status: string; submittedAt: string | null } }>().data;
    expect(pitch.status).toBe('submitted');
    expect(pitch.submittedAt).toBeTruthy();
    await app.close();
  });

  it('rejects a submission outside Days 81–85 (the roadmap’s explicit test)', async () => {
    const app = await appAt(dayOfCycle(80));
    const token = await login(app, 'lena@example.org');
    const cycle = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });
    const cycleId = cycle.json<{ data: { cycleId: string } }>().data.cycleId;

    // Save a draft first so the rejection cannot be blamed on a missing pitch.
    const draft = await app.inject({
      method: 'PUT',
      url: `/api/pods/${world.podAId}/pitch/${cycleId}`,
      headers: bearer(token),
      payload: { previousSummary: 'Drafted early.' },
    });
    expect(draft.statusCode).toBe(409);

    const submit = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pitch/${cycleId}/submit`,
      headers: bearer(token),
    });
    expect(submit.statusCode).toBe(409);
    const body = submit.json<{ error: string; allowedDays: [number, number] }>();
    expect(body.error).toBe('window_closed');
    expect(body.allowedDays).toEqual([81, 85]);
    await app.close();
  });

  it('refuses a plain pod member submitting the pitch', async () => {
    const app = await appAt(dayOfCycle(82));
    const token = await login(app, 'mo@example.org'); // pod member, not lead
    const cycle = await app.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(token),
    });
    const cycleId = cycle.json<{ data: { cycleId: string } }>().data.cycleId;

    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pitch/${cycleId}/submit`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('auto-submits a draft left open after the Day-85 deadline', async () => {
    // Pod Basalt leaves a draft behind.
    const draftApp = await appAt(dayOfCycle(82));
    const leadToken = await login(draftApp, 'omar@example.org');
    const cycle = await draftApp.inject({
      method: 'GET',
      url: '/api/calendar/current?scope=org',
      headers: bearer(leadToken),
    });
    const cycleId = cycle.json<{ data: { cycleId: string } }>().data.cycleId;
    await draftApp.inject({
      method: 'PUT',
      url: `/api/pods/${world.podBId}/pitch/${cycleId}`,
      headers: bearer(leadToken),
      payload: { previousSummary: 'Basalt draft.' },
    });
    await draftApp.close();

    const afterDeadline = await appAt(dayOfCycle(86));
    const architect = await login(afterDeadline, 'ari@example.org');
    const job = await afterDeadline.inject({
      method: 'POST',
      url: '/api/calendar/jobs/auto-submit',
      headers: bearer(architect),
    });
    expect(job.statusCode).toBe(200);
    expect(job.json<{ data: { submitted: number } }>().data.submitted).toBeGreaterThan(0);

    const pitch = await afterDeadline.inject({
      method: 'GET',
      url: `/api/pods/${world.podBId}/pitch/${cycleId}`,
      headers: bearer(architect),
    });
    const data = pitch.json<{ data: { status: string; autoSubmitted: boolean } }>().data;
    expect(data.status).toBe('submitted');
    expect(data.autoSubmitted).toBe(true);
    await afterDeadline.close();
  });
});

describe('Pod Lead election (Days 1–3)', () => {
  it('accepts votes inside the rotation window and tallies them', async () => {
    const app = await appAt(dayOfCycle(2));
    const mo = await login(app, 'mo@example.org');
    const nadia = await login(app, 'nadia@example.org');

    for (const [token, candidate] of [
      [mo, world.users.lead!],
      [nadia, world.users.lead!],
    ] as Array<[string, string]>) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/pods/${world.podAId}/pod-lead-vote`,
        headers: bearer(token),
        payload: { candidateUserId: candidate },
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const election = await app.inject({
      method: 'GET',
      url: `/api/pods/${world.podAId}/election`,
      headers: bearer(mo),
    });
    const body = election.json<{
      data: { tally: Record<string, number>; tieBreakRule: string; winnerUserId: string };
    }>().data;
    expect(body.tally[world.users.lead!]).toBe(2);
    expect(body.tieBreakRule).toBe('longest_tenure');
    expect(body.winnerUserId).toBe(world.users.lead);
    await app.close();
  });

  it('rejects a vote outside the rotation window', async () => {
    const app = await appAt(dayOfCycle(9));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pod-lead-vote`,
      headers: bearer(token),
      payload: { candidateUserId: world.users.lead! },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ allowedDays: [number, number] }>().allowedDays).toEqual([1, 3]);
    await app.close();
  });

  it('refuses a vote from someone who is not in the pod', async () => {
    const app = await appAt(dayOfCycle(2));
    const token = await login(app, 'quinn@example.org'); // Pod Basalt
    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pod-lead-vote`,
      headers: bearer(token),
      payload: { candidateUserId: world.users.lead! },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('seats the winner with a time-boxed pod_lead role and a term record', async () => {
    const app = await appAt(dayOfCycle(3));
    const token = await login(app, 'lena@example.org'); // current lead convenes

    const response = await app.inject({
      method: 'POST',
      url: `/api/pods/${world.podAId}/pod-lead-election/finalize`,
      headers: bearer(token),
    });
    expect(response.statusCode, response.body).toBe(200);

    const { rows } = await db.query<{ role_type: string; start_date: string; end_date: string }>(
      `SELECT role_type, start_date, end_date FROM role_assignment
        WHERE user_id = $1 AND role_type = 'pod_lead' AND scope_id = $2
          AND revoked_at IS NULL
        ORDER BY start_date DESC`,
      [world.users.lead!, world.podAId],
    );
    // DATE columns may come back as a Date or a string depending on the driver.
    const iso = (value: unknown) =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const seated = rows.find((row) => row.end_date !== null && iso(row.start_date) === CYCLE_START);
    expect(seated).toBeDefined();
    // The seat expires at the end of the cycle — rotation, not permanence.
    expect(iso(seated!.end_date)).toBe(addDays(CYCLE_START, 89));
    await app.close();
  });
});

describe('cycle priorities (Days 1–3, Pod Lead only)', () => {
  it('lets the Pod Lead set priorities inside the window', async () => {
    const app = await appAt(dayOfCycle(2));
    const token = await login(app, 'lena@example.org');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/pods/${world.podAId}/priorities`,
      headers: bearer(token),
      payload: { priorities: ['Close the two enterprise accounts', 'Ship the Q3 report'] },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<{ data: string[] }>().data.length).toBe(2);
    await app.close();
  });

  it('rejects priorities outside the window', async () => {
    const app = await appAt(dayOfCycle(20));
    const token = await login(app, 'lena@example.org');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/pods/${world.podAId}/priorities`,
      headers: bearer(token),
      payload: { priorities: ['Too late'] },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('refuses a pod member setting priorities', async () => {
    const app = await appAt(dayOfCycle(2));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/pods/${world.podAId}/priorities`,
      headers: bearer(token),
      payload: { priorities: ['Not the lead'] },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe('pod history', () => {
  it('exports the pod’s cycle history as CSV', async () => {
    const app = await appAt(dayOfCycle(41));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/pods/${world.podAId}/history.csv`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain('cycle_id,status,submitted_at,auto_submitted');
    await app.close();
  });

  it('returns the pod overview payload with phase and members', async () => {
    const app = await appAt(dayOfCycle(41));
    const token = await login(app, 'mo@example.org');
    const response = await app.inject({
      method: 'GET',
      url: `/api/pods/${world.podAId}/overview`,
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: { pod: { name: string }; members: unknown[]; phase: { day: number } };
    }>().data;
    expect(body.pod.name).toBe('Pod Atlas');
    expect(body.members.length).toBe(3);
    expect(body.phase.day).toBe(41);
    await app.close();
  });
});
