/**
 * CLOU agreement domain logic (Module 04) — unit tests.
 *
 * These cover the two rules the module exists to enforce, without a database:
 *   - an agreement cannot exist without a described exchange
 *   - unrelated pods are never drawn as connected
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  CADENCE_LABELS,
  DIRECTION_LABELS,
  FREQUENCY_DAYS,
  HUB_NODE_ID,
  SERVICE_DESCRIPTION_MAX,
  computeAgreementGraph,
  computeRenewalDate,
  describeCadence,
  describePricing,
  displayStatus,
  isInForce,
  isInForceOn,
  nextAwaitingPod,
  nextRenewalDate,
  normaliseTerms,
  otherPodId,
  serviceFlow,
  statusAfterAction,
  validateCloudTerms,
  type GraphAgreement,
  type GraphPod,
} from '../../core/agreements';
import type { CloudAgreementStatus, CloudDirection } from '../../core/types';

const GUARDRAIL =
  'A CLOU requires a real, described exchange — this isn’t required for pods that don’t exchange services.';

const pod = (id: string, name: string, holdingId = `h-${id}`): GraphPod => ({
  id,
  name,
  holdingId,
  holdingName: `Holding ${holdingId}`,
  status: 'active',
});

const TODAY = '2026-09-12';

const agreement = (
  id: string,
  podAId: string,
  podBId: string,
  status: CloudAgreementStatus = 'active',
  direction: CloudDirection = 'a_to_b',
): GraphAgreement => ({
  id,
  podAId,
  podBId,
  name: `Agreement ${id}`,
  serviceDescription: 'Shared data pipeline maintenance',
  direction,
  status,
});

describe('validateCloudTerms', () => {
  it('refuses an agreement with no described exchange', () => {
    expect(validateCloudTerms({ serviceDescription: '' })).toMatchObject({
      ok: false,
      field: 'serviceDescription',
      message: GUARDRAIL,
    });
  });

  it('refuses a description made only of whitespace', () => {
    expect(validateCloudTerms({ serviceDescription: '   \n\t  ' }).ok).toBe(false);
  });

  it('requires a frequency only when the exchange recurs', () => {
    expect(
      validateCloudTerms({ serviceDescription: 'Monthly reporting pack', cadence: 'one_time' }).ok,
    ).toBe(true);
    expect(validateCloudTerms({ serviceDescription: 'Monthly reporting pack', cadence: 'recurring' })).toMatchObject({
      ok: false,
      field: 'frequency',
    });
    expect(
      validateCloudTerms({
        serviceDescription: 'Monthly reporting pack',
        cadence: 'recurring',
        frequency: 'monthly',
      }).ok,
    ).toBe(true);
  });

  it('rejects an unknown direction and an over-long description', () => {
    expect(validateCloudTerms({ serviceDescription: 'x'.repeat(10), direction: 'sideways' as never })).toMatchObject({
      ok: false,
      field: 'direction',
    });
    expect(
      validateCloudTerms({ serviceDescription: 'x'.repeat(SERVICE_DESCRIPTION_MAX + 1) }),
    ).toMatchObject({ ok: false, field: 'serviceDescription' });
    expect(validateCloudTerms({ serviceDescription: 'x'.repeat(SERVICE_DESCRIPTION_MAX) }).ok).toBe(true);
  });
});

describe('normaliseTerms', () => {
  it('trims text and drops the frequency of a one-time exchange', () => {
    const terms = normaliseTerms({
      name: '  Reporting pack  ',
      serviceDescription: '  Monthly reporting pack ',
      cadence: 'one_time',
      frequency: 'monthly',
      pricingTerms: { model: 'fixed_fee', amount: ' ', unit: 'month' },
    });
    expect(terms.name).toBe('Reporting pack');
    expect(terms.serviceDescription).toBe('Monthly reporting pack');
    expect(terms.frequency).toBeNull();
    expect(terms.pricingTerms).toEqual({ model: 'fixed_fee', amount: null, unit: 'month', notes: null });
  });
});

describe('status', () => {
  it('derives "expired" from a lapsed renewal date without mutating the record', () => {
    expect(
      displayStatus({ status: 'active', renewalDate: '2026-01-01' }, '2026-01-02'),
    ).toBe('expired');
    expect(displayStatus({ status: 'active', renewalDate: '2026-01-02' }, '2026-01-02')).toBe('active');
    expect(displayStatus({ status: 'active', renewalDate: null }, '2026-01-02')).toBe('active');
    expect(displayStatus({ status: 'renegotiating', renewalDate: '2020-01-01' }, '2026-01-02')).toBe(
      'renegotiating',
    );
  });

  it('treats an agreement under renegotiation as still in force', () => {
    expect(isInForce('active')).toBe(true);
    expect(isInForce('renegotiating')).toBe(true);
    expect(isInForce('proposed')).toBe(false);
    expect(isInForce('declined')).toBe(false);
  });

  it('maps each negotiation action to its status', () => {
    expect(statusAfterAction('accept')).toBe('active');
    expect(statusAfterAction('decline')).toBe('declined');
    expect(statusAfterAction('counter')).toBe('countered');
    expect(statusAfterAction('renegotiate')).toBe('renegotiating');
  });
});

describe('dates', () => {
  it('computes the first renewal date from the cadence', () => {
    expect(computeRenewalDate('2026-01-01', 'recurring', 'monthly')).toBe('2026-01-31');
    expect(computeRenewalDate('2026-01-01', 'recurring', 'weekly')).toBe('2026-01-08');
    expect(computeRenewalDate('2026-01-01', 'one_time', null)).toBeNull();
  });

  it('rolls a lapsed recurring agreement into the future', () => {
    expect(nextRenewalDate('2026-01-01', '2026-09-12', 'recurring', 'monthly')).toBe('2026-09-28');
    expect(nextRenewalDate(null, '2026-09-12', 'recurring', 'weekly')).toBe('2026-09-19');
    expect(nextRenewalDate('2026-01-01', '2026-09-12', 'one_time', null)).toBeNull();
  });

  it('never returns a renewal date in the past', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4000 }),
        fc.constantFrom(...(Object.keys(FREQUENCY_DAYS) as Array<keyof typeof FREQUENCY_DAYS>)),
        (offset, frequency) => {
          const today = '2026-06-15';
          const start = new Date(Date.UTC(2020, 0, 1) + offset * 86400000).toISOString().slice(0, 10);
          const next = nextRenewalDate(start, today, 'recurring', frequency);
          expect(next).not.toBeNull();
          expect(next! > today).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('negotiation flow', () => {
  const pods = { podAId: 'pod-a', podBId: 'pod-b' };

  it('hands the pen to the other pod, never back to the actor', () => {
    expect(otherPodId(pods, 'pod-a')).toBe('pod-b');
    expect(nextAwaitingPod(pods, 'pod-a', 'counter')).toBe('pod-b');
    expect(nextAwaitingPod(pods, 'pod-b', 'counter')).toBe('pod-a');
    expect(nextAwaitingPod(pods, 'pod-a', 'renegotiate')).toBe('pod-b');
  });

  it('settles the agreement on accept or decline', () => {
    expect(nextAwaitingPod(pods, 'pod-a', 'accept')).toBeNull();
    expect(nextAwaitingPod(pods, 'pod-a', 'decline')).toBeNull();
  });
});

describe('presentation helpers', () => {
  it('names the serving pod first', () => {
    expect(serviceFlow('a_to_b', 'Atlas', 'Basalt')).toMatchObject({
      fromName: 'Atlas',
      toName: 'Basalt',
      bidirectional: false,
    });
    expect(serviceFlow('b_to_a', 'Atlas', 'Basalt')).toMatchObject({
      fromName: 'Basalt',
      toName: 'Atlas',
    });
    expect(serviceFlow('bidirectional', 'Atlas', 'Basalt').bidirectional).toBe(true);
  });

  it('summarises pricing in one line', () => {
    expect(describePricing({ model: 'fixed_fee', amount: '250 units' })).toBe('Fixed fee of 250 units');
    expect(describePricing({ model: 'per_unit', amount: '3', unit: 'report' })).toBe('3 per report');
    expect(describePricing({ model: 'revenue_share', amount: '4%' })).toBe('Revenue share of 4%');
    expect(describePricing({ model: 'other', notes: 'Barter: two sprints of design' })).toBe(
      'Barter: two sprints of design',
    );
    expect(describePricing(null)).toBe('No internal transfer pricing set');
  });

  it('describes cadence and frequency', () => {
    expect(describeCadence('one_time', null)).toBe('One-time');
    expect(describeCadence('recurring', 'quarterly')).toBe('Recurring · quarterly');
    expect(CADENCE_LABELS.recurring).toBe('Recurring');
    expect(DIRECTION_LABELS.bidirectional).toBe('Bidirectional');
  });
});

describe('computeAgreementGraph', () => {
  const pods = [pod('a', 'Pod Atlas'), pod('b', 'Pod Basalt'), pod('c', 'Pod Cinder')];

  it('draws no direct edge when there is no agreement', () => {
    const graph = computeAgreementGraph({ pods, agreements: [], today: TODAY });
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes).toHaveLength(3);
    // ...but every pod is still linked to the shared platform hub.
    expect(graph.hubEdges).toHaveLength(3);
    expect(graph.nodes.filter((node) => node.agreementCount === 0)).toHaveLength(3);
    expect(graph.hub.id).toBe(HUB_NODE_ID);
  });

  it('connects only the two pods that have an agreement', () => {
    const graph = computeAgreementGraph({ pods, agreements: [agreement('ag-1', 'a', 'b')], today: TODAY });
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ fromPodId: 'a', toPodId: 'b', kind: 'active' });
    expect(graph.nodes.find((node) => node.id === 'c')?.agreementCount).toBe(0);
    expect(graph.nodes.find((node) => node.id === 'a')?.agreementCount).toBe(1);
    // Cinder remains on the canvas, reachable only through the hub.
    expect(graph.hubEdges.map((edge) => edge.podId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('points the arrow from the serving pod to the receiving pod', () => {
    const toB = computeAgreementGraph({
      pods,
      agreements: [agreement('ag-1', 'a', 'b', 'active', 'a_to_b')],
      today: TODAY,
    });
    expect(toB.edges[0]).toMatchObject({ fromPodId: 'a', toPodId: 'b', bidirectional: false });

    const toA = computeAgreementGraph({
      pods,
      agreements: [agreement('ag-1', 'a', 'b', 'active', 'b_to_a')],
      today: TODAY,
    });
    expect(toA.edges[0]).toMatchObject({ fromPodId: 'b', toPodId: 'a' });

    const both = computeAgreementGraph({ pods, agreements: [agreement('ag-1', 'a', 'b', 'active', 'bidirectional')], today: TODAY });
    expect(both.edges[0]).toMatchObject({ fromPodId: 'a', toPodId: 'b', bidirectional: true });
  });

  it('keeps an agreement under renegotiation on the canvas, flagged', () => {
    const graph = computeAgreementGraph({ pods, agreements: [agreement('ag-1', 'a', 'b', 'renegotiating')], today: TODAY });
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.kind).toBe('renegotiating');
  });

  it('drops a recurring agreement that has lapsed past its renewal date', () => {
    const lapsed: GraphAgreement = {
      ...agreement('ag-lapsed', 'a', 'b'),
      renewalDate: '2026-01-01',
    };
    const fresh: GraphAgreement = { ...agreement('ag-fresh', 'a', 'b'), renewalDate: '2026-12-01' };
    const graph = computeAgreementGraph({
      pods,
      agreements: [lapsed, fresh],
      today: TODAY,
    });
    expect(graph.edges.map((edge) => edge.agreementId)).toEqual(['ag-fresh']);
    expect(graph.nodes.find((node) => node.id === 'a')?.agreementCount).toBe(1);
  });

  it('draws nothing for a proposal that was never accepted', () => {
    for (const status of ['proposed', 'countered', 'declined', 'archived'] as CloudAgreementStatus[]) {
      const graph = computeAgreementGraph({
        pods,
        agreements: [agreement('ag-1', 'a', 'b', status)],
        today: TODAY,
      });
      expect(graph.edges, `status ${status} must not draw an edge`).toHaveLength(0);
    }
  });

  it('is deterministic and keeps every node inside the canvas', () => {
    const input = { pods, agreements: [agreement('ag-1', 'a', 'b')], today: TODAY };
    const first = JSON.stringify(computeAgreementGraph(input));
    const second = JSON.stringify(computeAgreementGraph(input));
    expect(first).toBe(second);

    const graph = computeAgreementGraph(input);
    const limit = graph.width / 2;
    for (const node of graph.nodes) {
      expect(Math.abs(node.x)).toBeLessThan(limit);
      expect(Math.abs(node.y)).toBeLessThan(limit);
    }
    for (const edge of graph.edges) {
      expect(edge.path.startsWith('M ')).toBe(true);
      expect(edge.path).toContain(' Q ');
    }
  });

  it('never invents an edge: property test over random pod graphs', () => {
    const podIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const podArb = fc
      .integer({ min: 1, max: podIds.length })
      .map((count) => podIds.slice(0, count).map((id) => pod(id, `Pod ${id.toUpperCase()}`)));

    // Agreements are generated *from* the chosen pods, so the property only
    // ever asks about pod pairs that exist on the canvas.
    const worldArb = podArb.chain((someBods) =>
      fc
        .array(
          fc.record({
            a: fc.integer({ min: 0, max: someBods.length - 1 }),
            b: fc.integer({ min: 0, max: someBods.length - 1 }),
            status: fc.constantFrom<CloudAgreementStatus>(
              'active',
              'renegotiating',
              'proposed',
              'archived',
            ),
          }),
          { maxLength: 8 },
        )
        .map((rows) => ({
          pods: someBods,
          agreements: rows
            .filter((row) => row.a !== row.b)
            // Index-based ids keep every agreement distinct, so the edge
            // count can be compared against the agreement count.
            .map((row, index) =>
              agreement(`ag-${index}`, someBods[row.a]!.id, someBods[row.b]!.id, row.status),
            ),
        })),
    );

    fc.assert(
      fc.property(worldArb, ({ pods: someBods, agreements: someAgreements }) => {
        const graph = computeAgreementGraph({
          pods: someBods,
          agreements: someAgreements,
          today: TODAY,
        });

        // The teaching rule: one shared-infrastructure link per pod, always.
        expect(graph.hubEdges).toHaveLength(someBods.length);

        // Every solid edge must correspond to a real, in-force agreement.
        const inForce = new Set(
          someAgreements.filter((item) => isInForceOn(item, TODAY)).map((item) => item.id),
        );
        expect(graph.edges.length).toBe(inForce.size);
        for (const edge of graph.edges) {
          expect(inForce.has(edge.agreementId)).toBe(true);
          const source = someAgreements.find((item) => item.id === edge.agreementId)!;
          const pair = new Set([source.podAId, source.podBId]);
          expect(pair.has(edge.fromPodId)).toBe(true);
          expect(pair.has(edge.toPodId)).toBe(true);
          expect(edge.fromPodId).not.toBe(edge.toPodId);
        }
      }),
      { numRuns: 150 },
    );
  });
});
