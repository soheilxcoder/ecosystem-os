/**
 * Track 2 — Accountability & Dissolution Path.
 *
 * The rules that distinguish it from the Entry Rule: four sequential stages,
 * a data-triggered stage 2, and a decision made by a panel of at least three
 * people — never by one person.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACCOUNTABILITY_STAGES,
  CORRECTION_PERIOD_DAYS,
  MIN_PANEL_SIZE,
  STAGE_LABELS,
  STAGE_SUMMARIES,
  canAdvanceTo,
  canReturnTo,
  correctionEndDate,
  isAccountabilityStage,
  isCorrectionPeriodOver,
  isStage2Triggered,
  minPanelWarning,
  nextStage,
  panelQuorum,
  stageIndex,
  tallyPanelVotes,
  type PanelVoteRecord,
} from '../../core/accountability';

describe('the four stages are sequential', () => {
  it('run in the order the model specifies', () => {
    expect(ACCOUNTABILITY_STAGES).toEqual([
      'transparency',
      'reduced_share',
      'mediation',
      'correction_period',
    ]);
  });

  it('each stage has a label and an explanation a pod can read', () => {
    for (const stage of ACCOUNTABILITY_STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
      expect(STAGE_SUMMARIES[stage].length).toBeGreaterThan(20);
    }
  });

  it('advances one step at a time — no skipping', () => {
    expect(canAdvanceTo('transparency', 'reduced_share')).toBe(true);
    expect(canAdvanceTo('transparency', 'mediation')).toBe(false);
    expect(canAdvanceTo('reduced_share', 'mediation')).toBe(true);
    expect(canAdvanceTo('mediation', 'correction_period')).toBe(true);
    expect(canAdvanceTo('correction_period', 'transparency')).toBe(false);
  });

  it('the last stage has nowhere to go', () => {
    expect(nextStage('correction_period')).toBeNull();
    expect(nextStage('mediation')).toBe('correction_period');
  });

  it('a case can step back, but only one stage at a time', () => {
    expect(canReturnTo('mediation', 'reduced_share')).toBe(true);
    expect(canReturnTo('mediation', 'transparency')).toBe(false);
    expect(canReturnTo('transparency', 'reduced_share')).toBe(false);
  });

  it('property: a stage is only ever adjacent to the stages next to it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCOUNTABILITY_STAGES),
        fc.constantFrom(...ACCOUNTABILITY_STAGES),
        (from, to) => {
          const distance = stageIndex(to) - stageIndex(from);
          return canAdvanceTo(from, to) === (distance === 1) && canReturnTo(from, to) === (distance === -1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('stage 2 is triggered by data, not by a manager', () => {
  it('fires when the score drops below the configured threshold', () => {
    expect(isStage2Triggered(41, 50)).toBe(true);
    expect(isStage2Triggered(50, 50)).toBe(false);
    expect(isStage2Triggered(88, 50)).toBe(false);
  });

  it('never fires without a threshold or a score', () => {
    expect(isStage2Triggered(null, 50)).toBe(false);
    expect(isStage2Triggered(41, null)).toBe(false);
    expect(isStage2Triggered(null, null)).toBe(false);
  });

  it('property: the trigger is exactly "score < threshold"', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        (score, threshold) => {
          return isStage2Triggered(score, threshold) === (score !== null && threshold !== null && score < threshold);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('the 30-day correction period', () => {
  it('ends 30 days after it starts by default', () => {
    expect(CORRECTION_PERIOD_DAYS).toBe(30);
    expect(correctionEndDate('2026-05-01')).toBe('2026-05-31');
    expect(correctionEndDate('2026-05-01', 14)).toBe('2026-05-15');
  });

  it('is not over until the end date itself', () => {
    expect(isCorrectionPeriodOver('2026-05-31', '2026-05-30')).toBe(false);
    expect(isCorrectionPeriodOver('2026-05-31', '2026-05-31')).toBe(true);
    expect(isCorrectionPeriodOver('2026-05-31', '2026-06-02')).toBe(true);
  });
});

describe('the panel vote is never one person', () => {
  const votes = (...list: Array<PanelVoteRecord['vote']>): PanelVoteRecord[] =>
    list.map((vote, index) => ({ userId: `u${index}`, vote }));

  it('needs at least three people', () => {
    expect(MIN_PANEL_SIZE).toBe(3);
  });

  it('a quorum is a majority of the panel', () => {
    expect(panelQuorum(3)).toBe(2);
    expect(panelQuorum(4)).toBe(3);
    expect(panelQuorum(5)).toBe(3);
    expect(panelQuorum(9)).toBe(5);
  });

  it('cannot finalize until the quorum has voted', () => {
    expect(tallyPanelVotes(votes('dissolve', null, null)).canFinalize).toBe(false);
    expect(tallyPanelVotes(votes('dissolve', 'dissolve', null)).canFinalize).toBe(true);
  });

  it('waits for the outcome to be certain, not merely for the quorum', () => {
    // Two of three have voted, one each way: the third vote decides, so
    // counting now would silently throw a member's vote away.
    const split = tallyPanelVotes(votes('dissolve', 'continue', null));
    expect(split).toMatchObject({ cast: 2, quorum: 2, remaining: 1, canFinalize: false });
    expect(split.result).toBeNull();

    // Once the last vote is in, the panel has spoken.
    const settled = tallyPanelVotes(votes('dissolve', 'continue', 'continue'));
    expect(settled).toMatchObject({ remaining: 0, canFinalize: true, result: 'continue' });
  });

  it('finalizes early only when the remaining votes cannot change anything', () => {
    const doomed = tallyPanelVotes(votes('dissolve', 'dissolve', null));
    expect(doomed.remaining).toBe(1);
    expect(doomed.result).toBe('dissolve');

    const safe = tallyPanelVotes(votes('continue', 'continue', 'continue', null));
    expect(safe.result).toBe('continue');
  });

  it('dissolution needs a majority against continuing — the burden is on ending the unit', () => {
    expect(tallyPanelVotes(votes('dissolve', 'dissolve', 'continue')).result).toBe('dissolve');
    expect(tallyPanelVotes(votes('dissolve', 'continue', 'continue')).result).toBe('continue');
    expect(tallyPanelVotes(votes('continue', 'continue', 'continue')).result).toBe('continue');
    // A hung panel keeps the pod — and a two-person panel is not a panel.
    expect(tallyPanelVotes(votes('dissolve', 'continue', 'continue')).result).toBe('continue');
    expect(tallyPanelVotes(votes('dissolve', 'continue')).result).toBeNull();
  });

  it('reports the numbers a pod is entitled to see', () => {
    const tally = tallyPanelVotes(votes('dissolve', 'dissolve', 'continue'));
    expect(tally).toMatchObject({
      panelSize: 3,
      cast: 3,
      quorum: 2,
      continueVotes: 1,
      dissolveVotes: 2,
      canFinalize: true,
      result: 'dissolve',
    });
  });

  it('a panel of one or two people can never decide anything', () => {
    expect(tallyPanelVotes(votes('dissolve')).canFinalize).toBe(false);
    expect(tallyPanelVotes(votes('dissolve', 'dissolve')).canFinalize).toBe(false);
    expect(tallyPanelVotes(votes('dissolve', 'dissolve')).result).toBeNull();
  });

  it('warns while the panel is too small', () => {
    expect(minPanelWarning(0)).toMatch(/no panel members yet/i);
    expect(minPanelWarning(1)).toMatch(/1 panel member/);
    expect(minPanelWarning(2)).toMatch(/2 panel members/);
    expect(minPanelWarning(3)).toBeNull();
    expect(minPanelWarning(9)).toBeNull();
  });

  it('property: the result is null unless a majority of the panel voted to dissolve', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('continue', 'dissolve', null), { minLength: 1, maxLength: 11 }),
        (list) => {
          const tally = tallyPanelVotes(votes(...list));
          const expected = !tally.canFinalize
            ? null
            : tally.dissolveVotes > tally.continueVotes
              ? 'dissolve'
              : 'continue';
          return (tally.result ?? null) === expected;
        },
      ),
      { numRuns: 400 },
    );
  });

  it('property: the order people vote in never changes the outcome', () => {
    // The strongest guarantee a vote can have: shuffle the ballot and the
    // result is the same, because nothing is decided before it is certain.
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('continue', 'dissolve'), { minLength: 3, maxLength: 9 }),
        (ballot) => {
          const full = tallyPanelVotes(votes(...ballot));
          const orders = [ballot, [...ballot].reverse(), [...ballot].sort()];
          return orders.every((order) => {
            const tally = tallyPanelVotes(votes(...order));
            return tally.result === full.result && tally.dissolveVotes === full.dissolveVotes;
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: continuing is the default whenever dissolve falls short', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('continue', 'dissolve', null), { minLength: 3, maxLength: 11 }),
        (list) => {
          const tally = tallyPanelVotes(votes(...list));
          if (!tally.canFinalize) return tally.result === null;
          if (tally.dissolveVotes > tally.continueVotes) return tally.result === 'dissolve';
          return tally.result === 'continue';
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('stage validation', () => {
  it('accepts the four real stages and nothing else', () => {
    for (const stage of ACCOUNTABILITY_STAGES) expect(isAccountabilityStage(stage)).toBe(true);
    expect(isAccountabilityStage('appeal')).toBe(false);
    expect(isAccountabilityStage(null)).toBe(false);
    expect(isAccountabilityStage(3)).toBe(false);
  });
});
