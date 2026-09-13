/**
 * The Module 08 invariant, tested the way 13-TECHNICAL-ARCHITECTURE.md §9 asks
 * for: property-based, not example-based.
 *
 * Point 3 of that section ranks the trial-vs-accountability state machines as
 * testing priority #3 and says "property-based tests that assert a pod can
 * never simultaneously be 'in trial' and 'in accountability' are worth the
 * investment". These are those tests.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  RULE_KEYS,
  RULE_REGISTRY,
  TRACK_LABELS,
  assertFutureCycle,
  canOpenAccountabilityCase,
  canOpenTrial,
  isRuleKey,
  trackFor,
  violatesTrackInvariant,
  type GovernanceSubject,
} from '../../core/governance';

const statuses = fc.constantFrom('trial', 'active', 'accountability', 'dissolved');

/** Any pod at all, including the states the model says are impossible. */
const anySubject = fc.record<GovernanceSubject>({
  podId: fc.uuid(),
  status: statuses,
  hasOpenTrial: fc.boolean(),
  hasOpenAccountability: fc.boolean(),
});

describe('which track a pod is on', () => {
  it('a pod with an open trial is on the entry track, whatever its status says', () => {
    expect(trackFor({ podId: 'p', status: 'active', hasOpenTrial: true, hasOpenAccountability: false })).toBe(
      'entry_trial',
    );
  });

  it('a pod with only an open case is on the accountability track', () => {
    expect(trackFor({ podId: 'p', status: 'active', hasOpenTrial: false, hasOpenAccountability: true })).toBe(
      'accountability',
    );
  });

  it('a pod with nothing open is on no track', () => {
    expect(trackFor({ podId: 'p', status: 'trial', hasOpenTrial: false, hasOpenAccountability: false })).toBe(
      'none',
    );
  });

  it('every track has a human label (no screen renders a raw enum)', () => {
    for (const track of ['entry_trial', 'accountability', 'none'] as const) {
      expect(TRACK_LABELS[track]).toBeTruthy();
    }
  });
});

describe('property: a pod is never on both tracks', () => {
  it('trackFor never produces two tracks at once', () => {
    fc.assert(
      fc.property(anySubject, (pod) => {
        const track = trackFor(pod);
        return (
          track === 'none' ||
          track === 'entry_trial' ||
          track === 'accountability'
        );
      }),
      { numRuns: 300 },
    );
  });

  it('the invariant predicate is exactly "both open"', () => {
    fc.assert(
      fc.property(anySubject, (pod) => {
        return violatesTrackInvariant(pod) === (pod.hasOpenTrial && pod.hasOpenAccountability);
      }),
      { numRuns: 300 },
    );
  });

  it('anything canOpenTrial / canOpenAccountabilityCase approves leaves a pod on at most one track', () => {
    // The property the services rely on: if a transition is allowed, applying it
    // produces a state that still satisfies the invariant — whichever of the two
    // it was, and whichever order they are attempted in.
    fc.assert(
      fc.property(anySubject, (pod) => {
        const before = violatesTrackInvariant(pod);
        if (before) return true; // an already-broken state is not this guard's problem

        const trialAllowed = canOpenTrial(pod);
        const caseAllowed = canOpenAccountabilityCase(pod);
        if (trialAllowed && caseAllowed) return false; // the guards must never both agree

        const afterTrial: GovernanceSubject = { ...pod, hasOpenTrial: true };
        const afterCase: GovernanceSubject = { ...pod, hasOpenAccountability: true };

        return (
          (!trialAllowed || !violatesTrackInvariant(afterTrial)) &&
          (!caseAllowed || !violatesTrackInvariant(afterCase))
        );
      }),
      { numRuns: 500 },
    );
  });

  it('a trial-status pod can never enter the accountability path, and vice versa', () => {
    fc.assert(
      fc.property(anySubject, (pod) => {
        return (
          !(canOpenTrial(pod) && pod.status !== 'trial') &&
          !(canOpenAccountabilityCase(pod) && pod.status === 'trial')
        );
      }),
      { numRuns: 300 },
    );
  });

  it('walking a random sequence of legal transitions never reaches a both-tracks state', () => {
    // Simulates the real life-cycle: open a case, close it, open the other one.
    const commands = fc.array(
      fc.constantFrom('open_trial', 'open_case', 'close_trial', 'close_case'),
      { maxLength: 25 },
    );

    fc.assert(
      fc.property(commands, (steps) => {
        let pod: GovernanceSubject = {
          podId: 'p',
          status: 'trial',
          hasOpenTrial: false,
          hasOpenAccountability: false,
        };

        for (const step of steps) {
          if (step === 'open_trial' && canOpenTrial(pod)) pod = { ...pod, hasOpenTrial: true };
          if (step === 'open_case' && canOpenAccountabilityCase(pod)) {
            pod = { ...pod, hasOpenAccountability: true };
          }
          if (step === 'close_trial') pod = { ...pod, hasOpenTrial: false };
          if (step === 'close_case') pod = { ...pod, hasOpenAccountability: false };
          if (step === 'open_case') pod = { ...pod, status: 'active' };

          if (violatesTrackInvariant(pod)) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('rule versioning is never retroactive', () => {
  it('accepts a cycle strictly after the current one', () => {
    expect(assertFutureCycle(5, 4)).toEqual({ ok: true });
    expect(assertFutureCycle(1, 0)).toEqual({ ok: true });
  });

  it('refuses the current cycle and anything before it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 0, max: 49 }), (current, back) => {
        const effective = current - back;
        if (effective < 1) return assertFutureCycle(effective, current).ok === false;
        return assertFutureCycle(effective, current).ok === false;
      }),
      { numRuns: 200 },
    );
  });

  it('refuses nonsense cycle numbers', () => {
    expect(assertFutureCycle(0, 3).ok).toBe(false);
    expect(assertFutureCycle(-2, 3).ok).toBe(false);
    expect(assertFutureCycle(2.5, 3).ok).toBe(false);
  });
});

describe('the rule registry', () => {
  it('has a definition for every key, and no keys without a definition', () => {
    expect(Object.keys(RULE_REGISTRY).sort()).toEqual([...RULE_KEYS].sort());
  });

  it('knows which keys are rules and which are not', () => {
    expect(isRuleKey('review.comment_min_length')).toBe(true);
    expect(isRuleKey('budget.formula_weights')).toBe(true);
    expect(isRuleKey('budget.formula_weights_evil')).toBe(false);
    expect(isRuleKey('')).toBe(false);
  });

  it('every rule says where it lives, so the history panel can show it', () => {
    for (const key of RULE_KEYS) {
      expect(['cycle_config', 'org_governance_config', 'recorded']).toContain(RULE_REGISTRY[key].source);
      expect(RULE_REGISTRY[key].label.length).toBeGreaterThan(0);
    }
  });

  it('the budget formula is only ever recorded, never applied by this module', () => {
    expect(RULE_REGISTRY['budget.formula_weights'].source).toBe('recorded');

    // The constitutional split, in the same shape and scale the budget screen
    // will read it in: whole percentages, summing to 100.
    const weights = RULE_REGISTRY['budget.formula_weights'].defaultValue as Record<string, number>;
    expect(weights).toEqual({ financial: 40, peer_review: 35, strategic: 25 });
    expect(Object.values(weights).reduce((sum, part) => sum + part, 0)).toBe(100);
  });
});
