/**
 * Strategic Hub persistence (Module 09): pilot programs, investor reports and
 * the external contact log.
 *
 * Note what is deliberately NOT here: anything that writes a pod's score,
 * budget or governance outcome. Those live in their own modules with their own
 * audited paths — the hub console reads them, it never edits them.
 */

import type { Queryable } from '../client';
import { insertOne, queryMany, queryOne } from '../client';
import type {
  ContactRelationshipType,
  CorrectionEntityType,
  CorrectionRecord,
  CorrectionStatus,
  ExternalContact,
  InvestorReport,
  PilotPhase,
  PilotPhaseState,
  PilotProgram,
  PilotSuccessCriteria,
  UUID,
} from '../../core/types';
import {
  toCorrectionRecord,
  toExternalContact,
  toInvestorReport,
  toPilotProgram,
} from './rows';

// --- pilot programs ---------------------------------------------------------

export interface CreatePilotInput {
  orgId: UUID;
  name: string;
  holdingId?: UUID | null;
  pilotPodId?: UUID | null;
}

export async function createPilotProgram(
  db: Queryable,
  input: CreatePilotInput,
): Promise<PilotProgram> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO pilot_program (org_id, name, holding_id, pilot_pod_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.orgId, input.name, input.holdingId ?? null, input.pilotPodId ?? null],
  );
  return toPilotProgram(row);
}

export async function getPilotProgram(db: Queryable, id: UUID): Promise<PilotProgram | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    'SELECT * FROM pilot_program WHERE id = $1',
    [id],
  );
  return row ? toPilotProgram(row) : null;
}

export async function listPilotPrograms(db: Queryable, orgId: UUID): Promise<PilotProgram[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM pilot_program WHERE org_id = $1 ORDER BY created_at DESC',
    [orgId],
  );
  return rows.map(toPilotProgram);
}

export async function updatePilotPhase(
  db: Queryable,
  id: UUID,
  input: { currentPhase?: PilotPhase; phaseStatus?: Partial<Record<PilotPhase, PilotPhaseState>> },
): Promise<PilotProgram | null> {
  const current = await getPilotProgram(db, id);
  if (!current) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.currentPhase !== undefined) {
    params.push(input.currentPhase);
    sets.push(`current_phase = $${params.length}`);
  }
  if (input.phaseStatus !== undefined) {
    params.push(JSON.stringify({ ...current.phaseStatus, ...input.phaseStatus }));
    sets.push(`phase_status = $${params.length}::jsonb`);
  }
  if (sets.length === 0) return current;

  params.push(id);
  const row = await queryOne<Record<string, unknown>>(
    db,
    `UPDATE pilot_program SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return row ? toPilotProgram(row) : null;
}

export async function updatePilotSuccessCriteria(
  db: Queryable,
  id: UUID,
  criteria: PilotSuccessCriteria,
): Promise<PilotProgram | null> {
  const current = await getPilotProgram(db, id);
  if (!current) return null;
  const row = await queryOne<Record<string, unknown>>(
    db,
    'UPDATE pilot_program SET success_criteria = $1::jsonb WHERE id = $2 RETURNING *',
    [JSON.stringify({ ...current.successCriteria, ...criteria }), id],
  );
  return row ? toPilotProgram(row) : null;
}

export async function setPilotPod(db: Queryable, id: UUID, podId: UUID): Promise<void> {
  await db.query('UPDATE pilot_program SET pilot_pod_id = $2 WHERE id = $1', [id, podId]);
}

export async function recordPilotDecision(
  db: Queryable,
  id: UUID,
  input: { decision: 'stop' | 'repeat' | 'expand'; lessonsLearned?: string | null },
): Promise<PilotProgram | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `UPDATE pilot_program
        SET decision = $2, decided_at = now(), lessons_learned = COALESCE($3, lessons_learned)
      WHERE id = $1 RETURNING *`,
    [id, input.decision, input.lessonsLearned ?? null],
  );
  return row ? toPilotProgram(row) : null;
}

// --- investor reports -------------------------------------------------------

export interface CreateInvestorReportInput {
  orgId: UUID;
  generatedBy: UUID | null;
  dateFrom: string;
  dateTo: string;
  scope: { holdingIds: UUID[]; podIds: UUID[] };
  metrics: Record<string, unknown>;
}

export async function createInvestorReport(
  db: Queryable,
  input: CreateInvestorReportInput,
): Promise<InvestorReport> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO investor_report (org_id, generated_by, date_from, date_to, scope, metrics)
     VALUES ($1, $2, $3::date, $4::date, $5::jsonb, $6::jsonb) RETURNING *`,
    [
      input.orgId,
      input.generatedBy,
      input.dateFrom,
      input.dateTo,
      JSON.stringify(input.scope),
      JSON.stringify(input.metrics),
    ],
  );
  return toInvestorReport(row);
}

