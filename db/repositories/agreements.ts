/**
 * CLOU agreement data access (Module 04).
 *
 * All reads return domain objects; all writes are single statements so the
 * service layer stays the only place that reasons about *when* an action is
 * allowed. The `cloud_agreement` CHECK constraints (non-empty service
 * description, no self-agreement, awaiting-pod consistency) mean an invalid
 * state cannot be persisted even if a caller forgets to validate.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  CloudAgreement,
  CloudAgreementEvent,
  CloudAgreementStatus,
  CloudArchiveConfirmation,
  CloudEventType,
  CloudTerms,
  UUID,
} from '../../core/types';
import type { ISODate } from '../../core/time';
import {
  toCloudAgreement,
  toCloudAgreementEvent,
  toCloudArchiveConfirmation,
  toDateString,
} from './rows';

export interface AgreementRow extends CloudAgreement {
  podAName: string;
  podBName: string;
  podAHoldingId: UUID;
  podBHoldingId: UUID;
  podAHoldingName: string;
  podBHoldingName: string;
}

const AGREEMENT_SELECT = `
  SELECT a.*,
         pa.name AS pod_a_name, pb.name AS pod_b_name,
         ha.id AS pod_a_holding_id, hb.id AS pod_b_holding_id,
         ha.name AS pod_a_holding_name, hb.name AS pod_b_holding_name
    FROM cloud_agreement a
    JOIN pod pa ON pa.id = a.pod_a_id
    JOIN pod pb ON pb.id = a.pod_b_id
    JOIN holding ha ON ha.id = pa.holding_id
    JOIN holding hb ON hb.id = pb.holding_id
`;

export interface CreateAgreementInput {
  orgId: UUID;
  podAId: UUID;
  podBId: UUID;
  terms: CloudTerms;
  status?: CloudAgreementStatus;
  awaitingPodId?: UUID | null;
  createdByUserId?: UUID | null;
  startDate?: ISODate | null;
  renewalDate?: ISODate | null;
  activatedAt?: boolean;
}

export async function createAgreement(
  db: Queryable,
  input: CreateAgreementInput,
): Promise<AgreementRow> {
  const row = await insertOne<{ id: string }>(
    db,
    `INSERT INTO cloud_agreement
       (org_id, pod_a_id, pod_b_id, name, service_description, direction, cadence,
        frequency, pricing_terms, status, awaiting_pod_id, created_by_user_id,
        start_date, renewal_date, activated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12,
             $13::date, $14::date, ${input.activatedAt ? 'now()' : 'NULL'})
     RETURNING *`,
    [
      input.orgId,
      input.podAId,
      input.podBId,
      input.terms.name,
      input.terms.serviceDescription,
      input.terms.direction,
      input.terms.cadence,
      input.terms.frequency,
      JSON.stringify(input.terms.pricingTerms),
      input.status ?? 'proposed',
      input.awaitingPodId ?? null,
      input.createdByUserId ?? null,
      input.startDate ?? null,
      input.renewalDate ?? null,
    ],
  );
  return getAgreement(db, row.id) as Promise<AgreementRow>;
}

export async function getAgreement(
  db: Queryable,
  agreementId: UUID,
): Promise<AgreementRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `${AGREEMENT_SELECT} WHERE a.id = $1`,
    [agreementId],
  );
  return row ? toRow(row) : null;
}

export interface ListAgreementsFilter {
  orgId: UUID;
  /** Restrict to agreements this pod is part of. */
  podId?: UUID | null;
  holdingId?: UUID | null;
  status?: CloudAgreementStatus | null;
  /** Agreements awaiting a response from this pod (the proposals inbox). */
  awaitingPodId?: UUID | null;
}

