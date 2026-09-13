/**
 * Peer review — assignment and scoring rules (Module 08, workflow 1).
 *
 * The impartiality rule is the point of this file: a reviewer may not be a
 * member of the pod being reviewed, a member of a pod that trades with it (an
 * active CLOU is a conflict of interest), or the pod's own coach. The
 * assignment is a pure, deterministic rotation so the same cycle always
 * produces the same panel and consecutive cycles turn the panel over.
 */

export const REVIEW_SCORE_MIN = 0;
export const REVIEW_SCORE_MAX = 100;

/** A bare number with no justification is not a review (Module 08). */
export const REVIEW_COMMENT_MIN_LENGTH = 140;

export const RUBRIC_QUESTIONS = [
  {
    key: 'targets_met',
    label: 'Did the pod meet its stated targets?',
    type: 'met',
    options: ['yes', 'partially', 'no'],
  },
  {
    key: 'plan_realistic',
    label: 'Is the next-period plan realistic?',
    type: 'scale',
    min: 1,
    max: 5,
  },
  {
    key: 'evidence_quality',
    label: 'How well are the results evidenced?',
    type: 'scale',
    min: 1,
    max: 5,
  },
] as const;

export type RubricQuestion = (typeof RUBRIC_QUESTIONS)[number];
export type RubricAnswers = Record<string, string | number>;

export type ReviewStatus = 'not_started' | 'in_progress' | 'submitted';

export interface ReviewLike {
  score: number | null;
  comments: string | null;
  rubricAnswers: RubricAnswers | null;
  submittedAt: string | null;
}

export function reviewStatus(review: ReviewLike): ReviewStatus {
  if (review.submittedAt) return 'submitted';
  if (review.score !== null || (review.comments ?? '').trim() !== '') return 'in_progress';
  return 'not_started';
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ReviewValidation {
  ok: boolean;
  field?: 'score' | 'comments' | 'rubric_answers';
  message?: string;
}

export function validateRubricAnswers(answers: unknown): ReviewValidation {
  if (answers === undefined || answers === null) return { ok: true };
  if (typeof answers !== 'object' || Array.isArray(answers)) {
    return { ok: false, field: 'rubric_answers', message: 'Rubric answers must be an object' };
  }
  const record = answers as Record<string, unknown>;
  for (const question of RUBRIC_QUESTIONS) {
    const value = record[question.key];
    if (value === undefined || value === null) continue;
    if (question.type === 'met') {
      if (typeof value !== 'string' || !(question.options as readonly string[]).includes(value)) {
        return {
          ok: false,
          field: 'rubric_answers',
          message: `“${question.label}” must be one of: ${question.options.join(', ')}`,
        };
      }
    } else {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric) || numeric < question.min || numeric > question.max) {
        return {
          ok: false,
          field: 'rubric_answers',
          message: `“${question.label}” must be a number between ${question.min} and ${question.max}`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Draft validation.
 *
 * A half-written review may be saved: the minimum length is a rule about
 * *submission*, because a reviewer who is interrupted should not lose their
 * work. Everything that would make the row meaningless (an out-of-range score,
 * a malformed rubric) is still refused.
 */
export function validateReviewInput(input: {
  score: number | null;
  comments: string | null;
  rubricAnswers?: unknown;
}): ReviewValidation {
  if (input.score !== null) {
    if (!Number.isFinite(input.score) || input.score < REVIEW_SCORE_MIN || input.score > REVIEW_SCORE_MAX) {
      return {
        ok: false,
        field: 'score',
        message: `Score must be a number between ${REVIEW_SCORE_MIN} and ${REVIEW_SCORE_MAX}`,
      };
    }
  }

  return validateRubricAnswers(input.rubricAnswers);
}

/** A submission (as opposed to a saved draft) needs every part filled in. */
export function validateSubmission(input: {
  score: number | null;
  comments: string | null;
  rubricAnswers?: unknown;
}): ReviewValidation {
  if (input.score === null) {
    return { ok: false, field: 'score', message: 'A review needs a score before it can be submitted' };
  }
  const comments = (input.comments ?? '').trim();
  if (comments.length < REVIEW_COMMENT_MIN_LENGTH) {
    return {
      ok: false,
      field: 'comments',
      message: `A submitted review needs at least ${REVIEW_COMMENT_MIN_LENGTH} characters of justification — a bare number tells the pod nothing`,
    };
  }
  return validateReviewInput(input);
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export interface AssignmentInput {
  /** Everyone who holds the Peer Validator seat for this cycle. */
  candidateUserIds: readonly string[];
  /**
   * Members of the target pod, members of pods with an active CLOU with it, and
   * the pod's coach — all excluded by Module 08's conflict-of-interest rule.
   */
  excludedUserIds: readonly string[];
  /** How many reviewers the org assigns per pitch. */
  count: number;
  /** Cycle number: rotating the starting offset turns the panel over each cycle. */
  seed: number;
}

/**
 * Pick the panel. Deterministic for a given (candidates, seed), rotates with the
 * cycle, and never returns an excluded user — if the eligible pool is smaller
 * than `count` the panel is simply smaller, because duplicating a reviewer
 * would be worse than having two.
 */
export function selectReviewers(input: AssignmentInput): string[] {
  const excluded = new Set(input.excludedUserIds);
  const eligible = [...new Set(input.candidateUserIds)]
    .filter((userId) => !excluded.has(userId))
    .sort();

  if (eligible.length === 0 || input.count <= 0) return [];
  if (input.count >= eligible.length) return eligible;

  const offset = Math.abs(Math.trunc(input.seed)) % eligible.length;
  const picked: string[] = [];
  for (let i = 0; i < Math.min(input.count, eligible.length); i += 1) {
    picked.push(eligible[(offset + i) % eligible.length]!);
  }
  return picked;
}

/** Average of submitted scores, for the budget formula's peer-review component. */
export function averageScore(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round((total / scores.length) * 100) / 100;
}
