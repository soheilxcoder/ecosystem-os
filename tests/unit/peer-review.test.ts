/**
 * Peer review: assignment impartiality and the "a score without a comment is
 * not a review" rule.
 *
 * Module 08 is unusually blunt about both: the comments are what the reviewed
 * pod actually sees, and a reviewer must not be the pod's own member, its
 * coach, or anyone in a pod that trades with it.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  REVIEW_COMMENT_MIN_LENGTH,
  RUBRIC_QUESTIONS,
  averageScore,
  reviewStatus,
  selectReviewers,
  validateReviewInput,
  validateRubricAnswers,
  validateSubmission,
} from '../../core/peer-review';

const longComment = 'x'.repeat(REVIEW_COMMENT_MIN_LENGTH);
const shortComment = 'Good work.';

describe('a review needs a written justification', () => {
  it('refuses a submitted score with a short comment', () => {
    const result = validateSubmission({ score: 80, comments: shortComment });
    expect(result.ok).toBe(false);
    expect(result.field).toBe('comments');
    expect(result.message).toMatch(/at least 140 characters/);
  });

  it('accepts a submission once the comment is long enough', () => {
    expect(validateSubmission({ score: 80, comments: longComment }).ok).toBe(true);
  });

  it('refuses a submission with no score at all', () => {
    const result = validateSubmission({ score: null, comments: longComment });
    expect(result.ok).toBe(false);
    expect(result.field).toBe('score');
  });

  it('lets a draft be saved with a short or empty comment', () => {
    expect(validateReviewInput({ score: null, comments: null }).ok).toBe(true);
    expect(validateReviewInput({ score: 70, comments: 'WIP' }).ok).toBe(true);
  });

  it('bounds the score to 0–100', () => {
    expect(validateReviewInput({ score: -1, comments: longComment }).ok).toBe(false);
    expect(validateReviewInput({ score: 101, comments: longComment }).ok).toBe(false);
    expect(validateReviewInput({ score: 0, comments: longComment }).ok).toBe(true);
    expect(validateReviewInput({ score: 100, comments: longComment }).ok).toBe(true);
  });

  it('property: any comment shorter than the minimum is refused on submit', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: REVIEW_COMMENT_MIN_LENGTH - 1 }), (comments) => {
        return validateSubmission({ score: 50, comments }).ok === false;
      }),
      { numRuns: 200 },
    );
  });
});

describe('the rubric', () => {
  it('has at least one question and each is answerable', () => {
    expect(RUBRIC_QUESTIONS.length).toBeGreaterThan(0);
    for (const question of RUBRIC_QUESTIONS) {
      expect(question.label.length).toBeGreaterThan(0);
    }
  });

  it('accepts empty answers (a draft)', () => {
    expect(validateRubricAnswers(null).ok).toBe(true);
    expect(validateRubricAnswers({}).ok).toBe(true);
  });

  it('accepts valid answers', () => {
    expect(validateRubricAnswers({ targets_met: 'partially', plan_realistic: 4 }).ok).toBe(true);
  });

  it('refuses an option that is not on the list', () => {
    expect(validateRubricAnswers({ targets_met: 'sort of' }).ok).toBe(false);
  });

  it('refuses a scale answer outside 1–5', () => {
    expect(validateRubricAnswers({ plan_realistic: 6 }).ok).toBe(false);
    expect(validateRubricAnswers({ evidence_quality: 0 }).ok).toBe(false);
  });

  it('refuses something that is not an object', () => {
    expect(validateRubricAnswers([]).ok).toBe(false);
    expect(validateRubricAnswers('nope').ok).toBe(false);
  });
});

describe('review status', () => {
  it('is not started, in progress, or submitted', () => {
    expect(reviewStatus({ score: null, comments: null, rubricAnswers: null, submittedAt: null })).toBe(
      'not_started',
    );
    expect(reviewStatus({ score: 70, comments: null, rubricAnswers: null, submittedAt: null })).toBe(
      'in_progress',
    );
    expect(reviewStatus({ score: 70, comments: 'x', rubricAnswers: null, submittedAt: 'now' })).toBe(
      'submitted',
    );
  });

  it('counts a typed comment as progress even with no score yet', () => {
    expect(reviewStatus({ score: null, comments: '  half way  ', rubricAnswers: null, submittedAt: null })).toBe(
      'in_progress',
    );
  });
});

describe('impartial assignment', () => {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('picks the requested number of reviewers', () => {
    expect(selectReviewers({ candidateUserIds: candidates, excludedUserIds: [], count: 3, seed: 1 })).toHaveLength(
      3,
    );
  });

  it('never picks an excluded candidate', () => {
    const picked = selectReviewers({
      candidateUserIds: candidates,
      excludedUserIds: ['a', 'c', 'e'],
      count: 3,
      seed: 2,
    });
    expect(picked).toEqual(expect.arrayContaining(['b', 'd', 'f']));
    expect(picked.filter((id) => ['a', 'c', 'e'].includes(id))).toEqual([]);
  });

  it('never returns the same person twice', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (seed) => {
        const picked = selectReviewers({ candidateUserIds: candidates, excludedUserIds: [], count: 4, seed });
        return new Set(picked).size === picked.length;
      }),
      { numRuns: 300 },
    );
  });

  it('property: the panel is always a subset of the eligible pool', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 2, maxLength: 3 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 1, max: 6 }),
        (pool, seed, count) => {
          const excluded = pool.filter((_, index) => index % 2 === 0);
          const picked = selectReviewers({ candidateUserIds: pool, excludedUserIds: excluded, count, seed });
          return picked.every((id) => pool.includes(id) && !excluded.includes(id));
        },
      ),
      { numRuns: 400 },
    );
  });

  it('shrinks the panel rather than duplicating a reviewer when the pool is small', () => {
    expect(selectReviewers({ candidateUserIds: ['a', 'b'], excludedUserIds: [], count: 5, seed: 0 })).toEqual([
      'a',
      'b',
    ]);
    expect(
      selectReviewers({ candidateUserIds: ['a', 'b', 'c'], excludedUserIds: ['a', 'b', 'c'], count: 3, seed: 0 }),
    ).toEqual([]);
  });

  it('rotates the panel from one cycle to the next', () => {
    const cycle1 = selectReviewers({ candidateUserIds: candidates, excludedUserIds: [], count: 3, seed: 1 });
    const cycle2 = selectReviewers({ candidateUserIds: candidates, excludedUserIds: [], count: 3, seed: 2 });
    const cycle3 = selectReviewers({ candidateUserIds: candidates, excludedUserIds: [], count: 3, seed: 3 });

    // No two consecutive cycles should be chaired by the same leading reviewer.
    expect(cycle1[0]).not.toBe(cycle2[0]);
    expect(cycle2[0]).not.toBe(cycle3[0]);
  });

  it('is deterministic for a given cycle', () => {
    const once = selectReviewers({ candidateUserIds: candidates, excludedUserIds: ['a'], count: 3, seed: 7 });
    const twice = selectReviewers({ candidateUserIds: candidates, excludedUserIds: ['a'], count: 3, seed: 7 });
    expect(once).toEqual(twice);
  });
});

describe('averaging scores', () => {
  it('averages the submitted scores for the budget formula', () => {
    expect(averageScore([80, 90])).toBe(85);
    expect(averageScore([70, 80, 84])).toBe(78);
  });

  it('has nothing to average with no reviews', () => {
    expect(averageScore([])).toBeNull();
  });
});
