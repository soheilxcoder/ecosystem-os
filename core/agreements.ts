/**
 * CLOU agreement domain logic — pure, side-effect free (Module 04).
 *
 * Everything here runs unchanged in the API service, in the Next.js server
 * components and in tests, which is what makes the two rules that matter
 * testable without a database:
 *
 *  1. **No exchange, no agreement.** `validateCloudTerms` is the same gate the
 *     wizard uses to keep [Continue] disabled and the API uses to reject a
 *     hand-crafted request (04-MODULE-CLOU-AGREEMENTS.md, Business logic).
 *  2. **Unrelated pods are not connected.** `computeAgreementGraph` derives the
 *     shared-infrastructure edges every time; they are never stored, so a pod
 *     can never be left wired to another pod after its agreement ends.
 */

import type { ISODate } from './time';
import { addDays, daysBetween } from './time';
import type {
  CloudAgreement,
  CloudAgreementStatus,
  CloudCadence,
  CloudDirection,
  CloudFrequency,
  CloudPricingTerms,
  CloudTerms,
  UUID,
} from './types';

export const SERVICE_DESCRIPTION_MIN = 3;
export const SERVICE_DESCRIPTION_MAX = 4000;
export const AGREEMENT_NAME_MAX = 140;

/** Days added to the start date for each recurring frequency. */
export const FREQUENCY_DAYS: Record<CloudFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  annual: 365,
};

export const FREQUENCY_LABELS: Record<CloudFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Twice a year',
  annual: 'Annually',
};

export const DIRECTION_LABELS: Record<CloudDirection, string> = {
  a_to_b: 'Pod A serves Pod B',
  b_to_a: 'Pod B serves Pod A',
  bidirectional: 'Bidirectional',
};