export async function listAgreements(
  db: Queryable,
  filter: ListAgreementsFilter,
): Promise<AgreementRow[]> {
  const where: string[] = ['a.org_id = $1'];
  const params: unknown[] = [filter.orgId];

  if (filter.podId) {
    params.push(filter.podId);
    where.push(`(a.pod_a_id = $${params.length} OR a.pod_b_id = $${params.length})`);
  }
  if (filter.holdingId) {
    params.push(filter.holdingId);
    where.push(`(ha.id = $${params.length} OR hb.id = $${params.length})`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filter.awaitingPodId) {
    params.push(filter.awaitingPodId);
    where.push(`a.awaiting_pod_id = $${params.length}`);
  }

  const rows = await queryMany<Record<string, unknown>>(
    db,
    `${AGREEMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.last_updated_at DESC, a.name`,
    params,
  );
  return rows.map(toRow);
}

export interface AgreementPatch {
  name?: string;
  serviceDescription?: string;
  direction?: CloudTerms['direction'];
  cadence?: CloudTerms['cadence'];
  frequency?: string | null;
  pricingTerms?: CloudTerms['pricingTerms'];
  status?: CloudAgreementStatus;
  awaitingPodId?: UUID | null;
  startDate?: ISODate | null;
  renewalDate?: ISODate | null;
  activate?: boolean;
}

/**
 * Apply a partial update. Only the columns present in `patch` are touched, so
 * a counter-proposal that changes one term cannot reset the others.
 */
export async function updateAgreement(
  db: Queryable,
  agreementId: UUID,
  patch: AgreementPatch,
): Promise<AgreementRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [agreementId];
  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (patch.name !== undefined) sets.push(`name = ${push(patch.name)}`);
  if (patch.serviceDescription !== undefined) {
    sets.push(`service_description = ${push(patch.serviceDescription)}`);
  }
  if (patch.direction !== undefined) sets.push(`direction = ${push(patch.direction)}`);
  if (patch.cadence !== undefined) sets.push(`cadence = ${push(patch.cadence)}`);
  if (patch.frequency !== undefined) sets.push(`frequency = ${push(patch.frequency)}`);
  if (patch.pricingTerms !== undefined) {
    sets.push(`pricing_terms = ${push(JSON.stringify(patch.pricingTerms))}::jsonb`);
  }
  if (patch.status !== undefined) sets.push(`status = ${push(patch.status)}`);
  if (patch.awaitingPodId !== undefined) sets.push(`awaiting_pod_id = ${push(patch.awaitingPodId)}`);
  if (patch.startDate !== undefined) sets.push(`start_date = ${push(patch.startDate)}::date`);
  if (patch.renewalDate !== undefined) sets.push(`renewal_date = ${push(patch.renewalDate)}::date`);
  if (patch.activate) sets.push('activated_at = COALESCE(activated_at, now())');

  if (sets.length === 0) return getAgreement(db, agreementId);

  params[0] = agreementId;
  await db.query(
    `UPDATE cloud_agreement SET ${sets.join(', ')} WHERE id = $1`,
    params,
  );
  return getAgreement(db, agreementId);
}

// --- activity log ----------------------------------------------------------

export interface InsertEventInput {
  agreementId: UUID;
  eventType: CloudEventType;
  actorUserId?: UUID | null;
  /** Snapshot of the terms after the action, for an auditable history. */
  terms?: Partial<CloudTerms> | null;
  note?: string | null;
}

