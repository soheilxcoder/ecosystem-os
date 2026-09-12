/**
 * CLOU agreements service (Module 04).
 *
 * The two rules that make this module more than CRUD are enforced here, on the
 * server, where a disabled button and a hand-crafted HTTP request look exactly
 * the same:
 *
 *  1. **No described exchange, no agreement.** `validateCloudTerms` runs on
 *     every write path; the wizard's guardrail is only the client-side mirror
 *     of it.
 *  2. **Ending an agreement takes two.** Archiving is a per-pod confirmation,
 *     and the status only flips when both sides have confirmed.
 *
 * Escalation contacts are never stored on the agreement — they are resolved
 * from the live `pod_lead` role assignment on every read, so a signed
 * agreement cannot keep pointing at someone who has rotated out.
 */

import type { Database } from '../../db/client';
import type { EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type { CloudTerms, UUID } from '../../core/types';
import {
  computeRenewalDate,
  displayStatus,
  isAwaitingResponse,
  isInForce,
  nextAwaitingPod,
  nextRenewalDate,
  normaliseTerms,
  otherPodId,
  validateCloudTerms,
  computeAgreementGraph,
  type CloudDisplayStatus,
  type AgreementGraph,
  type GraphAgreement,
  type GraphPod,
} from '../../core/agreements';
import {
  addArchiveConfirmation,
  createAgreement,
  getAgreement,
  listAgreementEvents,
  listAgreements,
  listArchiveConfirmations,
  listEscalationContacts,
  updateAgreement,
  insertAgreementEvent,
  type AgreementRow,
} from '../../db/repositories/agreements';
import { getPod, listPods } from '../../db/repositories/pods';
import { recordAudit } from '../../db/repositories/audit';
import { badRequest, forbidden, notFound } from '../errors';

export interface AgreementServiceContext {
  db: Database;
  bus: EventBus;
  today: () => ISODate;
}

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

/**
 * Confirm the actor currently holds the Pod Lead seat of the pod they claim to
 * act for.
 *
 * The route layer already ran `authorize('cloud.*')`; this is the second,
 * independent check — it reads the live rotation, so a seat that ended
 * yesterday cannot act today even if a caller passes a stale pod id.
 */
async function assertCurrentPodLead(
  context: AgreementServiceContext,
  podId: UUID,
  actorUserId: UUID,
): Promise<void> {
  const contacts = await listEscalationContacts(context.db, [podId], context.today());
  if (!contacts.some((contact) => contact.userId === actorUserId)) {
    throw forbidden(
      'Only the pod’s current Pod Lead can take this action — the seat rotates, so it must be resolved live',
      'not_current_pod_lead',
    );
  }
}

async function requireAgreement(
  context: AgreementServiceContext,
  agreementId: UUID,
): Promise<AgreementRow> {
  const agreement = await getAgreement(context.db, agreementId);
  if (!agreement) throw notFound('Agreement not found');
  return agreement;
}

function requireValidTerms(terms: Partial<CloudTerms>): CloudTerms {
  const validation = validateCloudTerms(terms);
  if (!validation.ok) {
    throw badRequest(validation.message ?? 'These agreement terms are not valid', 'invalid_terms');
  }
  return normaliseTerms(terms);
}

async function publish(
  context: AgreementServiceContext,
  type: string,
  input: { agreementId: UUID; orgId: UUID; actorUserId: UUID | null; payload: Record<string, unknown> },
): Promise<void> {
  await context.bus.publish({
    type,
    aggregateType: 'cloud_agreement',
    aggregateId: input.agreementId,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: input.payload,
  });
}

// ---------------------------------------------------------------------------
// Propose
// ---------------------------------------------------------------------------

export interface ProposeInput {
  orgId: UUID;
  /** The pod the acting Pod Lead leads — always pod A. */
  podAId: UUID;
  podBId: UUID;
  terms: Partial<CloudTerms>;
  actorUserId: UUID;
}

export async function proposeAgreement(
  context: AgreementServiceContext,
  input: ProposeInput,
): Promise<AgreementRow> {
  if (input.podAId === input.podBId) {
    throw badRequest('A CLOU is bilateral — choose a different counterparty pod', 'same_pod');
  }

  await assertCurrentPodLead(context, input.podAId, input.actorUserId);

  const [podA, podB] = await Promise.all([
    getPod(context.db, input.podAId),
    getPod(context.db, input.podBId),
  ]);
  if (!podA || !podB) throw notFound('One of the pods no longer exists');
  if (podA.orgId !== input.orgId || podB.orgId !== input.orgId) {
    throw forbidden('Both pods must belong to your organisation', 'cross_org_agreement');
  }

  // The headline rule of the module, enforced server-side.
  const terms = requireValidTerms({
    ...input.terms,
    name: input.terms.name?.trim() ? input.terms.name : defaultName(podA.name, podB.name, input.terms),
  });

  const agreement = await createAgreement(context.db, {
    orgId: input.orgId,
    podAId: input.podAId,
    podBId: input.podBId,
    terms,
    status: 'proposed',
    awaitingPodId: input.podBId,
    createdByUserId: input.actorUserId,
  });

  await insertAgreementEvent(context.db, {
    agreementId: agreement.id,
    eventType: 'proposed',
    actorUserId: input.actorUserId,
    terms,
    note: `Proposed to ${podB.name}`,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'cloud.agreement_proposed',
    entityType: 'cloud_agreement',
    entityId: agreement.id,
    metadata: { podAId: input.podAId, podBId: input.podBId, direction: terms.direction },
  });

  await publish(context, 'cloud.agreement_proposed', {
    agreementId: agreement.id,
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    payload: { podAId: input.podAId, podBId: input.podBId, name: agreement.name },
  });

  return agreement;
}

function defaultName(podAName: string, podBName: string, terms: Partial<CloudTerms>): string {
  const service = (terms.serviceDescription ?? '').trim().replace(/\s+/g, ' ');
  const short = service.length > 48 ? `${service.slice(0, 47).trimEnd()}…` : service;
  return short ? `${podAName} ↔ ${podBName} — ${short}` : `${podAName} ↔ ${podBName}`;
}

// ---------------------------------------------------------------------------
// Respond: accept / decline / counter
// ---------------------------------------------------------------------------

export type ResponseDecision = 'accept' | 'decline' | 'counter';

export interface RespondInput {
  agreementId: UUID;
  actorUserId: UUID;
  actorPodId: UUID;
  decision: ResponseDecision;
  /** Required (and used) only when countering. */
  terms?: Partial<CloudTerms>;
  /** Required when declining: no silent rejections. */
  note?: string | null;
}

export async function respondToAgreement(
  context: AgreementServiceContext,
  input: RespondInput,
): Promise<AgreementRow> {
  const agreement = await requireAgreement(context, input.agreementId);

  if (!isAwaitingResponse(agreement.status)) {
    throw badRequest(
      `This proposal has already been answered (status: ${agreement.status})`,
      'already_answered',
    );
  }
  if (agreement.awaitingPodId !== input.actorPodId) {
    throw forbidden(
      `It is ${agreement.awaitingPodId === agreement.podAId ? 'the proposing' : 'the counterparty'} pod’s turn to respond`,
      'not_your_turn',
    );
  }

  await assertCurrentPodLead(context, input.actorPodId, input.actorUserId);

  const today = context.today();

  if (input.decision === 'accept') {
    const startDate = agreement.startDate ?? today;
    const renewalDate = computeRenewalDate(startDate, agreement.cadence, agreement.frequency);

    const updated = await updateAgreement(context.db, agreement.id, {
      status: 'active',
      awaitingPodId: null,
      startDate,
      renewalDate,
      activate: true,
    });

    await insertAgreementEvent(context.db, {
      agreementId: agreement.id,
      eventType: 'accepted',
      actorUserId: input.actorUserId,
      terms: currentTerms(updated ?? agreement),
      note: input.note?.trim() || null,
    });

    await recordAudit(context.db, {
      actorUserId: input.actorUserId,
      action: 'cloud.agreement_accepted',
      entityType: 'cloud_agreement',
      entityId: agreement.id,
      metadata: { podId: input.actorPodId, startDate, renewalDate },
    });

    await publish(context, 'cloud.agreement_accepted', {
      agreementId: agreement.id,
      orgId: agreement.orgId,
      actorUserId: input.actorUserId,
      payload: { podId: input.actorPodId, startDate, renewalDate },
    });

    return updated ?? agreement;
  }

  if (input.decision === 'decline') {
    const reason = (input.note ?? '').trim();
    if (!reason) {
      throw badRequest(
        'A decline needs a one-line reason — the proposing pod sees it, so silent rejections are not possible',
        'reason_required',
      );
    }

    const updated = await updateAgreement(context.db, agreement.id, {
      status: 'declined',
      awaitingPodId: null,
    });

    await insertAgreementEvent(context.db, {
      agreementId: agreement.id,
      eventType: 'declined',
      actorUserId: input.actorUserId,
      terms: currentTerms(agreement),
      note: reason,
    });

    await recordAudit(context.db, {
      actorUserId: input.actorUserId,
      action: 'cloud.agreement_declined',
      entityType: 'cloud_agreement',
      entityId: agreement.id,
      metadata: { podId: input.actorPodId },
    });

    await publish(context, 'cloud.agreement_declined', {
      agreementId: agreement.id,
      orgId: agreement.orgId,
      actorUserId: input.actorUserId,
      payload: { podId: input.actorPodId, reason },
    });

    return updated ?? agreement;
  }

  // counter
  const terms = requireValidTerms(input.terms ?? {});
  const awaitingPodId = nextAwaitingPod(agreement, input.actorPodId, 'counter');

  const updated = await updateAgreement(context.db, agreement.id, {
    ...termsToPatch(terms),
    status: 'countered',
    awaitingPodId,
  });

  await insertAgreementEvent(context.db, {
    agreementId: agreement.id,
    eventType: 'countered',
    actorUserId: input.actorUserId,
    terms,
    note: input.note?.trim() || null,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'cloud.agreement_countered',
    entityType: 'cloud_agreement',
    entityId: agreement.id,
    metadata: { podId: input.actorPodId, awaitingPodId },
  });

  await publish(context, 'cloud.agreement_countered', {
    agreementId: agreement.id,
    orgId: agreement.orgId,
    actorUserId: input.actorUserId,
    payload: { podId: input.actorPodId, awaitingPodId },
  });

  return updated ?? agreement;
}

// ---------------------------------------------------------------------------
// Renegotiation of a live agreement
// ---------------------------------------------------------------------------

export async function requestRenegotiation(
  context: AgreementServiceContext,
  input: { agreementId: UUID; actorUserId: UUID; actorPodId: UUID; terms: Partial<CloudTerms>; note?: string | null },
): Promise<AgreementRow> {
  const agreement = await requireAgreement(context, input.agreementId);
  if (!isInForce(agreement.status)) {
    throw badRequest(
      'Only an agreement that is in force can be renegotiated',
      'not_in_force',
    );
  }
  if (input.actorPodId !== agreement.podAId && input.actorPodId !== agreement.podBId) {
    throw forbidden('Only the two pods in this agreement can renegotiate it', 'not_a_party');
  }

  await assertCurrentPodLead(context, input.actorPodId, input.actorUserId);

  const terms = requireValidTerms({
    ...currentTerms(agreement),
    ...input.terms,
    serviceDescription: input.terms.serviceDescription ?? agreement.serviceDescription,
  });

  const awaitingPodId = nextAwaitingPod(agreement, input.actorPodId, 'renegotiate');

  const updated = await updateAgreement(context.db, agreement.id, {
    ...termsToPatch(terms),
    status: 'renegotiating',
    awaitingPodId,
  });

  await insertAgreementEvent(context.db, {
    agreementId: agreement.id,
    eventType: 'renegotiated',
    actorUserId: input.actorUserId,
    terms,
    note: input.note?.trim() || null,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'cloud.agreement_renegotiated',
    entityType: 'cloud_agreement',
    entityId: agreement.id,
    metadata: { podId: input.actorPodId, awaitingPodId },
  });

  await publish(context, 'cloud.agreement_renegotiated', {
    agreementId: agreement.id,
    orgId: agreement.orgId,
    actorUserId: input.actorUserId,
    payload: { podId: input.actorPodId, awaitingPodId },
  });

  return updated ?? agreement;
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

export async function renewAgreement(
  context: AgreementServiceContext,
  input: { agreementId: UUID; actorUserId: UUID; actorPodId: UUID },
): Promise<AgreementRow> {
  const agreement = await requireAgreement(context, input.agreementId);
  if (agreement.status !== 'active') {
    throw badRequest('Only an active agreement can be renewed', 'not_active');
  }
  if (!agreement.renewalDate) {
    throw badRequest('One-time agreements are not renewed — archive them when the work is done');
  }
  if (input.actorPodId !== agreement.podAId && input.actorPodId !== agreement.podBId) {
    throw forbidden('Only the two pods in this agreement can renew it', 'not_a_party');
  }

  await assertCurrentPodLead(context, input.actorPodId, input.actorUserId);

  const today = context.today();
  const renewalDate = nextRenewalDate(agreement.renewalDate, today, agreement.cadence, agreement.frequency);
  if (!renewalDate) {
    throw badRequest('Only a recurring agreement can be renewed');
  }

  const updated = await updateAgreement(context.db, agreement.id, { renewalDate });

  await insertAgreementEvent(context.db, {
    agreementId: agreement.id,
    eventType: 'renewed',
    actorUserId: input.actorUserId,
    terms: currentTerms(agreement),
    note: `Renewed until ${renewalDate}`,
  });

  await recordAudit(context.db, {
    actorUserId: input.actorUserId,
    action: 'cloud.agreement_renewed',
    entityType: 'cloud_agreement',
    entityId: agreement.id,
    metadata: { podId: input.actorPodId, renewalDate, previous: agreement.renewalDate },
  });

  await publish(context, 'cloud.agreement_renewed', {
    agreementId: agreement.id,
    orgId: agreement.orgId,
    actorUserId: input.actorUserId,
    payload: { renewalDate, previous: agreement.renewalDate },
  });

  return updated ?? agreement;
}

// ---------------------------------------------------------------------------
// Archive — two-party confirmation
// ---------------------------------------------------------------------------

export async function confirmArchive(
  context: AgreementServiceContext,
  input: { agreementId: UUID; actorUserId: UUID; actorPodId: UUID; note?: string | null },
): Promise<{ agreement: AgreementRow; confirmations: UUID[]; archived: boolean }> {
  const agreement = await requireAgreement(context, input.agreementId);
  if (!isInForce(agreement.status)) {
    throw badRequest('Only an agreement that is in force can be archived', 'not_in_force');
  }
  if (input.actorPodId !== agreement.podAId && input.actorPodId !== agreement.podBId) {
    throw forbidden('Only the two pods in this agreement can archive it', 'not_a_party');
  }

  await assertCurrentPodLead(context, input.actorPodId, input.actorUserId);

  await addArchiveConfirmation(context.db, {
    agreementId: agreement.id,
    podId: input.actorPodId,
    confirmedByUserId: input.actorUserId,
    note: input.note?.trim() || null,
  });

  const confirmations = await listArchiveConfirmations(context.db, agreement.id);
  const pods = new Set(confirmations.map((row) => row.podId));
  const bothSides = pods.has(agreement.podAId) && pods.has(agreement.podBId);

  let current = agreement;
  if (bothSides) {
    const archived = await updateAgreement(context.db, agreement.id, {
      status: 'archived',
      awaitingPodId: null,
    });
    current = archived ?? agreement;

    await insertAgreementEvent(context.db, {
      agreementId: agreement.id,
      eventType: 'archived',
      actorUserId: input.actorUserId,
      terms: currentTerms(agreement),
      note: 'Both pods confirmed the end of this agreement',
    });

    await recordAudit(context.db, {
      actorUserId: input.actorUserId,
      action: 'cloud.agreement_archived',
      entityType: 'cloud_agreement',
      entityId: agreement.id,
      metadata: { podId: input.actorPodId },
    });

    await publish(context, 'cloud.agreement_archived', {
      agreementId: agreement.id,
      orgId: agreement.orgId,
      actorUserId: input.actorUserId,
      payload: { confirmedBy: confirmations.map((row) => row.podId) },
    });
  } else {
    await recordAudit(context.db, {
      actorUserId: input.actorUserId,
      action: 'cloud.archive_confirmed',
      entityType: 'cloud_agreement',
      entityId: agreement.id,
      metadata: { podId: input.actorPodId, pending: bothSides ? null : otherPodId(agreement, input.actorPodId) },
    });
  }

  return {
    agreement: current,
    confirmations: [...pods],
    archived: bothSides,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface AgreementListView {
  id: UUID;
  name: string;
  serviceDescription: string;
  direction: AgreementRow['direction'];
  cadence: AgreementRow['cadence'];
  frequency: AgreementRow['frequency'];
  pricingTerms: AgreementRow['pricingTerms'];
  status: AgreementRow['status'];
  displayStatus: CloudDisplayStatus;
  awaitingPodId: UUID | null;
  podAId: UUID;
  podBId: UUID;
  podAName: string;
  podBName: string;
  podAHoldingId: UUID;
  podBHoldingId: UUID;
  podAHoldingName: string;
  podBHoldingName: string;
  startDate: ISODate | null;
  renewalDate: ISODate | null;
  updatedAt: string;
}

export async function listAgreementViews(
  context: AgreementServiceContext,
  filter: { orgId: UUID; podId?: UUID | null; holdingId?: UUID | null; status?: string | null },
): Promise<AgreementListView[]> {
  const status = filter.status && isStatus(filter.status) ? filter.status : null;
  const rows = await listAgreements(context.db, {
    orgId: filter.orgId,
    podId: filter.podId ?? null,
    holdingId: filter.holdingId ?? null,
    status,
  });
  const today = context.today();
  return rows.map((row) => toListView(row, today));
}

export async function getInbox(
  context: AgreementServiceContext,
  orgId: UUID,
  podId: UUID,
): Promise<AgreementListView[]> {
  const rows = await listAgreements(context.db, { orgId, awaitingPodId: podId });
  const today = context.today();
  return rows.map((row) => toListView(row, today));
}

export interface AgreementDetail {
  agreement: AgreementListView;
  events: Array<{
    id: UUID;
    eventType: string;
    actorUserId: UUID | null;
    actorName: string | null;
    note: string | null;
    terms: Partial<CloudTerms> | null;
    createdAt: string;
  }>;
  escalation: Array<{
    podId: UUID;
    podName: string;
    role: string;
    userId: UUID;
    fullName: string;
    email: string;
    startDate: ISODate;
    endDate: ISODate | null;
  }>;
  archiveConfirmations: Array<{
    podId: UUID;
    podName: string;
    confirmedByUserId: UUID | null;
    confirmedByName: string | null;
    createdAt: string;
  }>;
  viewerPodIds: UUID[];
}

export async function getAgreementDetail(
  context: AgreementServiceContext,
  agreementId: UUID,
  viewerPodIds: UUID[],
): Promise<AgreementDetail> {
  const agreement = await requireAgreement(context, agreementId);
  const [events, confirmations, contacts] = await Promise.all([
    listAgreementEvents(context.db, agreementId),
    listArchiveConfirmations(context.db, agreementId),
    listEscalationContacts(context.db, [agreement.podAId, agreement.podBId], context.today()),
  ]);

  const contactByPod = new Map(contacts.map((contact) => [contact.podId, contact]));

  const escalation = ([
    { podId: agreement.podAId, podName: agreement.podAName },
    { podId: agreement.podBId, podName: agreement.podBName },
  ] as const).map(({ podId, podName }) => {
    const contact = contactByPod.get(podId);
    return {
      podId,
      podName,
      role: 'Pod Lead',
      userId: contact?.userId ?? '',
      fullName: contact?.fullName ?? '',
      email: contact?.email ?? '',
      startDate: contact?.startDate ?? '',
      endDate: contact?.endDate ?? null,
    };
  });

  return {
    agreement: toListView(agreement, context.today()),
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      note: event.note,
      terms: event.terms,
      createdAt: event.createdAt,
    })),
    escalation,
    archiveConfirmations: confirmations.map((row) => ({
      podId: row.podId,
      podName: row.podName,
      confirmedByUserId: row.confirmedByUserId,
      confirmedByName: row.confirmedByName,
      createdAt: row.createdAt,
    })),
    viewerPodIds,
  };
}

export interface GraphView extends AgreementGraph {
  /** Pod the viewer filtered to, highlighted on the canvas. */
  focusPodId?: UUID;
  /** Pod ids the viewer can act for (highlighted in the UI). */
  viewerPodIds: UUID[];
  /** Agreements in force, for the caption under the canvas. */
  activeCount: number;
  /** Pods with no agreement at all — the point the graph teaches. */
  unconnectedPodIds: UUID[];
}

export async function getAgreementGraph(
  context: AgreementServiceContext,
  orgId: UUID,
  focusPodId: UUID | null,
  viewerPodIds: UUID[],
): Promise<GraphView> {
  const [pods, agreements] = await Promise.all([
    listPods(context.db, orgId),
    listAgreements(context.db, { orgId }),
  ]);

  const graphPods: GraphPod[] = pods.map((pod) => ({
    id: pod.id,
    name: pod.name,
    holdingId: pod.holdingId,
    holdingName: pod.holdingName,
    status: pod.status,
  }));

  const graphAgreements: GraphAgreement[] = agreements.map((agreement) => ({
    id: agreement.id,
    podAId: agreement.podAId,
    podBId: agreement.podBId,
    name: agreement.name,
    serviceDescription: agreement.serviceDescription,
    direction: agreement.direction,
    status: agreement.status,
    renewalDate: agreement.renewalDate,
  }));

  const graph = computeAgreementGraph({
    pods: graphPods,
    agreements: graphAgreements,
    today: context.today(),
  });

  return {
    ...graph,
    viewerPodIds,
    ...(focusPodId ? { focusPodId } : {}),
    activeCount: graph.edges.length,
    unconnectedPodIds: graph.nodes.filter((node) => node.agreementCount === 0).map((node) => node.id),
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function toListView(row: AgreementRow, today: ISODate): AgreementListView {
  return {
    id: row.id,
    name: row.name,
    serviceDescription: row.serviceDescription,
    direction: row.direction,
    cadence: row.cadence,
    frequency: row.frequency,
    pricingTerms: row.pricingTerms,
    status: row.status,
    displayStatus: displayStatus(row, today),
    awaitingPodId: row.awaitingPodId,
    podAId: row.podAId,
    podBId: row.podBId,
    podAName: row.podAName,
    podBName: row.podBName,
    podAHoldingId: row.podAHoldingId,
    podBHoldingId: row.podBHoldingId,
    podAHoldingName: row.podAHoldingName,
    podBHoldingName: row.podBHoldingName,
    startDate: row.startDate,
    renewalDate: row.renewalDate,
    updatedAt: row.updatedAt,
  };
}

function currentTerms(agreement: AgreementRow): CloudTerms {
  return {
    name: agreement.name,
    serviceDescription: agreement.serviceDescription,
    direction: agreement.direction,
    cadence: agreement.cadence,
    frequency: agreement.frequency,
    pricingTerms: agreement.pricingTerms,
  };
}

function termsToPatch(terms: CloudTerms) {
  return {
    name: terms.name,
    serviceDescription: terms.serviceDescription,
    direction: terms.direction,
    cadence: terms.cadence,
    frequency: terms.frequency,
    pricingTerms: terms.pricingTerms,
  };
}

function isStatus(value: string): value is AgreementRow['status'] {
  return ['proposed', 'countered', 'declined', 'active', 'renegotiating', 'archived'].includes(value);
}