export const CADENCE_LABELS: Record<CloudCadence, string> = {
  one_time: 'One-time',
  recurring: 'Recurring',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TermsValidation {
  ok: boolean;
  /** Field name, so the UI can focus the offending input. */
  field?: keyof CloudTerms | 'pricingTerms';
  message?: string;
}

const OK: TermsValidation = { ok: true };

/**
 * The server-side gate. The wizard disables [Continue] using the same function,
 * but a client-side check is only a hint — this is the control.
 */
export function validateCloudTerms(terms: Partial<CloudTerms>): TermsValidation {
  const description = (terms.serviceDescription ?? '').trim();
  if (description.length < SERVICE_DESCRIPTION_MIN) {
    return {
      ok: false,
      field: 'serviceDescription',
      message:
        'A CLOU requires a real, described exchange — this isn’t required for pods that don’t exchange services.',
    };
  }
  if (description.length > SERVICE_DESCRIPTION_MAX) {
    return {
      ok: false,
      field: 'serviceDescription',
      message: `Keep the service description under ${SERVICE_DESCRIPTION_MAX} characters.`,
    };
  }

  const name = (terms.name ?? '').trim();
  if (name.length > AGREEMENT_NAME_MAX) {
    return {
      ok: false,
      field: 'name',
      message: `Keep the agreement name under ${AGREEMENT_NAME_MAX} characters.`,
    };
  }

  if (terms.direction && !['a_to_b', 'b_to_a', 'bidirectional'].includes(terms.direction)) {
    return { ok: false, field: 'direction', message: 'Choose who serves whom.' };
  }

  if (terms.cadence === 'recurring' && !terms.frequency) {
    return { ok: false, field: 'frequency', message: 'Pick how often a recurring exchange renews.' };
  }

  return OK;
}

/** Normalises user input into storable terms (trimming, empty → null). */
export function normaliseTerms(terms: Partial<CloudTerms>): CloudTerms {
  const pricing: CloudPricingTerms = {
    model: terms.pricingTerms?.model ?? null,
    amount: emptyToNull(terms.pricingTerms?.amount),
    unit: emptyToNull(terms.pricingTerms?.unit),
    notes: emptyToNull(terms.pricingTerms?.notes),
  };

  return {
    name: (terms.name ?? '').trim(),
    serviceDescription: (terms.serviceDescription ?? '').trim(),
    direction: terms.direction ?? 'a_to_b',
    cadence: terms.cadence ?? 'one_time',
    frequency: terms.cadence === 'recurring' ? (terms.frequency ?? null) : null,
    pricingTerms: pricing,
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The status vocabulary shown in the list view: Active / Under renegotiation /
 * Expired (04-MODULE-CLOU-AGREEMENTS.md, screen `/agreements/active`).
 *
 * `expired` is *derived*, not stored: an agreement whose renewal date has
 * passed still exists and can be renewed, so it must not be silently mutated
 * by a background job into a status nobody asked for.
 */
export type CloudDisplayStatus = CloudAgreementStatus | 'expired';

export function displayStatus(
  agreement: Pick<CloudAgreement, 'status' | 'renewalDate'>,
  today: ISODate,
): CloudDisplayStatus {
  if (agreement.status === 'active' && agreement.renewalDate && agreement.renewalDate < today) {
    return 'expired';
  }
  return agreement.status;
}

export const DISPLAY_STATUS_LABELS: Record<CloudDisplayStatus, string> = {
  proposed: 'Awaiting response',
  countered: 'Counter-proposed',
  declined: 'Declined',
  active: 'Active',
  renegotiating: 'Under renegotiation',
  archived: 'Archived',
  expired: 'Expired',
};

/** Statuses in which the agreement is in force (drawn as a solid graph edge). */
export function isInForce(status: CloudAgreementStatus): boolean {
  return status === 'active' || status === 'renegotiating';
}

/** Statuses from which no further negotiation is possible. */
export function isSettled(status: CloudAgreementStatus): boolean {
  return status === 'declined' || status === 'archived';
}

/** Statuses that still owe somebody a response. */
export function isAwaitingResponse(status: CloudAgreementStatus): boolean {
  return status === 'proposed' || status === 'countered' || status === 'renegotiating';
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Renewal date for a term starting on `startDate` (null for one-time work). */
export function computeRenewalDate(
  startDate: ISODate,
  cadence: CloudCadence,
  frequency: CloudFrequency | null,
): ISODate | null {
  if (cadence !== 'recurring' || !frequency) return null;
  return addDays(startDate, FREQUENCY_DAYS[frequency]);
}

/**
 * Roll a lapsed recurring agreement forward to its next renewal date.
 * Keeps stepping whole periods so a renewal six months late still lands on a
 * date in the future rather than one period behind "today".
 */
export function nextRenewalDate(
  current: ISODate | null,
  today: ISODate,
  cadence: CloudCadence,
  frequency: CloudFrequency | null,
): ISODate | null {
  if (cadence !== 'recurring' || !frequency) return null;
  const step = FREQUENCY_DAYS[frequency];
  let next = current ?? today;
  // Guard against a pathological clock: cap the loop at 1000 periods.
  for (let i = 0; i < 1000; i += 1) {
    next = addDays(next, step);
    if (next > today) return next;
  }
  return addDays(today, step);
}

/** Whole days until the renewal date (negative once lapsed). */
export function daysUntilRenewal(agreement: Pick<CloudAgreement, 'renewalDate'>, today: ISODate): number | null {
  if (!agreement.renewalDate) return null;
  return daysBetween(today, agreement.renewalDate);
}

// ---------------------------------------------------------------------------
// Negotiation flow
// ---------------------------------------------------------------------------

/**
 * Whose turn it is to answer. Always "the other pod", so a counter-proposal
 * hands the pen straight back and no pod can answer its own proposal.
 */
export function otherPodId(
  agreement: Pick<CloudAgreement, 'podAId' | 'podBId'>,
  podId: UUID,
): UUID {
  return podId === agreement.podAId ? agreement.podBId : agreement.podAId;
}

/**
 * Determine the pod that owes the next response after `actingPodId` takes an
 * action, or null when the agreement becomes settled.
 */
export function nextAwaitingPod(
  agreement: Pick<CloudAgreement, 'podAId' | 'podBId'>,
  actingPodId: UUID,
  action: 'counter' | 'renegotiate' | 'accept' | 'decline',
): UUID | null {
  switch (action) {
    case 'accept':
    case 'decline':
      return null;
    case 'counter':
    case 'renegotiate':
      return otherPodId(agreement, actingPodId);
    default:
      return null;
  }
}

/** Status set by each negotiation action. */
export function statusAfterAction(
  action: 'counter' | 'renegotiate' | 'accept' | 'decline',
): CloudAgreementStatus {
  switch (action) {
    case 'counter':
      return 'countered';
    case 'renegotiate':
      return 'renegotiating';
    case 'accept':
      return 'active';
    case 'decline':
      return 'declined';
    default:
      return 'proposed';
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** "Pod Atlas → Pod Basalt", naming the serving pod first. */
export function serviceFlow(
  direction: CloudDirection,
  podAName: string,
  podBName: string,
): { fromName: string; toName: string; fromIsPodA: boolean; bidirectional: boolean } {
  switch (direction) {
    case 'b_to_a':
      return { fromName: podBName, toName: podAName, fromIsPodA: false, bidirectional: false };
    case 'bidirectional':
      return { fromName: podAName, toName: podBName, fromIsPodA: true, bidirectional: true };
    case 'a_to_b':
    default:
      return { fromName: podAName, toName: podBName, fromIsPodA: true, bidirectional: false };
  }
}

/** One-line pricing summary for list rows and the review step. */
export function describePricing(pricing: CloudPricingTerms | null | undefined): string {
  if (!pricing || !pricing.model) return 'No internal transfer pricing set';
  const amount = pricing.amount?.trim();
  switch (pricing.model) {
    case 'fixed_fee':
      return amount ? `Fixed fee of ${amount}` : 'Fixed fee (amount not set)';
    case 'per_unit':
      return amount
        ? `${amount} per ${pricing.unit?.trim() || 'unit'}`
        : `Per ${pricing.unit?.trim() || 'unit'} (rate not set)`;
    case 'revenue_share':
      return amount ? `Revenue share of ${amount}` : 'Revenue share (percentage not set)';
    case 'other':
    default:
      return pricing.notes?.trim() || 'Pricing described in the terms';
  }
}

/** Cadence + frequency in one line, e.g. "Recurring · monthly". */
export function describeCadence(cadence: CloudCadence, frequency: CloudFrequency | null): string {
  if (cadence === 'one_time') return 'One-time';
  return frequency ? `Recurring · ${FREQUENCY_LABELS[frequency].toLowerCase()}` : 'Recurring';
}

// ---------------------------------------------------------------------------
// Network graph
// ---------------------------------------------------------------------------

export interface GraphPod {
  id: UUID;
  name: string;
  holdingId: UUID;
  holdingName: string;
  status: string;
}

export interface GraphAgreement {
  id: UUID;
  podAId: UUID;
  podBId: UUID;
  name: string;
  serviceDescription: string;
  direction: CloudDirection;
  status: CloudAgreementStatus;
  /** Needed to tell "in force" from "lapsed past its renewal date". */
  renewalDate?: ISODate | null;
}

export interface GraphNode {
  id: UUID;
  name: string;
  holdingId: UUID;
  holdingName: string;
  status: string;
  /** How many agreements in force this pod is part of. */
  agreementCount: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: UUID;
  agreementId: UUID;
  name: string;
  serviceLabel: string;
  direction: CloudDirection;
  kind: 'active' | 'renegotiating';
  /** The serving pod (arrow tail). */
  fromPodId: UUID;
  /** The receiving pod (arrow head). */
  toPodId: UUID;
  bidirectional: boolean;
  /** SVG path, bowed outwards so it never runs through the hub. */
  path: string;
  labelX: number;
  labelY: number;
}

/** A computed (never stored) dotted link to the shared platform hub. */
export interface GraphHubEdge {
  podId: UUID;
  path: string;
}

export interface AgreementGraph {
  hub: { id: string; name: string; subtitle: string; x: number; y: number; radius: number };
  nodes: GraphNode[];
  edges: GraphEdge[];
  hubEdges: GraphHubEdge[];
  width: number;
  height: number;
  nodeRadius: number;
}

export const HUB_NODE_ID = '__hub__';
export const HUB_LABEL = 'Platform & Budget Market';

const NODE_RADIUS = 30;
const HUB_RADIUS = 52;
const PADDING = 70;

/**
 * Build the network view.
 *
 * The teaching rule of Module 04 is enforced structurally: `hubEdges` is one
 * entry per pod, always, because *every* pod shares the platform and the budget
 * market. `edges` only ever contains real agreements. A pod therefore appears
 * connected to another pod if and only if a live CLOU exists between them —
 * there is no code path that can draw a direct line without one.
 */
/**
 * Is this agreement actually in force right now? A recurring agreement past its
 * renewal date has lapsed, so it must not be drawn as a live connection.
 */
export function isInForceOn(
  agreement: Pick<GraphAgreement, 'status' | 'renewalDate'>,
  today: ISODate,
): boolean {
  if (!isInForce(agreement.status)) return false;
  return displayStatus({ status: agreement.status, renewalDate: agreement.renewalDate ?? null }, today) !== 'expired';
}

export function computeAgreementGraph(input: {
  pods: GraphPod[];
  agreements: GraphAgreement[];
  today: ISODate;
}): AgreementGraph {
  const { pods, agreements, today } = input;

  const ordered = [...pods].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const count = ordered.length;

  const radius =
    count === 0
      ? 150
      : Math.max(150, Math.round((count * (NODE_RADIUS * 2 + 44)) / (2 * Math.PI)) + 40);

  const centre = { x: 0, y: 0 };

  const nodes: GraphNode[] = ordered.map((pod, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count);
    return {
      ...pod,
      agreementCount: agreements.filter(
        (agreement) =>
          isInForceOn(agreement, today) &&
          (agreement.podAId === pod.id || agreement.podBId === pod.id),
      ).length,
      x: round(centre.x + radius * Math.cos(angle)),
      y: round(centre.y + radius * Math.sin(angle)),
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));

  const edges: GraphEdge[] = [];
  for (const agreement of agreements) {
    if (!isInForceOn(agreement, today)) continue;
    const a = byId.get(agreement.podAId);
    const b = byId.get(agreement.podBId);
    if (!a || !b) continue;

    const flow = serviceFlow(agreement.direction, a.name, b.name);
    const from = flow.fromIsPodA ? a : b;
    const to = flow.fromIsPodA ? b : a;

    const geometry = bowedPath(from, to, centre, radius, NODE_RADIUS);

    edges.push({
      id: `edge-${agreement.id}`,
      agreementId: agreement.id,
      name: agreement.name,
      serviceLabel: oneLine(agreement.serviceDescription, 42),
      direction: agreement.direction,
      kind: agreement.status === 'renegotiating' ? 'renegotiating' : 'active',
      fromPodId: from.id,
      toPodId: to.id,
      bidirectional: flow.bidirectional,
      path: geometry.path,
      labelX: round(geometry.labelX),
      labelY: round(geometry.labelY),
    });
  }

  const hubEdges: GraphHubEdge[] = nodes.map((node) => ({
    podId: node.id,
    path: straightPath(node, centre, HUB_RADIUS, NODE_RADIUS),
  }));

  const extent = radius + NODE_RADIUS + PADDING;

  return {
    hub: {
      id: HUB_NODE_ID,
      name: HUB_LABEL,
      subtitle: 'Shared infrastructure — every pod is connected here',
      x: centre.x,
      y: centre.y,
      radius: HUB_RADIUS,
    },
    nodes,
    edges,
    hubEdges,
    width: extent * 2,
    height: extent * 2,
    nodeRadius: NODE_RADIUS,
  };
}

function bowedPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  centre: { x: number; y: number },
  radius: number,
  nodeRadius: number,
): { path: string; labelX: number; labelY: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  // Push the control point away from the hub so the chord bows outwards.
  let ox = midX - centre.x;
  let oy = midY - centre.y;
  let length = Math.hypot(ox, oy);
  if (length < 1) {
    // Perfectly opposed pods: the midpoint sits on the hub, so bow to the side.
    ox = -dy;
    oy = dx;
    length = Math.hypot(ox, oy) || 1;
  }
  const bulge = Math.max(24, radius * 0.28);
  const cx = midX + (ox / length) * bulge;
  const cy = midY + (oy / length) * bulge;

  // Trim both ends so the arrow meets the node's edge, not its centre.
  const start = trimPoint(from, { x: cx, y: cy }, nodeRadius + 3);
  const end = trimPoint(to, { x: cx, y: cy }, nodeRadius + 9);

  const labelX = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
  const labelY = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;

  return {
    path: `M ${round(start.x)} ${round(start.y)} Q ${round(cx)} ${round(cy)} ${round(end.x)} ${round(end.y)}`,
    labelX,
    labelY,
  };
}

/** Move `point` towards `towards` by `distance`. */
function trimPoint(
  point: { x: number; y: number },
  towards: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

function straightPath(
  node: { x: number; y: number },
  centre: { x: number; y: number },
  hubRadius: number,
  nodeRadius: number,
): string {
  const start = trimPoint(node, centre, nodeRadius + 2);
  const end = trimPoint(centre, node, hubRadius + 6);
  return `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