export async function insertAgreementEvent(
  db: Queryable,
  input: InsertEventInput,
): Promise<CloudAgreementEvent> {
  return toCloudAgreementEvent(
    await insertOne(
      db,
      `INSERT INTO cloud_agreement_event (agreement_id, event_type, actor_user_id, terms, note)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [
        input.agreementId,
        input.eventType,
        input.actorUserId ?? null,
        input.terms ? JSON.stringify(input.terms) : null,
        input.note ?? null,
      ],
    ),
  );
}

export async function listAgreementEvents(
  db: Queryable,
  agreementId: UUID,
): Promise<Array<CloudAgreementEvent & { actorName: string | null }>> {
  const rows = await queryMany(
    db,
    `SELECT e.*, u.full_name AS actor_name
       FROM cloud_agreement_event e
       LEFT JOIN app_user u ON u.id = e.actor_user_id
      WHERE e.agreement_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [agreementId],
  );
  return rows.map((row) => ({
    ...toCloudAgreementEvent(row),
    actorName: (row as { actor_name?: string | null }).actor_name ?? null,
  }));
}

// --- two-party archive -----------------------------------------------------

export async function addArchiveConfirmation(
  db: Queryable,
  input: { agreementId: UUID; podId: UUID; confirmedByUserId: UUID; note?: string | null },
): Promise<CloudArchiveConfirmation> {
  return toCloudArchiveConfirmation(
    await insertOne(
      db,
      `INSERT INTO cloud_agreement_archive_confirmation
         (agreement_id, pod_id, confirmed_by_user_id, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agreement_id, pod_id) DO UPDATE
         SET confirmed_by_user_id = EXCLUDED.confirmed_by_user_id,
             note = EXCLUDED.note,
             created_at = now()
       RETURNING *`,
      [input.agreementId, input.podId, input.confirmedByUserId, input.note ?? null],
    ),
  );
}

export async function listArchiveConfirmations(
  db: Queryable,
  agreementId: UUID,
): Promise<Array<CloudArchiveConfirmation & { podName: string; confirmedByName: string | null }>> {
  const rows = await queryMany(
    db,
    `SELECT c.*, p.name AS pod_name, u.full_name AS confirmed_by_name
       FROM cloud_agreement_archive_confirmation c
       JOIN pod p ON p.id = c.pod_id
       LEFT JOIN app_user u ON u.id = c.confirmed_by_user_id
      WHERE c.agreement_id = $1
      ORDER BY c.created_at ASC`,
    [agreementId],
  );
  return rows.map((row) => ({
    ...toCloudArchiveConfirmation(row),
    podName: (row as { pod_name: string }).pod_name,
    confirmedByName: (row as { confirmed_by_name?: string | null }).confirmed_by_name ?? null,
  }));
}

// --- escalation contacts (resolved live, never stored) ---------------------

export interface EscalationContact {
  podId: UUID;
  userId: UUID;
  fullName: string;
  email: string;
  startDate: ISODate;
  endDate: ISODate | null;
}

/**
 * The current Pod Lead of each pod, read from the live role assignments.
 *
 * This is the Module 04 rule "escalation contact is always resolved live from
 * the current PodLeadTerm — never a static snapshot": a stored contact would
 * quietly keep pointing at somebody who has rotated out.
 */
export async function listEscalationContacts(
  db: Queryable,
  podIds: UUID[],
  today: ISODate,
): Promise<EscalationContact[]> {
  if (podIds.length === 0) return [];
  const placeholders = podIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await queryMany(
    db,
    `SELECT r.scope_id AS pod_id, u.id AS user_id, u.full_name, u.email,
            r.start_date, r.end_date
       FROM role_assignment r
       JOIN app_user u ON u.id = r.user_id
      WHERE r.role_type = 'pod_lead'
        AND r.scope_type = 'pod'
        AND r.scope_id IN (${placeholders})
        AND r.revoked_at IS NULL
        AND r.start_date <= $1::date
        AND (r.end_date IS NULL OR r.end_date >= $1::date)`,
    [today, ...podIds],
  );

  return rows.map((row) => ({
    podId: (row as { pod_id: string }).pod_id,
    userId: (row as { user_id: string }).user_id,
    fullName: (row as { full_name: string }).full_name,
    email: (row as { email: string }).email,
    startDate: toDateString((row as { start_date: unknown }).start_date),
    endDate:
      (row as { end_date: unknown }).end_date === null ||
      (row as { end_date: unknown }).end_date === undefined
        ? null
        : toDateString((row as { end_date: unknown }).end_date),
  }));
}

function toRow(row: Record<string, unknown>): AgreementRow {
  return {
    ...toCloudAgreement(row),
    podAName: row.pod_a_name as string,
    podBName: row.pod_b_name as string,
    podAHoldingId: row.pod_a_holding_id as UUID,
    podBHoldingId: row.pod_b_holding_id as UUID,
    podAHoldingName: row.pod_a_holding_name as string,
    podBHoldingName: row.pod_b_holding_name as string,
  };
}
