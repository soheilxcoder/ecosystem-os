/**
 * Archive indexer (Module 10).
 *
 * Subscribes to the shared domain-event bus and writes an *index entry* for
 * every durable decision. An entry is a title, a summary and a pointer back to
 * the source module — never a copy of the record. Deep-links resolve to the
 * module of origin so search results and the live data cannot drift apart.
 *
 * Privacy: only transactional records are indexed. A coaching session's private
 * notes are not an indexable entity type and no event payload carries them, so
 * they can never appear in a search result.
 */

import type { Database } from '../../db/client';
import type { DomainEvent, EventBus } from '../../core/events';
import type { ISODate } from '../../core/time';
import type { ArchiveEntityType, UUID } from '../../core/types';
import { createArchiveEntry } from '../../db/repositories/archive';
import { getPitch, getPod } from '../../db/repositories/pods';
import { getAgreement } from '../../db/repositories/agreements';
import { getBudgetCycle } from '../../db/repositories/budget';
import { getOpenAccountabilityCase, getTrial, listRuleChanges } from '../../db/repositories/governance';

export interface ArchiveServiceContext {
  db: Database;
  today: () => ISODate;
}

interface ArchiveDraft {
  entityType: ArchiveEntityType;
  entityId: UUID | null;
  title: string;
  summary: string | null;
  podIds: UUID[];
  holdingId?: UUID | null;
  tags: string[];
  occurredAt: string | null;
}

function clip(text: string | null | undefined, max = 240): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Maps one domain event to an archive index draft, or null when the event is
 * not a durable, searchable record (e.g. a check-in or a transient proposal).
 */