export async function getInvestorReport(db: Queryable, id: UUID): Promise<InvestorReport | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    'SELECT * FROM investor_report WHERE id = $1',
    [id],
  );
  return row ? toInvestorReport(row) : null;
}

export async function listInvestorReports(
  db: Queryable,
  orgId: UUID,
  onlyPublished = false,
): Promise<InvestorReport[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    `SELECT * FROM investor_report WHERE org_id = $1 ${onlyPublished ? 'AND published = true' : ''}
      ORDER BY created_at DESC`,
    [orgId],
  );
  return rows.map(toInvestorReport);
}

export async function publishInvestorReport(db: Queryable, id: UUID): Promise<InvestorReport | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `UPDATE investor_report SET published = true, published_at = now()
      WHERE id = $1 RETURNING *`,
    [id],
  );
  return row ? toInvestorReport(row) : null;
}

// --- external contacts ------------------------------------------------------

export interface CreateContactInput {
  orgId: UUID;
  name: string;
  relationshipType: ContactRelationshipType;
  lastInteractionAt?: string | null;
  notes?: string | null;
}

export async function createExternalContact(
  db: Queryable,
  input: CreateContactInput,
): Promise<ExternalContact> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO external_contact (org_id, name, relationship_type, last_interaction_at, notes)
     VALUES ($1, $2, $3, $4::date, $5) RETURNING *`,
    [
      input.orgId,
      input.name,
      input.relationshipType,
      input.lastInteractionAt ?? null,
      input.notes ?? null,
    ],
  );
  return toExternalContact(row);
}

export async function listExternalContacts(db: Queryable, orgId: UUID): Promise<ExternalContact[]> {
  const rows = await queryMany<Record<string, unknown>>(
    db,
    'SELECT * FROM external_contact WHERE org_id = $1 ORDER BY name',
    [orgId],
  );
  return rows.map(toExternalContact);
}

export async function updateExternalContact(
  db: Queryable,
  id: UUID,
  input: { lastInteractionAt?: string | null; notes?: string | null },
): Promise<ExternalContact | null> {
  const row = await queryOne<Record<string, unknown>>(
    db,
    `UPDATE external_contact
        SET last_interaction_at = COALESCE($2::date, last_interaction_at),
            notes = COALESCE($3, notes)
      WHERE id = $1 RETURNING *`,
    [id, input.lastInteractionAt ?? null, input.notes ?? null],
  );
  return row ? toExternalContact(row) : null;
}

// --- correction records (13 §7) --------------------------------------------

export interface CreateCorrectionInput {
  orgId: UUID;
  originalEntityType: CorrectionEntityType;
  originalEntityId: UUID;
  fieldCorrected: string;
  originalValue: unknown;
  correctedValue: unknown;
  reason: string;
  proposedBy: UUID;
}

export async function createCorrectionRecord(
  db: Queryable,
  input: CreateCorrectionInput,
): Promise<CorrectionRecord> {
  const row = await insertOne<Record<string, unknown>>(
    db,
    `INSERT INTO correction_record
       (org_id, original_entity_type, original_entity_id, field_corrected,
        original_value, corrected_value, reason, proposed_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) RETURNING *`,
    [
      input.orgId,
      input.originalEntityType,
      input.originalEntityId,
      input.fieldCorrected,
      JSON.stringify(input.originalValue),
      JSON.stringify(input.correctedValue),
      input.reason,
      input.proposedBy,
    ],
  );
  return getCorrectionRecord(db, row.id as UUID) as Promise<CorrectionRecord>;
}

export async function getCorrectionRecord(
  db: Queryable,
  id: UUID,
): Promise<CorrectionRecord | null> {
  // The jsonb snapshots are read back as ::text: PGlite auto-parses jsonb into
  // JS values, which makes a bare string ("passed") indistinguishable from an
  // unparsed document and jsonField would then fail to re-parse it. Casting to
  // text keeps every value in one unambiguous JSON form.
  const row = await queryOne<Record<string, unknown>>(
    db,
    `SELECT c.id, c.org_id, c.original_entity_type, c.original_entity_id,
            c.field_corrected, c.original_value::text AS original_value,
            c.corrected_value::text AS corrected_value, c.reason,
            c.proposed_by, c.approved_by, c.status, c.decided_at, c.created_at,
            p.full_name AS proposed_by_name, a.full_name AS approved_by_name
       FROM correction_record c
       JOIN app_user p ON p.id = c.proposed_by
       LEFT JOIN app_user a ON a.id = c.approved_by
      WHERE c.id = $1`,
    [id],
  );
  return row
    ? toCorrectionRecord(row, row.proposed_by_name as string | null, row.approved_by_name as string | null)
    : null;
}

export async function listCorrectionRecords(
  db: Queryable,
  input: {
    orgId: UUID;
    entityType?: CorrectionEntityType;
    entityId?: UUID;
    status?: CorrectionStatus;
  },
): Promise<CorrectionRecord[]> {
  const clauses: string[] = ['c.org_id = $1'];
  const params: unknown[] = [input.orgId];
  if (input.entityType) {
    params.push(input.entityType);
    clauses.push(`c.original_entity_type = $${params.length}`);
  }
  if (input.entityId) {
    params.push(input.entityId);
    clauses.push(`c.original_entity_id = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    clauses.push(`c.status = $${params.length}`);
  }
  const rows = await queryMany<Record<string, unknown>>(
    db,
    // Every correctable record belongs to a pod (peer reviews through their
    // pitch). Resolving it here lets screens pair a correction with the pod
    // whose number changed, without N+1 lookups per row.
    `SELECT c.id, c.org_id, c.original_entity_type, c.original_entity_id,
            c.field_corrected, c.original_value::text AS original_value,
            c.corrected_value::text AS corrected_value, c.reason,
            c.proposed_by, c.approved_by, c.status, c.decided_at, c.created_at,
            p.full_name AS proposed_by_name, a.full_name AS approved_by_name,
            pod_.id AS pod_id, pod_.name AS pod_name
       FROM correction_record c
       JOIN app_user p ON p.id = c.proposed_by
       LEFT JOIN app_user a ON a.id = c.approved_by
       LEFT JOIN pod_budget_result br
         ON c.original_entity_type = 'budget_result' AND br.id = c.original_entity_id
       LEFT JOIN financial_sync_record fsr
         ON c.original_entity_type = 'financial_sync' AND fsr.id = c.original_entity_id
       LEFT JOIN entry_trial et
         ON c.original_entity_type = 'entry_trial' AND et.id = c.original_entity_id
       LEFT JOIN accountability_case ac
         ON c.original_entity_type = 'accountability_case' AND ac.id = c.original_entity_id
       LEFT JOIN peer_review pr
         ON c.original_entity_type = 'peer_review_score' AND pr.id = c.original_entity_id
       LEFT JOIN pitch pt ON pt.id = pr.pitch_id
       LEFT JOIN pod pod_
         ON pod_.id = COALESCE(br.pod_id, fsr.pod_id, et.pod_id, ac.pod_id, pt.pod_id)
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.created_at DESC`,
    params,
  );
  return rows.map((r) =>
    toCorrectionRecord(r, r.proposed_by_name as string | null, r.approved_by_name as string | null),
  );
}

export async function decideCorrectionRecord(
  db: Queryable,
  id: UUID,
  input: { status: 'approved' | 'rejected'; decidedBy: UUID },
): Promise<CorrectionRecord | null> {
  const row = await queryOne<{ id: UUID }>(
    db,
    `UPDATE correction_record
        SET status = $2, approved_by = CASE WHEN $2 = 'approved' THEN $3::uuid ELSE NULL END,
            decided_at = now()
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, input.status, input.decidedBy],
  );
  return row ? getCorrectionRecord(db, row.id) : null;
}