export async function resolveArchiveDraft(
  context: ArchiveServiceContext,
  event: DomainEvent,
): Promise<ArchiveDraft | null> {
  const { db } = context;
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    // --- Pitches (Module 03/06): a submitted pitch is a cycle's headline. ---
    case 'pod.pitch_submitted':
    case 'pod.pitch_auto_submitted': {
      const podId = payload.podId as UUID | undefined;
      const cycleId = payload.cycleId as UUID | undefined;
      if (!podId || !cycleId) return null;
      const pod = await getPod(db, podId);
      const pitch = await getPitch(db, podId, cycleId);
      const auto = event.type === 'pod.pitch_auto_submitted';
      return {
        entityType: 'pitch',
        entityId: event.aggregateId ?? pitch?.id ?? null,
        title: `${pod?.name ?? 'Pod'} ${auto ? 'auto-submitted' : 'submitted'} its pitch`,
        summary: clip(pitch?.nextPlan ?? pitch?.previousSummary),
        podIds: [podId],
        holdingId: pod?.holdingId ?? null,
        tags: auto ? ['pitch', 'auto-submitted'] : ['pitch'],
        occurredAt: pitch?.submittedAt ?? event.occurredAt,
      };
    }

    // --- CLOU agreements (Module 04): accepted and renewed deals are records.
    case 'cloud.agreement_accepted':
    case 'cloud.agreement_renewed': {
      const agreementId = event.aggregateId;
      if (!agreementId) return null;
      const agreement = await getAgreement(db, agreementId);
      if (!agreement) return null;
      const renewed = event.type === 'cloud.agreement_renewed';
      return {
        entityType: 'cloud',
        entityId: agreementId,
        title: renewed ? `CLOU renewed: ${agreement.name}` : `CLOU accepted: ${agreement.name}`,
        summary: clip(`${agreement.podAName} ↔ ${agreement.podBName}`),
        podIds: [agreement.podAId, agreement.podBId],
        holdingId: agreement.podAHoldingId ?? null,
        tags: renewed ? ['clou', 'renewed'] : ['clou', 'accepted'],
        occurredAt: event.occurredAt,
      };
    }

    // --- Budget (Module 05): locking a cycle is the announcement. ---------
    case 'budget.cycle_locked': {
      const cycleId = event.aggregateId;
      if (!cycleId) return null;
      const cycle = await getBudgetCycle(db, cycleId);
      const n = (payload.cycleNumber as number | undefined) ?? cycle?.cycleNumber;
      return {
        entityType: 'budget_cycle',
        entityId: cycleId,
        title: n ? `Cycle ${n} budget locked` : 'Budget cycle locked',
        summary: 'Final allocatable budget and per-pod scores were announced.',
        podIds: [],
        holdingId: null,
        tags: ['budget'],
        occurredAt: event.occurredAt,
      };
    }

    // --- Governance (Module 08): cases, trials and rule changes are records.
    case 'governance.accountability_opened': {
      const podId = event.aggregateId;
      if (!podId) return null;
      const pod = await getPod(db, podId);
      const caseRow = await getOpenAccountabilityCase(db, podId);
      return {
        entityType: 'accountability_case',
        entityId: caseRow?.id ?? podId,
        title: `${pod?.name ?? 'Pod'} opened an Accountability Path case`,
        summary: 'A four-stage accountability case was opened for this pod.',
        podIds: [podId],
        holdingId: pod?.holdingId ?? null,
        tags: ['accountability'],
        occurredAt: event.occurredAt,
      };
    }

    case 'governance.entry_trial_started': {
      const podId = (payload.podId as UUID) ?? event.aggregateId;
      if (!podId) return null;
      const pod = await getPod(db, podId);
      const trialId = (payload.trialId as UUID) ?? null;
      const trial = trialId ? null : await getTrial(db, podId);
      return {
        entityType: 'entry_trial',
        entityId: trialId ?? trial?.id ?? podId,
        title: `${pod?.name ?? 'Pod'} began its 90-day entry trial`,
        summary: payload.dueDate ? `Decision due ${payload.dueDate}.` : null,
        podIds: [podId],
        holdingId: pod?.holdingId ?? null,
        tags: ['entry-trial'],
        occurredAt: event.occurredAt,
      };
    }

    case 'correction.approved': {
      const correctionId = (payload.correctionId as UUID) ?? event.aggregateId;
      if (!correctionId) return null;
      const field = payload.fieldCorrected as string | undefined;
      const entityType = payload.originalEntityType as string | undefined;
      return {
        entityType: 'correction',
        entityId: correctionId,
        title: `Correction approved: ${field ?? 'field'} on ${entityType ?? 'record'}`,
        summary: payload.reason ? String(payload.reason) : null,
        podIds: [],
        holdingId: null,
        tags: ['correction', entityType ?? 'record'],
        occurredAt: event.occurredAt,
      };
    }

    case 'hub.pod_launched': {
      const podId = (payload.podId as UUID) ?? event.aggregateId;
      if (!podId) return null;
      const pod = await getPod(db, podId);
      const name = (payload.name as string) ?? pod?.name ?? 'Pod';
      return {
        entityType: 'pod',
        entityId: podId,
        title: `${name} was launched from the Deployment Hub`,
        summary:
          'Created through the 5-step wizard with membership, coach and an entry trial assigned from day one.',
        podIds: [podId],
        holdingId: (payload.holdingId as UUID) ?? pod?.holdingId ?? null,
        tags: ['hub', 'deployment'],
        occurredAt: event.occurredAt,
      };
    }

    case 'governance.rule_change_proposed': {
      const orgId = event.orgId;
      const ruleName = payload.ruleName as string | undefined;
      if (!orgId || !ruleName) return null;
      const changes = await listRuleChanges(db, orgId, ruleName);
      const change = changes[0];
      return {
        entityType: 'rule_change',
        entityId: change?.id ?? null,
        title: `Rule change proposed: ${ruleName}`,
        summary: change?.justification ? clip(String(change.justification)) : null,
        podIds: [],
        holdingId: null,
        tags: ['rule-change', ruleName],
        occurredAt: event.occurredAt,
      };
    }

    default:
      return null;
  }
}

/** Indexes one event. Returns true when an entry was written. */
export async function indexEvent(
  context: ArchiveServiceContext,
  event: DomainEvent,
): Promise<boolean> {
  if (!event.orgId) return false;
  const draft = await resolveArchiveDraft(context, event);
  if (!draft) return false;

  const written = await createArchiveEntry(context.db, {
    orgId: event.orgId,
    entityType: draft.entityType,
    entityId: draft.entityId,
    title: draft.title,
    summary: draft.summary,
    podIds: draft.podIds,
    holdingId: draft.holdingId ?? null,
    tags: draft.tags,
    occurredAt: draft.occurredAt,
    sourceEventId: event.id,
  });
  return written !== null;
}

/**
 * Wires the indexer onto a bus. Returns the unsubscribe function.
 *
 * Awaited by the bus, so the index entry exists by the time the producing
 * action returns. Failures are logged, never rethrown: indexing must not break
 * the action it records.
 */
export function subscribeArchiveIndexer(
  bus: EventBus,
  context: ArchiveServiceContext,
): () => void {
  return bus.subscribe('*', async (event) => {
    try {
      await indexEvent(context, event);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[archive] indexing failed for "${event.type}"`, error);
    }
  });
}
